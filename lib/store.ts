"use client"

import { create } from "zustand"
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware"
import { format } from "date-fns"
import type {
  Category,
  CalendarData,
  CalendarDay,
  Chapter,
  MindNode,
  MindEdge,
  SolutionStatus,
  TemplateType,
  CategoryConfig,
  Settings,
  DefaultView,
  ShortcutAction,
  ShortcutBinding,
  ConnectResult,
  Conversation,
  AIChatMessage,
  AIModelEntry,
  Contribution,
  ContributionType,
  NotificationItem,
  NotificationLogEntry,
  MindmapViewport,
  RelationFamily,
  IssueQueueItem,
  IssueQueueColumn,
  BackupSections,
  BackupSectionId,
  Person,
  FestivalDef,
} from "./types"
import { DEFAULT_SETTINGS, CONTRIBUTION_AMOUNT, normalizeNotificationRepos, normalizeNotificationChannels, normalizeQqRelayUrl, normalizeProfileWidgetOrder, BUILTIN_TODO_RELATIONS_CATEGORY_ID, type AIPersona } from "./types"
import { AI_PROVIDERS } from "@/lib/ai/providers"
import { normalizeDayStartOffset, parseDayStartOffset, todayKey } from "./contributions"
import { imageIdsInText } from "./image-refs"

/**
 * 人设迁移：把旧存档/旧备份里的单一 `aiPersona` 字符串升级为多人人设列表。
 * - aiPersonas 已有数据 → 原样保留；aiActivePersonaId 指向不存在的人设时复位为 null。
 * - aiPersonas 为空且旧 aiPersona 非空 → 生成一条「默认人设」并设为当前。
 * 返回最终应写入 settings 的 { aiPersonas, aiActivePersonaId }。
 */
function migratePersona(rawSettings: Record<string, unknown>): {
  aiPersonas: AIPersona[]
  aiActivePersonaId: string | null
} {
  let aiPersonas: AIPersona[] = Array.isArray(rawSettings.aiPersonas)
    ? (rawSettings.aiPersonas as AIPersona[])
    : []
  let aiActivePersonaId: string | null =
    typeof rawSettings.aiActivePersonaId === "string" ? rawSettings.aiActivePersonaId : null

  if (aiPersonas.length === 0) {
    const legacy =
      typeof rawSettings.aiPersona === "string" ? rawSettings.aiPersona.trim() : ""
    if (legacy) {
      const id = `p_${Date.now().toString(36)}`
      aiPersonas = [{ id, name: "默认人设", content: legacy }]
      aiActivePersonaId = id
    }
  }
  // 选中的人设若不存在，复位为 null（仅用基础提示词）。
  if (aiActivePersonaId && !aiPersonas.some((p) => p.id === aiActivePersonaId)) {
    aiActivePersonaId = null
  }
  return { aiPersonas, aiActivePersonaId }
}

const uid = () => Math.random().toString(36).slice(2, 10)

const emptyDay = (): CalendarDay => ({ note: "", todos: [], events: [] })

/** 按 id 合并两个数组：备份项覆盖同 id 项，新 id 追加 */
function mergeById<T extends { id: string }>(a: T[], b: T[]): T[] {
  const m = new Map<string, T>()
  for (const x of a) m.set(x.id, x)
  for (const x of b) m.set(x.id, x)
  return [...m.values()]
}

// 旧版思维导图节点无 createdAt / completedAt 字段；统一默认时间（用户指定：2026/8/31 02:00:00 GMT+8）。
const LEGACY_NODE_TIME = new Date("2026-08-31T02:00:00+08:00").getTime()

// 为旧存档/旧备份中缺失 createdAt / completedAt 的节点补齐默认值（并在加载时写回持久化）。
// 约定：字段为 undefined = 旧数据缺失 → 补齐 LEGACY_NODE_TIME；字段为 null = 明确「未完成」→ 保留。
function normalizeMindNodes(raw: unknown): MindNode[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((n) => n && typeof n === "object" && typeof (n as MindNode).id === "string")
    .map((n) => {
      const node = { ...(n as MindNode) }
      if (typeof node.createdAt !== "number") {
        node.createdAt = LEGACY_NODE_TIME
      }
      if (node.completedAt === undefined) {
        node.completedAt = LEGACY_NODE_TIME
      }
      return node
    })
}

// ---- 关系族（TODO 54）：旧版 Category.relation + mindmapViewports → relationFamilies 迁移 ----

/** 迁移 / 新建默认族的统一命名 */
const DEFAULT_FAMILY_NAME = "我的分类"

/** 默认族稳定 id：`fam_${categoryId}`（同一分类的迁移/兜底默认族固定此 id，避免重复补建） */
function defaultFamilyId(categoryId: string): string {
  return `fam_${categoryId}`
}

function isValidViewport(v: unknown): v is MindmapViewport {
  if (!v || typeof v !== "object") return false
  const p = v as Record<string, unknown>
  return (
    typeof p.x === "number" && Number.isFinite(p.x) &&
    typeof p.y === "number" && Number.isFinite(p.y) &&
    typeof p.zoom === "number" && Number.isFinite(p.zoom)
  )
}

function makeEmptyFamily(categoryId: string, name = DEFAULT_FAMILY_NAME): RelationFamily {
  return { id: defaultFamilyId(categoryId), name, categoryId, nodes: [], edges: [], view: "mindmap" }
}

/** 族规范化：id 必须非空字符串、categoryId 必须可归属，坏值兜底（nodes/edges/view/name/viewport） */
function normalizeFamily(raw: unknown, fallbackCategoryId: string): RelationFamily | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== "string" || !r.id) return null
  const categoryId =
    typeof r.categoryId === "string" && r.categoryId ? r.categoryId : fallbackCategoryId
  if (!categoryId) return null
  const viewport = isValidViewport(r.viewport) ? r.viewport : undefined
  return {
    id: r.id,
    name: typeof r.name === "string" && r.name.trim() ? r.name : DEFAULT_FAMILY_NAME,
    categoryId,
    nodes: normalizeMindNodes(r.nodes),
    edges: Array.isArray(r.edges) ? (r.edges as MindEdge[]) : [],
    view: r.view === "list" ? "list" : "mindmap",
    ...(viewport ? { viewport } : {}),
  }
}

/**
 * 关系族总迁移（TODO 54）：persist merge / 备份导入（替换 / 合并）三处共用。
 * - 新格式 relationFamilies（Record）逐条规范化，坏值兜底；categoryId 指向不存在分类的孤儿族丢弃。
 * - 旧格式：categories[].relation（单图）迁移为每分类一个默认族「我的分类」（id 稳定 `fam_${catId}`），
 *   viewport 取 legacyViewports[catId]；迁移后删除 Category.relation 键，mindmapViewports 整体废弃。
 * - 兜底：每个 relation 分类至少一个族；内建「待办事项」分类缺失则自动补建（含默认族）。
 */
function migrateRelationState(
  rawCategories: unknown,
  rawFamilies: unknown,
  legacyViewports: unknown,
): { categories: Category[]; relationFamilies: Record<string, RelationFamily> } {
  const categories: Category[] = Array.isArray(rawCategories)
    ? (rawCategories as Category[]).filter(
        (c) => c && typeof c === "object" && typeof c.id === "string"
      )
    : []
  const families: Record<string, RelationFamily> = {}
  if (rawFamilies && typeof rawFamilies === "object" && !Array.isArray(rawFamilies)) {
    for (const val of Object.values(rawFamilies as Record<string, unknown>)) {
      const fam = normalizeFamily(val, "")
      if (fam) families[fam.id] = fam
    }
  }
  const catIds = new Set(categories.map((c) => c.id))
  // 孤儿族（归属分类已不存在）丢弃，避免占据存储且无处显示
  for (const [id, fam] of Object.entries(families)) {
    if (!catIds.has(fam.categoryId)) delete families[id]
  }
  // 旧格式迁移：Category.relation 单图 → 默认族（viewport 取 mindmapViewports[catId]）
  for (const c of categories) {
    const raw = c as unknown as Record<string, unknown>
    if (!("relation" in raw)) continue
    const legacy = raw.relation
    const famId = defaultFamilyId(c.id)
    if (legacy && typeof legacy === "object" && !families[famId]) {
      const l = legacy as Record<string, unknown>
      const lv =
        legacyViewports && typeof legacyViewports === "object"
          ? (legacyViewports as Record<string, unknown>)[c.id]
          : undefined
      const migrated = normalizeFamily(
        { id: famId, name: DEFAULT_FAMILY_NAME, categoryId: c.id, nodes: l.nodes, edges: l.edges, view: l.view, viewport: lv },
        c.id
      )
      if (migrated) families[famId] = migrated
    }
    delete raw.relation
  }
  // 兜底：每个 relation 分类至少一个族（空分类 / 迁移失败补默认空族）
  for (const c of categories) {
    if (c.template !== "relation") continue
    if (!Object.values(families).some((f) => f.categoryId === c.id)) {
      families[defaultFamilyId(c.id)] = makeEmptyFamily(c.id)
    }
  }
  // 内建「待办事项」relation 分类缺失则补建（含默认族「我的分类」）
  if (!catIds.has(BUILTIN_TODO_RELATIONS_CATEGORY_ID)) {
    categories.push({
      id: BUILTIN_TODO_RELATIONS_CATEGORY_ID,
      name: "待办事项",
      template: "relation",
      icon: "Workflow",
      config: {},
      builtin: true,
    })
  }
  if (
    !Object.values(families).some((f) => f.categoryId === BUILTIN_TODO_RELATIONS_CATEGORY_ID)
  ) {
    families[defaultFamilyId(BUILTIN_TODO_RELATIONS_CATEGORY_ID)] = makeEmptyFamily(
      BUILTIN_TODO_RELATIONS_CATEGORY_ID
    )
  }
  return { categories, relationFamilies: families }
}

/** 合并某天的日历数据：笔记取备份非空值，待办/事件按 id 合并 */
function mergeCalendarDay(a: CalendarDay, b: CalendarDay): CalendarDay {
  return {
    note: b.note || a.note || "",
    todos: mergeById(a.todos ?? [], b.todos ?? []),
    events: mergeById(a.events ?? [], b.events ?? []),
  }
}

interface WorkspaceState {
  categories: Category[]
  calendar: CalendarData
  activeCategoryId: string | null // null 表示日历
  activeItemId: string | null // 章节 id 或节点 id
  view:
    | "workspace"
    | "calendar"
    | "contacts"
    | "vault"
    | "ai-chat"
    | "profile"
    | "settings"
    | "notifications"
    | "github-queue"
  selectedDate: string
  hydrated: boolean

  // 系统设置
  settings: Settings
  // UI 弹窗状态（跨组件触发，例如全局快捷键 Ctrl+M）
  addCategoryOpen: boolean
  configEditorOpen: boolean
  imagesOpen: boolean

  // 日历 / DayDetail 分隔条宽度（px），持久化以便刷新后保留用户拖动结果
  calendarDetailWidth: number

  // 桌面端侧边栏宽度（px），持久化以便刷新后保留用户拖动结果（拖动分隔条调整）
  sidebarWidth: number

  // 侧边栏收起状态（TODO 25）：收起后隐藏本体、贴边留悬浮展开按钮；持久化记住选择
  sidebarCollapsed: boolean
  // 底部工具栏收起状态（TODO 25）：收起后只剩标题行；持久化记住选择
  toolbarCollapsed: boolean

  // 全局标签库：容纳从联系人 roles 等外部来源导入的标签，供 TagPicker 复用
  knownTags: string[]

  // AI 助手：多会话（各自持有上下文，持久化到 localStorage）
  conversations: Conversation[]
  activeConversationId: string | null
  // 外部（如日历 DayDetail）触发的"打开 AI 闲聊并自动询问"：携带待发送 query；消费后清空（不持久化）。
  pendingAiQuery: string | null
  // Profile「问 AI 今日待办」的会话存档（按 dayStartOffset 翻篇时间划分"今天"）：
  // 记录今天那次询问所在的会话 id，当天内重复点击直接复用该会话，跨天/会话被删后重建。
  todayTodoAi: { dayKey: string; conversationId: string } | null

  // 贡献账本（Profile 热力图数据源）：每条为一次「新建/完成节点」事件（真账本，非派生）
  contributions: Contribution[]

  // 通知中心（TODO 20 / TODO 18）：GitHub sender 等产生的站内通知，持久化，按 createdAt
  // 降序，上限 200 条（超出截断最旧）
  notifications: NotificationItem[]
  // 通知系统日志（TODO 27）：每轮扫描检查了哪些仓库/发现哪些新内容、是否发送通知提示，
  // 持久化，按 at 降序，上限 500 条（超出截断最旧）
  notificationLogs: NotificationLogEntry[]
  // 扫描水位（epoch ms）：上一轮成功扫描的时间，作为下轮起算点；null = 从未扫过
  notificationWatermark: number | null
  // 最近活跃时间（epoch ms）：调度器心跳维护；pagehide 时的更新 ≈「关机时间」，
  // 作为首次扫描（无水位时）的兜底起算点
  lastActiveAt: number | null
  // 已读水位（epoch ms）：createdAt 晚于它的通知计为未读（工具栏徽标）；进通知页即更新
  lastReadNotificationsAt: number | null
  // 健康提醒上次触发时间（epoch ms，TODO 26）：持久化 + 按墙钟对表，重启/后台冻结不丢计时
  lastWaterRemindAt: number | null
  lastStandRemindAt: number | null
  // 新闻精选上次触发时刻（epoch ms，TODO 23）：与 18:00 周期起点比对判断本周期是否已拉取；
  // null = 从未拉过
  newsLastFetchedAt: number | null

  // 关系族（TODO 54）：key = family.id；每族一张独立图（nodes/edges/view/viewport），经 categoryId 归属 relation 分类。
  // 旧版 Category.relation 与 mindmapViewports 由 merge 迁移为默认族后废弃
  relationFamilies: Record<string, RelationFamily>
  // 跨组件跳转到指定族（如搬迁后跳转目标族）：消费后由组件置空；onRehydrateStorage 置 null（刷新不残留）
  pendingFamilyId: string | null

  // GitHub Issue/PR 看板队列（TODO 36）：用户从仓库拉取 / 监听同步进来的卡片
  issueQueue: IssueQueueItem[]

  // 通讯录（TODO 48：持久化驱动；public/address_book.yml 经设置页按钮导入，界面可增删改）
  contacts: Person[]
  // 自定义节日定义（TODO 48：持久化驱动；public/custom_festivals.yml 经设置页按钮导入）
  customFestivals: FestivalDef[]

  // 分类
  addCategory: (
    name: string,
    template: TemplateType,
    config: CategoryConfig,
    count?: number
  ) => string
  removeCategory: (id: string) => void
  renameCategory: (id: string, name: string) => void
  moveCategory: (fromIndex: number, toIndex: number) => void
  moveChapter: (catId: string, fromIndex: number, toIndex: number) => void
  setActiveCategory: (id: string) => void
  setActiveItem: (id: string | null) => void
  goCalendar: () => void
  goWorkspace: () => void
  goContacts: () => void
  goVault: () => void
  goAIChat: () => void
  goProfile: () => void
  goSettings: () => void
  goNotifications: () => void
  goGithubQueue: () => void

  // AI 助手：多会话管理（各自持有上下文）
  createConversation: () => string
  /** 后台静默新建会话（TODO 23 新闻精选用）：不切换 activeConversationId，不打断当前会话 */
  createConversationSilent: (title: string) => string
  selectConversation: (id: string) => void
  deleteConversation: (id: string) => void
  renameConversation: (id: string, title: string) => void
  togglePinConversation: (id: string) => void
  setConversationMessages: (id: string, messages: AIChatMessage[]) => void
  // 外部触发：新建会话并切到 AI 闲聊，携带一条待发送 query（由 AI 聊天界面消费后清空）
  askAiAbout: (text: string) => void
  clearPendingAiQuery: () => void
  /** Profile「问 AI 今日待办」：当天已有对应会话则直接打开该会话；否则新建会话发送并记录（按翻篇时间划分"今天"） */
  askAiToday: (text: string) => void

  // 系统设置 / UI
  updateSettings: (patch: Partial<Settings>) => void
  setShortcut: (action: ShortcutAction, binding: ShortcutBinding) => void
  setAddCategoryOpen: (v: boolean) => void
  setConfigEditorOpen: (v: boolean) => void
  setImagesOpen: (v: boolean) => void

  // 日历 / DayDetail 分隔条宽度（持久化）
  setCalendarDetailWidth: (w: number) => void

  // 桌面端侧边栏宽度（持久化）
  setSidebarWidth: (w: number) => void
  setSidebarCollapsed: (v: boolean) => void
  // 侧边栏收起后贴边悬浮开关的纵向位置（距视口顶部 px；null = 默认垂直居中），拖动后持久化
  sidebarToggleY: number | null
  setSidebarToggleY: (y: number) => void
  setToolbarCollapsed: (v: boolean) => void

  // 全局标签库（导入联系人 roles 等）：并入去重后的标签，已存在则忽略
  addKnownTags: (tags: string[]) => void

  // 数据备份
  /** 导出 store 快照为 JSON；sections 指定导出分区（TODO 41），缺省导出除 vault 外全部分区 */
  exportData: (sections?: BackupSections) => string | null
  importData: (json: string) => boolean
  mergeData: (json: string) => boolean

  // 小说 / 通用条目
  addChapter: (catId: string) => void
  updateChapter: (
    catId: string,
    chapterId: string,
    patch: Partial<Chapter>
  ) => void
  removeChapter: (catId: string, chapterId: string) => void

  // 思维导图（TODO 54 起以 familyId 定位操作 relationFamilies）
  addNode: (familyId: string, position?: { x: number; y: number }, title?: string) => string
  /** 添加子节点（统一入口）：以「父标题 序号」避重命名、置于父节点右侧并自动连线，
   *  末尾显式 setActiveItem(childId) 保证详情面板切到新节点。返回子节点 id（失败为 null）。 */
  addChildNode: (familyId: string, parentId: string) => string | null
  updateNode: (familyId: string, nodeId: string, patch: Partial<MindNode>) => void
  removeNode: (catId: string, nodeId: string) => void
  /** 一次性存量补算：为账本中缺失的节点补 created/done 记录（幂等），返回新增条数。
   *  临时功能（入口在 Profile 页），主人用完会要求删除 —— 与 Profile 的按钮一并摘除。 */
  scanLegacyContributions: () => number
  /** 每日签到（TODO 9）：写一条 `check-in:${dayKey}` 贡献（amount 2）；状态由账本按 dayKey 推导，过 04:00 自动重置。 */
  checkIn: () => void
  /** 专注钟（TODO 10）：结束专注时按专注分钟写一条 `focus:<dayKey>` 贡献；amount = floor(分钟/10)，不足 10 分钟返回 0（不写）。同 dayKey 已存在则覆盖（更新 at / amount）。 */
  addFocusContribution: (minutes: number, content?: string) => number
  /** 批量追加贡献（TODO 18：GitHub sender 按通知入账）；按 id 与现有账本去重后追加。
   *  amount 在本 action 内按 CONTRIBUTION_AMOUNT[type] 统一取值（调用方只传 type）。 */
  appendContributions: (
    entries: Array<{ id: string; type: ContributionType; at: number; content: string }>
  ) => void
  /** 通知入库（TODO 20 / 18）：按 id 去重合并，按 createdAt 降序，上限 200 条截断最旧。 */
  addNotifications: (items: NotificationItem[]) => void
  // 追加通知系统日志（TODO 27）：按 id 去重、at 降序、上限 500 条
  appendNotificationLogs: (entries: NotificationLogEntry[]) => void
  /** 扫描水位：上一轮成功扫描时间（epoch ms）。 */
  setNotificationWatermark: (ms: number) => void
  /** 最近活跃时间（epoch ms）：调度器心跳 / pagehide 更新。 */
  setLastActiveAt: (ms: number) => void
  /** 标记通知全部已读（更新已读水位为当前时间）。 */
  markNotificationsRead: () => void
  /** 健康提醒触发时间记账（TODO 26）。 */
  setLastWaterRemindAt: (ms: number) => void
  setLastStandRemindAt: (ms: number) => void
  setNewsLastFetchedAt: (ms: number) => void

  // GitHub 队列（TODO 36）
  /** 拉取到的 issue/PR 加入队列：按 id 去重（已存在则覆盖，保留其当前所在列） */
  addToIssueQueue: (items: IssueQueueItem[]) => void
  /** 移动某卡片到指定列（手动搬运 = 重新入队，刷新 queuedAt 让卡片浮到新列顶） */
  moveIssueQueueItem: (id: string, column: IssueQueueColumn) => void
  /** 从队列移除某卡片 */
  removeIssueQueueItem: (id: string) => void
  /** 批量回写 issue/PR 状态标记（state/merged）：监听收到 close/merge/reopen 事件时联动；列与排序位次不动 */
  syncIssueQueueStates: (
    entries: Array<{ id: string; state: "open" | "closed"; merged: boolean }>
  ) => void

  // 通讯录 / 自定义节日（TODO 48：持久化驱动）
  /** yml 导入：整表替换联系人 */
  setContacts: (items: Person[]) => void
  /** yml 导入：整表替换自定义节日 */
  setCustomFestivals: (items: FestivalDef[]) => void
  /** 新建联系人（空模板）：返回新条目 id，界面编辑器据此定位 */
  addContact: () => string
  updateContact: (id: string, patch: Partial<Person>) => void
  removeContact: (id: string) => void
  setNodeSolution: (
    familyId: string,
    nodeId: string,
    content: string,
    status: SolutionStatus
  ) => void
  connectNodes: (
    familyId: string,
    source: string,
    target: string,
    kind: "flow" | "sub"
  ) => ConnectResult
  removeEdge: (familyId: string, edgeId: string) => void
  removeSub: (familyId: string, nodeId: string, subId: string) => void
  /** 切换族视图（mindmap / list） */
  setFamilyView: (familyId: string, view: "mindmap" | "list") => void
  /** 族视口存档（写族内 viewport；旧版顶层 mindmapViewports 已废弃） */
  setFamilyViewport: (familyId: string, viewport: MindmapViewport) => void

  // 关系族管理（TODO 54）
  /** 新建族：返回新族 id（默认命名「我的分类」） */
  addRelationFamily: (categoryId: string, name?: string) => string
  renameRelationFamily: (familyId: string, name: string) => void
  /** 删除族：清理族内全部节点的贡献账本记录 */
  deleteRelationFamily: (familyId: string) => void
  /** 搬迁节点：只搬节点 + 两端都在搬移集合内的边（跨分类搬迁不改族归属字段以外的东西） */
  moveNodesToFamily: (familyId: string, nodeIds: string[], targetFamilyId: string) => void
  setPendingFamilyId: (id: string | null) => void

  // 日历
  setSelectedDate: (date: string) => void
  setDayNote: (date: string, note: string) => void
  addCalendarTodo: (date: string, content: string) => void
  toggleCalendarTodo: (date: string, todoId: string) => void
  removeCalendarTodo: (date: string, todoId: string) => void
  addCalendarEvent: (date: string, time: string, content: string) => void
  removeCalendarEvent: (date: string, eventId: string) => void
}

const STORAGE_NAME = "my-omni-workspace"
const STORAGE_FLUSH_MS = 800

/**
 * 防抖持久化存储：zustand 每次 set() 都会调 setItem——默认实现意味着每敲一个字
 * 都要 JSON.stringify 整个状态 + 同步写 localStorage（大状态下单次几十 ms）。
 * 这里 setItem 只暂存状态对象（O(1)），静止 800ms 后才序列化落盘；
 * pagehide / 切后台立即 flush，最多丢最后 800ms 的变更。
 */
function createDebouncedStorage(): PersistStorage<WorkspaceState> {
  let pending: StorageValue<WorkspaceState> | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let quotaWarned = false
  const flush = () => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
    if (!pending) return
    try {
      localStorage.setItem(STORAGE_NAME, JSON.stringify(pending))
      pending = null
    } catch (err) {
      // 配额满等写失败：保留 pending，下次 set 重试；只告警一次（此前静默吞错，
      // 曾导致「设置里的生日没持久化」这类问题无法定位）。
      if (!quotaWarned) {
        quotaWarned = true
        console.warn("[MyWorkspace] localStorage 写入失败，本轮变更暂缓落盘（可能是配额超限，请检查头像等大对象或导出备份后清理）", err)
      }
    }
  }
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flush)
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush()
    })
  }
  return {
    getItem: () => {
      try {
        const raw = localStorage.getItem(STORAGE_NAME)
        return raw ? (JSON.parse(raw) as StorageValue<WorkspaceState>) : null
      } catch {
        return null
      }
    },
    setItem: (_name, value) => {
      pending = value
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(flush, STORAGE_FLUSH_MS)
    },
    removeItem: () => {
      pending = null
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
      localStorage.removeItem(STORAGE_NAME)
    },
  }
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      categories: [],
      calendar: {},
      activeCategoryId: null,
      activeItemId: null,
      view: "workspace",
      selectedDate: format(new Date(), "yyyy-MM-dd"),
      hydrated: false,
      settings: DEFAULT_SETTINGS,
      addCategoryOpen: false,
      configEditorOpen: false,
      imagesOpen: false,

      // 日历 / DayDetail 分隔条默认宽度（px），与原 w-96 一致
      calendarDetailWidth: 384,

      // 桌面端侧边栏默认宽度（px），与原 w-72=18rem 一致
      sidebarWidth: 288,

      // 侧边栏 / 工具栏默认展开（TODO 25）
      sidebarCollapsed: false,
      sidebarToggleY: null,
      toolbarCollapsed: false,

      // 全局标签库默认空（角色由联系人数据加载时导入）
      knownTags: [],

      // AI 助手：默认无会话（视图挂载时若无会话则创建一个），不预置 activeConversationId
      conversations: [],
      activeConversationId: null,
      pendingAiQuery: null,
      todayTodoAi: null,

      // 贡献账本：默认空（存量由 Profile 页「补算历史」一次性补齐）
      contributions: [],

      // 通知中心：默认空（GitHub sender 由调度器入库）；水位 / 活跃时间初始 null
      notifications: [],
      notificationLogs: [],
      notificationWatermark: null,
      lastActiveAt: null,
      lastReadNotificationsAt: null,
      lastWaterRemindAt: null,
      lastStandRemindAt: null,
      // 新闻精选：从未拉过
      newsLastFetchedAt: null,

      // 关系族（TODO 54）：初始空（内建「待办事项」与旧数据迁移由 merge 的 migrateRelationState 补建）
      relationFamilies: {},
      pendingFamilyId: null,

      // GitHub 队列（TODO 36）：默认空
      issueQueue: [],

      // 通讯录 / 自定义节日（TODO 48）：默认空（由设置页「从 yml 导入」或界面新建填充）
      contacts: [],
      customFestivals: [],

      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),

      setShortcut: (action, binding) =>
        set((s) => ({
          settings: {
            ...s.settings,
            shortcuts: { ...s.settings.shortcuts, [action]: binding },
          },
        })),

      setAddCategoryOpen: (v) => set({ addCategoryOpen: v }),
      setConfigEditorOpen: (v) => set({ configEditorOpen: v }),
      setImagesOpen: (v) => set({ imagesOpen: v }),

      setCalendarDetailWidth: (w) => set({ calendarDetailWidth: w }),

      setSidebarWidth: (w) => set({ sidebarWidth: w }),

      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setSidebarToggleY: (y) => set({ sidebarToggleY: y }),

      setToolbarCollapsed: (v) => set({ toolbarCollapsed: v }),

      addKnownTags: (tags) =>
        set((s) => {
          // 已存在的标签（忽略大小写 + 首尾空格）直接跳过
          const existing = new Set(s.knownTags.map((t) => t.trim().toLowerCase()))
          const additions = tags
            .map((t) => t.trim())
            .filter((t) => t.length > 0 && !existing.has(t.toLowerCase()))
          if (additions.length === 0) return {}
          return { knownTags: [...s.knownTags, ...additions] }
        }),

      // 分区导出（TODO 41）：sections 指明各分区是否携带；缺省（未传）= 除 vault / contacts 外全部分区
      // （兼容旧调用方如 ConfigEditorDialog 的全量快照语义）。settings 始终携带（应用配置，恢复必需）。
      exportData: (sections) => {
        const s = get()
        const want = (id: BackupSectionId) =>
          sections ? sections[id] === true : id !== "vault" && id !== "contacts"
        try {
          const payload: Record<string, unknown> = {
            version: 1,
            exportedAt: new Date().toISOString(),
            settings: s.settings,
          }
          if (want("notes")) {
            payload.categories = s.categories
            // TODO 54：关系族随「随笔数据」分区携带（含族内节点/连线/视口）
            payload.relationFamilies = s.relationFamilies
          }
          if (want("calendar")) {
            payload.calendar = s.calendar
            // TODO 48：自定义节日归日历分区（它是日历数据，主人定的口径）
            payload.customFestivals = s.customFestivals
          }
          if (want("ai")) {
            payload.conversations = s.conversations
            payload.activeConversationId = s.activeConversationId
          }
          if (want("contributions")) payload.contributions = s.contributions
          if (want("notifications")) {
            payload.notifications = s.notifications
            payload.notificationLogs = s.notificationLogs
            payload.notificationWatermark = s.notificationWatermark
          }
          if (want("githubQueue")) payload.issueQueue = s.issueQueue
          // TODO 48：联系人已持久化，contacts 分区解锁（敏感分区，默认不勾选）
          if (want("contacts")) payload.contacts = s.contacts
          return JSON.stringify(payload, null, 2)
        } catch {
          return null
        }
      },

      importData: (json) => {
        try {
          const data = JSON.parse(json)
          if (!data || typeof data !== "object") return false
          // 分区备份兼容（TODO 41）：按「字段是否出现」识别分区；至少含一个数据分区才合法。
          // 替换语义 = 只替换备份携带的分区，未携带的分区保留当前数据（向后兼容旧版全量备份）。
          const hasNotes = Array.isArray(data.categories)
          const hasFamilies =
            !!data.relationFamilies &&
            typeof data.relationFamilies === "object" &&
            !Array.isArray(data.relationFamilies)
          const hasCalendar = typeof data.calendar === "object" && data.calendar !== null
          const hasAi = Array.isArray(data.conversations)
          const hasContribs = Array.isArray(data.contributions)
          const hasNotifications = Array.isArray(data.notifications)
          const hasQueue = Array.isArray(data.issueQueue)
          const hasContacts = Array.isArray(data.contacts)
          const hasFestivals = Array.isArray(data.customFestivals)
          if (
            !hasNotes &&
            !hasFamilies &&
            !hasCalendar &&
            !hasAi &&
            !hasContribs &&
            !hasNotifications &&
            !hasQueue &&
            !hasContacts &&
            !hasFestivals
          )
            return false
          const cur = get()
          // 关系族（TODO 54）：随 notes 分区迁移（旧备份 categories[].relation 一并转为默认族）
          const migratedNotes = hasNotes
            ? migrateRelationState(data.categories, data.relationFamilies, undefined)
            : null
          // AI 对话：仅当备份显式包含 conversations 时才覆盖（旧版无此字段则保留当前对话）。
          const convs = hasAi ? (data.conversations as Conversation[]) : null
          // 贡献账本：仅当备份显式包含数组时才覆盖（旧备份无此字段 → 保留当前账本，不清空）
          const bContribs = hasContribs ? (data.contributions as Contribution[]) : null
          // settings：备份携带才覆盖（分区导出始终携带 settings；防御旧备份缺失时保留现值）
          const bSettings =
            data.settings && typeof data.settings === "object" ? (data.settings as object) : null
          const persona = migratePersona((bSettings ?? {}) as Record<string, unknown>)
          set({
            // 随笔分区：出现才替换；未出现保留当前分类与选中态
            ...(migratedNotes
              ? {
                  categories: migratedNotes.categories,
                  relationFamilies: migratedNotes.relationFamilies,
                  activeCategoryId: migratedNotes.categories[0]?.id ?? null,
                  activeItemId: null,
                }
              : {}),
            ...(hasCalendar ? { calendar: data.calendar as CalendarData } : {}),
            settings: bSettings
              ? ({
                  ...DEFAULT_SETTINGS,
                  ...bSettings,
                  aiPersonas: persona.aiPersonas,
                  aiActivePersonaId: persona.aiActivePersonaId,
                  // 兜底：备份里的 dayStartOffset 缺失 / 非法 → "04:00"
                  dayStartOffset: normalizeDayStartOffset(
                    (bSettings as Record<string, unknown>).dayStartOffset
                  ),
                  // 兜底：旧备份 string[] 或坏值 → NotificationRepoConfig[]
                  notificationRepos: normalizeNotificationRepos(
                    (bSettings as Record<string, unknown>).notificationRepos
                  ),
                  // 兜底：备份里的渠道配置缺失 / 坏值 → 默认（builtin 开、qq 关）
                  notificationChannels: normalizeNotificationChannels(
                    (bSettings as Record<string, unknown>).notificationChannels
                  ),
                  // 兜底：备份里的 QQ 中转地址缺失 / 非法 → 默认地址
                  qqRelayUrl: normalizeQqRelayUrl(
                    (bSettings as Record<string, unknown>).qqRelayUrl
                  ),
                } as Settings)
              : cur.settings,
            conversations: convs ?? cur.conversations,
            activeConversationId: convs
              ? (convs.find((c) => c.id === data.activeConversationId)
                  ? data.activeConversationId
                  : convs[0]?.id ?? null)
              : cur.activeConversationId,
            // 账本：备份显式包含则覆盖，否则保留当前（向后兼容旧备份）
            contributions: bContribs ?? cur.contributions,
            // 通知分区：列表整体替换；日志 / 水位出现才覆盖
            ...(hasNotifications
              ? {
                  notifications: data.notifications as NotificationItem[],
                  ...(Array.isArray(data.notificationLogs)
                    ? { notificationLogs: data.notificationLogs as NotificationLogEntry[] }
                    : {}),
                  ...(data.notificationWatermark === null ||
                  typeof data.notificationWatermark === "number"
                    ? { notificationWatermark: data.notificationWatermark as number | null }
                    : {}),
                }
              : {}),
            // GitHub 队列分区：整体替换
            ...(hasQueue ? { issueQueue: data.issueQueue as IssueQueueItem[] } : {}),
            // 通讯录分区（TODO 48）：整体替换
            ...(hasContacts ? { contacts: data.contacts as Person[] } : {}),
            // 自定义节日（TODO 48，随日历分区携带）：整体替换
            ...(hasFestivals ? { customFestivals: data.customFestivals as FestivalDef[] } : {}),
            // 有随笔分区才跳工作区（与旧版全量导入行为一致）；部分备份停留在当前视图
            ...(hasNotes ? { view: "workspace" as const } : {}),
          })
          return true
        } catch {
          return false
        }
      },

      // 合并导入：分类按 id、日历按日期、账本 / 对话 / 通知 / 队列按 id 合并；
      // 仅处理备份携带的分区（TODO 41），未携带的分区完全不碰；settings 与视图状态保留当前值。
      mergeData: (json) => {
        try {
          const data = JSON.parse(json)
          if (!data || typeof data !== "object") return false
          const hasNotes = Array.isArray(data.categories)
          const hasFamilies =
            !!data.relationFamilies &&
            typeof data.relationFamilies === "object" &&
            !Array.isArray(data.relationFamilies)
          const hasCalendar = typeof data.calendar === "object" && data.calendar !== null
          const hasAi = Array.isArray(data.conversations)
          const hasContribs = Array.isArray(data.contributions)
          const hasNotifications = Array.isArray(data.notifications)
          const hasQueue = Array.isArray(data.issueQueue)
          const hasContacts = Array.isArray(data.contacts)
          const hasFestivals = Array.isArray(data.customFestivals)
          if (
            !hasNotes &&
            !hasFamilies &&
            !hasCalendar &&
            !hasAi &&
            !hasContribs &&
            !hasNotifications &&
            !hasQueue &&
            !hasContacts &&
            !hasFestivals
          )
            return false
          const cur = get()
          const patch: Record<string, unknown> = {}
          // 分类：按 id 合并（备份覆盖同 id，新 id 追加）；关系族一并按 id 合并后统一迁移
          // （旧备份 categories[].relation → 默认族；TODO 54）
          if (hasNotes) {
            const catMap = new Map<string, Category>()
            for (const c of cur.categories) catMap.set(c.id, c)
            for (const c of data.categories as Category[]) catMap.set(c.id, c)
            const famMap: Record<string, RelationFamily> = { ...cur.relationFamilies }
            if (hasFamilies) {
              for (const val of Object.values(
                data.relationFamilies as Record<string, unknown>
              )) {
                const fam = normalizeFamily(val, "")
                if (fam) famMap[fam.id] = fam
              }
            }
            const migrated = migrateRelationState([...catMap.values()], famMap, undefined)
            patch.categories = migrated.categories
            patch.relationFamilies = migrated.relationFamilies
          }
          // 日历：按日期合并
          if (hasCalendar) {
            const calendar: CalendarData = { ...cur.calendar }
            const bCal = data.calendar as CalendarData
            for (const date of Object.keys(bCal)) {
              const bDay = bCal[date]
              const cDay = calendar[date]
              calendar[date] = cDay ? mergeCalendarDay(cDay, bDay) : bDay
            }
            patch.calendar = calendar
          }
          // 贡献账本：按 id 合并（同 id 覆盖，新 id 追加）
          if (hasContribs) {
            const contribMap = new Map<string, Contribution>()
            for (const x of cur.contributions) contribMap.set(x.id, x)
            for (const x of data.contributions as Contribution[]) contribMap.set(x.id, x)
            patch.contributions = [...contribMap.values()]
          }
          // AI 对话：按 id 合并；合并模式不改动当前选中的会话（若仍存在于结果中）。
          if (hasAi) {
            const convMap = new Map<string, Conversation>()
            for (const c of cur.conversations) convMap.set(c.id, c)
            for (const c of data.conversations as Conversation[]) convMap.set(c.id, c)
            const conversations = [...convMap.values()]
            patch.conversations = conversations
            patch.activeConversationId =
              cur.activeConversationId && convMap.has(cur.activeConversationId)
                ? cur.activeConversationId
                : (conversations[0]?.id ?? null)
          }
          // 通知分区：通知 / 日志按 id 合并；水位取两边的较大值（避免回退导致重复扫描）
          if (hasNotifications) {
            const nMap = new Map<string, NotificationItem>()
            for (const n of cur.notifications) nMap.set(n.id, n)
            for (const n of data.notifications as NotificationItem[]) nMap.set(n.id, n)
            patch.notifications = [...nMap.values()]
            if (Array.isArray(data.notificationLogs)) {
              const lMap = new Map<string, NotificationLogEntry>()
              for (const e of cur.notificationLogs) lMap.set(e.id, e)
              for (const e of data.notificationLogs as NotificationLogEntry[]) lMap.set(e.id, e)
              patch.notificationLogs = [...lMap.values()]
            }
            if (
              data.notificationWatermark === null ||
              typeof data.notificationWatermark === "number"
            ) {
              const bWm = data.notificationWatermark as number | null
              patch.notificationWatermark =
                bWm === null
                  ? cur.notificationWatermark
                  : Math.max(cur.notificationWatermark ?? 0, bWm)
            }
          }
          // GitHub 队列分区：按 id 合并
          if (hasQueue) {
            const qMap = new Map<string, IssueQueueItem>()
            for (const it of cur.issueQueue) qMap.set(it.id, it)
            for (const it of data.issueQueue as IssueQueueItem[]) qMap.set(it.id, it)
            patch.issueQueue = [...qMap.values()]
          }
          // 通讯录分区（TODO 48）：按 id 合并（同 id 以备份为准，新 id 追加）
          if (hasContacts) {
            const cMap = new Map<string, Person>()
            for (const p of cur.contacts) cMap.set(p.id, p)
            for (const p of data.contacts as Person[]) cMap.set(p.id, p)
            patch.contacts = [...cMap.values()]
          }
          // 自定义节日（TODO 48）：按 name 合并（同名以备份为准；节日定义无 id）
          if (hasFestivals) {
            const fMap = new Map<string, FestivalDef>()
            for (const f of cur.customFestivals) fMap.set(f.name, f)
            for (const f of data.customFestivals as FestivalDef[]) fMap.set(f.name, f)
            patch.customFestivals = [...fMap.values()]
          }
          set(patch)
          return true
        } catch {
          return false
        }
      },

      addCategory: (name, template, config, count = 0) => {
        const id = uid()
        const cat: Category = {
          id,
          name,
          template,
          icon: iconForTemplate(template),
          config,
          builtin: false,
        }
        let newFamilies: Record<string, RelationFamily> | null = null
        if (template === "relation") {
          // TODO 54：relation 分类建一个默认族「我的分类」（图数据在 relationFamilies）
          const famId = `fam_${uid()}`
          newFamilies = {
            [famId]: {
              id: famId,
              name: DEFAULT_FAMILY_NAME,
              categoryId: id,
              nodes: [],
              edges: [],
              view: "mindmap",
            },
          }
        } else {
          const chapters: Chapter[] = []
          if (template === "novel" && count > 0) {
            for (let i = 0; i < count; i++) {
              chapters.push({
                id: uid(),
                index: i + 1,
                title: buildTitle(config, i + 1),
                content: "",
                tags: [],
              })
            }
          }
          cat.chapters = chapters
        }
        set((s) => ({
          categories: [...s.categories, cat],
          ...(newFamilies ? { relationFamilies: { ...s.relationFamilies, ...newFamilies } } : {}),
          activeCategoryId: id,
          activeItemId: null,
          view: "workspace",
        }))
        return id
      },

      removeCategory: (id) =>
        set((s) => {
          const categories = s.categories.filter((c) => c.id !== id)
          const activeCategoryId =
            s.activeCategoryId === id
              ? (categories[0]?.id ?? null)
              : s.activeCategoryId
          // 关系族连带删除（TODO 54）：删整个关系型分类 = 连带删掉其下所有族，
          // 族内全部节点的贡献账本一并清理（口径与 removeNode 一致）
          const relationFamilies: Record<string, RelationFamily> = {}
          const nodeIds: string[] = []
          for (const [fid, fam] of Object.entries(s.relationFamilies)) {
            if (fam.categoryId === id) {
              for (const n of fam.nodes) nodeIds.push(n.id)
            } else {
              relationFamilies[fid] = fam
            }
          }
          let contributions = s.contributions
          if (nodeIds.length > 0) {
            const prefixes = nodeIds.map((n) => `${n}:`)
            const kept = s.contributions.filter(
              (x) => !prefixes.some((p) => x.id.startsWith(p))
            )
            // 未命中则保持原引用，避免无谓重渲染
            if (kept.length !== s.contributions.length) contributions = kept
          }
          return {
            categories,
            activeCategoryId,
            activeItemId: null,
            contributions,
            relationFamilies,
          }
        }),

      renameCategory: (id, name) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === id ? { ...c, name } : c
          ),
        })),

      // 把 fromIndex 处元素移动到 toIndex（数组内前移/后移）
      moveCategory: (fromIndex, toIndex) =>
        set((s) => {
          const arr = [...s.categories]
          if (fromIndex < 0 || fromIndex >= arr.length || toIndex < 0 || toIndex >= arr.length) return s
          if (fromIndex === toIndex) return s
          const [item] = arr.splice(fromIndex, 1)
          arr.splice(toIndex, 0, item)
          return { categories: arr }
        }),

      moveChapter: (catId, fromIndex, toIndex) =>
        set((s) => ({
          categories: s.categories.map((c) => {
            if (c.id !== catId || !c.chapters) return c
            const arr = [...c.chapters]
            if (fromIndex < 0 || fromIndex >= arr.length || toIndex < 0 || toIndex >= arr.length) return c
            if (fromIndex === toIndex) return c
            const [item] = arr.splice(fromIndex, 1)
            arr.splice(toIndex, 0, item)
            // 重排后重算序号；仅当标题仍等于默认命名时才跟随新序号更新标题，避免覆盖用户自定义标题
            const next = arr.map((ch, i) => {
              if (ch.title === buildTitle(c.config, i + 1)) {
                return { ...ch, index: i + 1, title: buildTitle(c.config, i + 1) }
              }
              return { ...ch, index: i + 1 }
            })
            return { ...c, chapters: next }
          }),
        })),

      setActiveCategory: (id) =>
        set({ activeCategoryId: id, activeItemId: null, view: "workspace" }),
      setActiveItem: (id) => set({ activeItemId: id, view: "workspace" }),
      goCalendar: () => set({ view: "calendar", activeCategoryId: null }),
      goWorkspace: () => set({ view: "workspace" }),
      goContacts: () => set({ view: "contacts", activeCategoryId: null }),
      goVault: () => set({ view: "vault", activeCategoryId: null }),
      goAIChat: () => set({ view: "ai-chat", activeCategoryId: null }),
      goProfile: () => set({ view: "profile", activeCategoryId: null }),
      goSettings: () => set({ view: "settings", activeCategoryId: null }),
      goNotifications: () =>
        set({ view: "notifications", activeCategoryId: null, lastReadNotificationsAt: Date.now() }),
      goGithubQueue: () => set({ view: "github-queue", activeCategoryId: null }),

      // ---- AI 助手：多会话（各自持有上下文） ----
      createConversation: () => {
        const id = uid()
        const now = Date.now()
        const conv: Conversation = {
          id,
          title: "新对话",
          messages: [],
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({
          conversations: [conv, ...s.conversations],
          activeConversationId: id,
        }))
        return id
      },
      selectConversation: (id) => set({ activeConversationId: id }),
      // 后台静默建会话（TODO 23 新闻精选）：不切换 activeConversationId、不切视图
      createConversationSilent: (title) => {
        const id = uid()
        const now = Date.now()
        const conv: Conversation = {
          id,
          title,
          messages: [],
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({ conversations: [conv, ...s.conversations] }))
        return id
      },
      deleteConversation: (id) =>
        set((s) => {
          const conversations = s.conversations.filter((c) => c.id !== id)
          const activeConversationId =
            s.activeConversationId === id
              ? (conversations[0]?.id ?? null)
              : s.activeConversationId
          return { conversations, activeConversationId }
        }),
      renameConversation: (id, title) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id
              ? { ...c, title: title.trim().slice(0, 10) || "新对话", updatedAt: Date.now() }
              : c,
          ),
        })),
      togglePinConversation: (id) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, pinned: !c.pinned } : c,
          ),
        })),
      setConversationMessages: (id, messages) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, messages, updatedAt: Date.now() } : c,
          ),
        })),
      // 外部（如日历 DayDetail）触发：新建会话、切到 AI 闲聊，并挂起一条待发送 query。
      // 由 AIChatWorkspace 在会话就绪后消费（send 后再 clearPendingAiQuery）。
      askAiAbout: (text) => {
        get().createConversation()
        set({ view: "ai-chat", activeCategoryId: null, pendingAiQuery: text })
      },
      clearPendingAiQuery: () => set({ pendingAiQuery: null }),

      // Profile「问 AI 今日待办」：按 settings.dayStartOffset 翻篇时间算出"今天"的 dayKey。
      // 当天已记录且会话仍存在 → 直接打开那个会话（不再发新 query）；否则新建会话发送并记录。
      askAiToday: (text) => {
        const s = get()
        const dayKey = todayKey(parseDayStartOffset(s.settings.dayStartOffset))
        const rec = s.todayTodoAi
        if (rec && rec.dayKey === dayKey && s.conversations.some((c) => c.id === rec.conversationId)) {
          s.selectConversation(rec.conversationId)
          set({ view: "ai-chat", activeCategoryId: null })
          return
        }
        const id = s.createConversation()
        set({
          view: "ai-chat",
          activeCategoryId: null,
          pendingAiQuery: text,
          todayTodoAi: { dayKey, conversationId: id },
        })
      },

      addChapter: (catId) =>
        set((s) => ({
          categories: s.categories.map((c) => {
            if (c.id !== catId || !c.chapters) return c
            const index =
              c.chapters.reduce((m, ch) => Math.max(m, ch.index), 0) + 1
            const chapter: Chapter = {
              id: uid(),
              index,
              title: buildTitle(c.config, index),
              content: "",
              tags: [],
            }
            return { ...c, chapters: [...c.chapters, chapter] }
          }),
        })),

      updateChapter: (catId, chapterId, patch) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === catId && c.chapters
              ? {
                  ...c,
                  chapters: c.chapters.map((ch) =>
                    ch.id === chapterId ? { ...ch, ...patch } : ch
                  ),
                }
              : c
          ),
        })),

      removeChapter: (catId, chapterId) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === catId && c.chapters
              ? {
                  ...c,
                  chapters: c.chapters.filter((ch) => ch.id !== chapterId),
                }
              : c
          ),
          activeItemId: s.activeItemId === chapterId ? null : s.activeItemId,
        })),

      addNode: (familyId, position, title) => {
        const id = uid()
        const now = Date.now()
        const nodeTitle = title ?? "新节点"
        set((s) => {
          const fam = s.relationFamilies[familyId]
          // 目标族不存在：不建节点（保留 activeItemId 行为）
          if (!fam) return { activeItemId: id }
          const node: MindNode = {
            id,
            title: nodeTitle,
            content: "",
            cause: "",
            leadTo: "",
            result: "",
            sub: [],
            solution: null,
            position: position ?? {
              x: 200 + Math.random() * 200,
              y: 120 + Math.random() * 160,
            },
            createdAt: now,
            completedAt: null,
          }
          return {
            relationFamilies: {
              ...s.relationFamilies,
              [familyId]: { ...fam, nodes: [...fam.nodes, node] },
            },
            // 记账：新建节点 +0.2
            contributions: [
              ...s.contributions,
              {
                id: `${id}:created`,
                at: now,
                amount: CONTRIBUTION_AMOUNT["mindmap-node-created"],
                type: "mindmap-node-created",
                content: nodeTitle,
              },
            ],
            activeItemId: id,
          }
        })
        return id
      },

      // 添加子节点统一入口（原 NodeInspector.handleAddChild 与右键菜单两处重复逻辑合并）：
      // 末尾显式 setActiveItem(childId)——仅靠 addNode 内部的 activeItemId 赋值，
      // 在右键菜单路径下会被菜单关闭后的焦点/点击时序覆盖，详情面板不切换。
      addChildNode: (familyId, parentId) => {
        const s = get()
        const fam = s.relationFamilies[familyId]
        if (!fam) return null
        const parent = fam.nodes.find((n) => n.id === parentId)
        if (!parent) return null
        const base = parent.title?.trim() || "新节点"
        const existing = new Set(fam.nodes.map((n) => (n.title ?? "").trim()))
        let seq = 1
        while (existing.has(`${base} ${seq}`)) seq++
        const pos = parent.position ?? { x: 200, y: 120 }
        const childId = s.addNode(familyId, { x: pos.x + 300, y: pos.y }, `${base} ${seq}`)
        s.connectNodes(familyId, parentId, childId, "flow")
        s.setActiveItem(childId)
        return childId
      },

      updateNode: (familyId, nodeId, patch) =>
        set((s) => {
          const fam = s.relationFamilies[familyId]
          if (!fam) return {}
          const prev = fam.nodes.find((n) => n.id === nodeId)
          if (!prev) return {}

          const next = { ...prev, ...patch }
          // 切换完成态时同步记录完成时间：完成 = 现在，未完成 = null
          if ("done" in patch) {
            next.completedAt = patch.done ? Date.now() : null
          }
          // 单图缩放清理：内容变动后若图片不再恰好为 1 张，缩放失效并删除
          if (patch.content !== undefined) {
            if (imageIdsInText(patch.content).size !== 1) {
              delete next.imageZoom
            }
          }

          const relationFamilies = {
            ...s.relationFamilies,
            [familyId]: {
              ...fam,
              nodes: fam.nodes.map((n) => (n.id === nodeId ? next : n)),
            },
          }

          // 记账：仅当完成态「真正跃迁」时才写账本（拖拽 position / 图片缩放等 patch 不触发）
          let contributions = s.contributions
          if ("done" in patch && !!prev.done !== !!next.done) {
            const doneId = `${nodeId}:done`
            // 先删同 id 旧条（upsert，防重复），再按需补
            const withoutDone = contributions.filter((x) => x.id !== doneId)
            contributions = next.done
              ? [
                  ...withoutDone,
                  {
                    id: doneId,
                    at: Date.now(),
                    amount: CONTRIBUTION_AMOUNT["mindmap-node-done"],
                    type: "mindmap-node-done",
                    content: next.title,
                  },
                ]
              : withoutDone
          }

          return { relationFamilies, contributions }
        }),

      removeNode: (familyId, nodeId) =>
        set((s) => {
          const fam = s.relationFamilies[familyId]
          if (!fam) return {}
          return {
            relationFamilies: {
              ...s.relationFamilies,
              [familyId]: {
                ...fam,
                nodes: fam.nodes
                  .filter((n) => n.id !== nodeId)
                  .map((n) =>
                    n.sub.includes(nodeId)
                      ? { ...n, sub: n.sub.filter((x) => x !== nodeId) }
                      : n
                  ),
                edges: fam.edges.filter(
                  (e) => e.source !== nodeId && e.target !== nodeId
                ),
              },
            },
            // 记账：删除节点 → 清掉该节点全部条（id 形如 `${nodeId}:created` / `${nodeId}:done`）。
            // 注：removeNode 非递归，子节点会存活（仅从父节点 sub 解绑），故只清本节点记录。
            contributions: s.contributions.filter((x) => !x.id.startsWith(`${nodeId}:`)),
            activeItemId: s.activeItemId === nodeId ? null : s.activeItemId,
          }
        }),

      // 一次性存量补算（幂等）：为账本缺失的节点补 created / done 记录，返回新增条数。
      // 临时功能：入口在 Profile 页「补算历史」按钮，主人用完会要求删除 —— 与按钮一并摘除。
      scanLegacyContributions: () => {
        let added = 0
        set((s) => {
          const existing = new Set(s.contributions.map((c) => c.id))
          const next = [...s.contributions]
          for (const fam of Object.values(s.relationFamilies)) {
            for (const n of fam.nodes) {
              const createdId = `${n.id}:created`
              if (typeof n.createdAt === "number" && !existing.has(createdId)) {
                next.push({
                  id: createdId,
                  at: n.createdAt,
                  amount: CONTRIBUTION_AMOUNT["mindmap-node-created"],
                  type: "mindmap-node-created",
                  content: n.title,
                })
                existing.add(createdId)
                added++
              }
              const doneId = `${n.id}:done`
              // completedAt != null：含迁移写入的 LEGACY_NODE_TIME（主人要求如实计入）
              if (n.completedAt != null && !existing.has(doneId)) {
                next.push({
                  id: doneId,
                  at: n.completedAt,
                  amount: CONTRIBUTION_AMOUNT["mindmap-node-done"],
                  type: "mindmap-node-done",
                  content: n.title,
                })
                existing.add(doneId)
                added++
              }
            }
          }
          return added > 0 ? { contributions: next } : {}
        })
        return added
      },

      // 每日签到（TODO 9）：写一条 `check-in:${dayKey}` 贡献（amount 2），状态由账本按 dayKey 推导。
      // 复用 TODO 8 的 settings.dayStartOffset 同一 offset 配置；过 04:00 后 dayKey 变化即自动「未签到」。
      checkIn: () => {
        const off = parseDayStartOffset(get().settings.dayStartOffset)
        const dayKey = todayKey(off)
        const id = `check-in:${dayKey}`
        // 幂等：今天已签过就不再写（按钮虽禁用，双保险）
        if (get().contributions.some((c) => c.id === id)) return
        set((s) => ({
          contributions: [
            ...s.contributions,
            {
              id,
              at: Date.now(),
              amount: CONTRIBUTION_AMOUNT["check-in"],
              type: "check-in",
              content: "签到",
            },
          ],
        }))
      },

      // 专注钟（TODO 10）：结束专注时按专注分钟写一条 `focus:<dayKey>` 贡献（amount = floor(分钟/10)）。
      // 不足 10 分钟不写，返回 0；同 dayKey 已存在则覆盖（取本次 amount，at 更新为最新）。
      // 复用 settings.dayStartOffset 同一 offset，过 04:00 后 dayKey 变化即视为新的一天。
      addFocusContribution: (minutes, content) => {
        const amount = Math.floor(minutes / 10)
        if (amount < 1) return 0
        const off = parseDayStartOffset(get().settings.dayStartOffset)
        const dayKey = todayKey(off)
        const id = `focus:${dayKey}`
        const finalContent =
          content && content.trim() ? content.trim() : `专注 ${Math.round(minutes)} 分钟`
        set((s) => ({
          contributions: [
            ...s.contributions.filter((c) => c.id !== id),
            {
              id,
              at: Date.now(),
              amount,
              type: "focus",
              content: finalContent,
            },
          ],
        }))
        return amount
      },

      // 批量追加贡献（TODO 18）：按 id 与现有账本去重后追加；amount 按
      // CONTRIBUTION_AMOUNT[type] 统一取值（权重唯一来源在 lib/types.ts）。
      appendContributions: (entries) =>
        set((s) => {
          if (entries.length === 0) return {}
          const existing = new Set(s.contributions.map((c) => c.id))
          const additions = entries
            .filter((e) => !existing.has(e.id) && Number.isFinite(e.at))
            .map((e) => ({
              id: e.id,
              at: e.at,
              amount: CONTRIBUTION_AMOUNT[e.type],
              type: e.type,
              content: e.content,
            }))
          if (additions.length === 0) return {}
          return { contributions: [...s.contributions, ...additions] }
        }),

      // 通知入库（TODO 20 / 18）：按 id 去重合并（已有条目保留原样），按 createdAt
      // 降序排列，上限 200 条（超出截断最旧）。
      addNotifications: (items) =>
        set((s) => {
          if (items.length === 0) return {}
          const map = new Map<string, NotificationItem>()
          for (const n of s.notifications) map.set(n.id, n)
          for (const n of items) map.set(n.id, n)
          // 按「发现时间」排序/截断（foundAt 缺省回落 createdAt）：晚推送的旧 commit
          // createdAt 很早，若按 createdAt 排会被压到列表深处甚至截断掉
          const key = (n: NotificationItem) => n.foundAt ?? (Date.parse(n.createdAt) || 0)
          const merged = [...map.values()].sort((a, b) => key(b) - key(a)).slice(0, 200)
          return { notifications: merged }
        }),

      setNotificationWatermark: (ms) => set({ notificationWatermark: ms }),

      // 通知系统日志入库（TODO 27）：按 id 去重合并，按 at 降序，上限 500 条（超出截断最旧）。
      appendNotificationLogs: (entries) =>
        set((s) => {
          if (entries.length === 0) return {}
          const map = new Map<string, NotificationLogEntry>()
          for (const e of s.notificationLogs) map.set(e.id, e)
          for (const e of entries) map.set(e.id, e)
          const merged = [...map.values()].sort((a, b) => b.at - a.at).slice(0, 500)
          return { notificationLogs: merged }
        }),

      setLastActiveAt: (ms) => set({ lastActiveAt: ms }),

      // 通知全部已读：进入通知页时调用（工具栏未读徽标随之清零）
      markNotificationsRead: () => set({ lastReadNotificationsAt: Date.now() }),

      setLastWaterRemindAt: (ms) => set({ lastWaterRemindAt: ms }),
      setLastStandRemindAt: (ms) => set({ lastStandRemindAt: ms }),
      setNewsLastFetchedAt: (ms) => set({ newsLastFetchedAt: ms }),

      // ---- GitHub 队列（TODO 36） ----
      addToIssueQueue: (items) =>
        set((s) => {
          if (!items.length) return {}
          const byId = new Map(s.issueQueue.map((it) => [it.id, it]))
          for (const it of items) {
            const prev = byId.get(it.id)
            // 已存在 → 覆盖数据但保留其当前所在列与首次入队时间 queuedAt（用户手动移动过的列、原始排序位次不被拉取覆盖）
            // 新条目 → 记录首次入队时间（看板按 queuedAt 倒序；旧存档无此字段，组件排序时回落 0 沉底）
            byId.set(
              it.id,
              prev
                ? { ...it, column: prev.column, queuedAt: prev.queuedAt }
                : { ...it, queuedAt: Date.now() }
            )
          }
          return { issueQueue: [...byId.values()] }
        }),
      moveIssueQueueItem: (id, column) =>
        set((s) => ({
          issueQueue: s.issueQueue.map((it) =>
            // 手动搬运 = 重新入队：刷新 queuedAt 让卡片浮到新列顶（TODO 46 后续口径）
            it.id === id ? { ...it, column, queuedAt: Date.now() } : it
          ),
        })),
      removeIssueQueueItem: (id) =>
        set((s) => ({ issueQueue: s.issueQueue.filter((it) => it.id !== id) })),
      // 状态标记联动（TODO 46 后续）：close/merge/reopen 只回写 state/merged，列与排序位次不动
      syncIssueQueueStates: (entries) =>
        set((s) => {
          const byId = new Map(entries.map((e) => [e.id, e]))
          return {
            issueQueue: s.issueQueue.map((it) => {
              const e = byId.get(it.id)
              // id 不在队列中的条目忽略；未命中的条目保持原引用
              return e ? { ...it, state: e.state, merged: e.merged } : it
            }),
          }
        }),

      // ---- 通讯录 / 自定义节日（TODO 48：持久化驱动） ----
      setContacts: (items) => set({ contacts: items }),
      setCustomFestivals: (items) => set({ customFestivals: items }),
      addContact: () => {
        const id = uid()
        set((s) => ({ contacts: [...s.contacts, { id, name: "新联系人" }] }))
        return id
      },
      updateContact: (id, patch) =>
        set((s) => ({
          contacts: s.contacts.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),
      removeContact: (id) =>
        set((s) => ({ contacts: s.contacts.filter((p) => p.id !== id) })),

      setNodeSolution: (familyId, nodeId, content, status) =>
        set((s) => {
          const fam = s.relationFamilies[familyId]
          if (!fam) return {}
          return {
            relationFamilies: {
              ...s.relationFamilies,
              [familyId]: {
                ...fam,
                nodes: fam.nodes.map((n) =>
                  n.id === nodeId
                    ? {
                        ...n,
                        solution: content.trim()
                          ? { content, status }
                          : null,
                      }
                    : n
                ),
              },
            },
          }
        }),

      connectNodes: (familyId, source, target, kind) => {
        let result: ConnectResult = "invalid"
        set((s) => {
          const fam = s.relationFamilies[familyId]
          if (!fam) return s
          if (source === target) {
            result = "invalid"
            return s
          }
          const exists = fam.edges.some(
            (e) => e.source === source && e.target === target
          )
          if (exists) {
            result = "exists"
            return s
          }
          const edge: MindEdge = { id: uid(), source, target, kind }
          let nodes = fam.nodes
          if (kind === "sub") {
            nodes = nodes.map((n) =>
              n.id === source && !n.sub.includes(target)
                ? { ...n, sub: [...n.sub, target] }
                : n
            )
          }
          result = "created"
          return {
            relationFamilies: {
              ...s.relationFamilies,
              [familyId]: { ...fam, edges: [...fam.edges, edge], nodes },
            },
          }
        })
        return result
      },

      removeEdge: (familyId, edgeId) =>
        set((s) => {
          const fam = s.relationFamilies[familyId]
          if (!fam) return s
          const edge = fam.edges.find((e) => e.id === edgeId)
          const nodes =
            edge && edge.kind === "sub"
              ? fam.nodes.map((n) =>
                  n.id === edge.source
                    ? { ...n, sub: n.sub.filter((x) => x !== edge.target) }
                    : n
                )
              : fam.nodes
          return {
            relationFamilies: {
              ...s.relationFamilies,
              [familyId]: {
                ...fam,
                edges: fam.edges.filter((e) => e.id !== edgeId),
                nodes,
              },
            },
          }
        }),

      removeSub: (familyId, nodeId, subId) =>
        set((s) => {
          const fam = s.relationFamilies[familyId]
          if (!fam) return {}
          return {
            relationFamilies: {
              ...s.relationFamilies,
              [familyId]: {
                ...fam,
                nodes: fam.nodes.map((n) =>
                  n.id === nodeId
                    ? { ...n, sub: n.sub.filter((x) => x !== subId) }
                    : n
                ),
                edges: fam.edges.filter(
                  (e) =>
                    !(
                      e.kind === "sub" &&
                      e.source === nodeId &&
                      e.target === subId
                    )
                ),
              },
            },
          }
        }),

      setFamilyView: (familyId, view) =>
        set((s) => {
          const fam = s.relationFamilies[familyId]
          if (!fam) return {}
          return {
            relationFamilies: {
              ...s.relationFamilies,
              [familyId]: { ...fam, view },
            },
          }
        }),

      setFamilyViewport: (familyId, viewport) =>
        set((s) => {
          const fam = s.relationFamilies[familyId]
          if (!fam) return {}
          // 值等守卫：视口数值没变就不写 store（xyflow 的 panZoom end / fitView 可能重复
          // 触发 onMoveEnd，无条件重建对象会让每次事件都变成一次重渲染，是死循环燃料）
          const prev = fam.viewport
          if (
            prev &&
            prev.x === viewport.x &&
            prev.y === viewport.y &&
            prev.zoom === viewport.zoom
          ) {
            return {}
          }
          return {
            relationFamilies: {
              ...s.relationFamilies,
              [familyId]: { ...fam, viewport },
            },
          }
        }),

      // ---- 关系族管理（TODO 54） ----
      addRelationFamily: (categoryId, name) => {
        const id = `fam_${uid()}`
        set((s) => {
          // 名字防重（主人口径：同分类内不重名，重名自动追加「 n」，n 为最小正整数）
          // + 20 字上限；默认名同样参与防重
          const base = (name?.trim() || DEFAULT_FAMILY_NAME).slice(0, 20)
          const taken = new Set(
            Object.values(s.relationFamilies)
              .filter((f) => f.categoryId === categoryId)
              .map((f) => f.name),
          )
          let final = base
          for (let n = 2; taken.has(final); n++) final = `${base} ${n}`
          return {
            relationFamilies: {
              ...s.relationFamilies,
              [id]: {
                id,
                name: final,
                categoryId,
                nodes: [],
                edges: [],
                view: "mindmap",
              },
            },
          }
        })
        return id
      },

      renameRelationFamily: (familyId, name) =>
        set((s) => {
          const fam = s.relationFamilies[familyId]
          const next = name.trim().slice(0, 20)
          if (!fam || !next) return {}
          return {
            relationFamilies: {
              ...s.relationFamilies,
              [familyId]: { ...fam, name: next },
            },
          }
        }),

      deleteRelationFamily: (familyId) =>
        set((s) => {
          const fam = s.relationFamilies[familyId]
          if (!fam) return {}
          const relationFamilies: Record<string, RelationFamily> = {}
          for (const [fid, f] of Object.entries(s.relationFamilies)) {
            if (fid !== familyId) relationFamilies[fid] = f
          }
          // 清理族内全部节点的贡献账本记录（口径与 removeNode / removeCategory 一致）
          const prefixes = fam.nodes.map((n) => `${n.id}:`)
          const contributions = s.contributions.filter(
            (x) => !prefixes.some((p) => x.id.startsWith(p))
          )
          const activeItemId = fam.nodes.some((n) => n.id === s.activeItemId)
            ? null
            : s.activeItemId
          return { relationFamilies, contributions, activeItemId }
        }),

      // 搬迁节点：只搬节点 + 两端都在搬移集合内的边（节点本身无分类归属，跨分类搬迁只改族的节点集合）
      moveNodesToFamily: (familyId, nodeIds, targetFamilyId) =>
        set((s) => {
          if (familyId === targetFamilyId) return {}
          const src = s.relationFamilies[familyId]
          const dst = s.relationFamilies[targetFamilyId]
          if (!src || !dst) return {}
          const moving = new Set(nodeIds)
          const movedNodes = src.nodes.filter((n) => moving.has(n.id))
          if (movedNodes.length === 0) return {}
          const movedIds = new Set(movedNodes.map((n) => n.id))
          const movedEdges = src.edges.filter(
            (e) => movedIds.has(e.source) && movedIds.has(e.target)
          )
          return {
            relationFamilies: {
              ...s.relationFamilies,
              [familyId]: {
                ...src,
                nodes: src.nodes.filter((n) => !movedIds.has(n.id)),
                edges: src.edges.filter((e) => !movedEdges.includes(e)),
              },
              [targetFamilyId]: {
                ...dst,
                nodes: [...dst.nodes, ...movedNodes],
                edges: [...dst.edges, ...movedEdges],
              },
            },
          }
        }),

      setPendingFamilyId: (id) => set({ pendingFamilyId: id }),

      setSelectedDate: (date) => set({ selectedDate: date }),

      setDayNote: (date, note) =>
        set((s) => ({
          calendar: {
            ...s.calendar,
            [date]: { ...(s.calendar[date] ?? emptyDay()), note },
          },
        })),

      addCalendarTodo: (date, content) =>
        set((s) => {
          const day = s.calendar[date] ?? emptyDay()
          return {
            calendar: {
              ...s.calendar,
              [date]: {
                ...day,
                todos: [...day.todos, { id: uid(), content, done: false }],
              },
            },
          }
        }),

      toggleCalendarTodo: (date, todoId) =>
        set((s) => {
          const day = s.calendar[date] ?? emptyDay()
          return {
            calendar: {
              ...s.calendar,
              [date]: {
                ...day,
                todos: day.todos.map((t) =>
                  t.id === todoId ? { ...t, done: !t.done } : t
                ),
              },
            },
          }
        }),

      removeCalendarTodo: (date, todoId) =>
        set((s) => {
          const day = s.calendar[date] ?? emptyDay()
          return {
            calendar: {
              ...s.calendar,
              [date]: {
                ...day,
                todos: day.todos.filter((t) => t.id !== todoId),
              },
            },
          }
        }),

      addCalendarEvent: (date, time, content) =>
        set((s) => {
          const day = s.calendar[date] ?? emptyDay()
          return {
            calendar: {
              ...s.calendar,
              [date]: {
                ...day,
                events: [...day.events, { id: uid(), time, content }],
              },
            },
          }
        }),

      removeCalendarEvent: (date, eventId) =>
        set((s) => {
          const day = s.calendar[date] ?? emptyDay()
          return {
            calendar: {
              ...s.calendar,
              [date]: {
                ...day,
                events: day.events.filter((e) => e.id !== eventId),
              },
            },
          }
        }),
    }),
    {
      name: STORAGE_NAME,
      storage: createDebouncedStorage(),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.hydrated = true
          // 应用用户设置的默认视图（仅当尚未处于某个明确视图时属于启动行为）
          applyDefaultView(state)
          // pendingAiQuery / pendingFamilyId 不持久化：刷新后不应自动重发/跳转，置空保险
          state.pendingAiQuery = null
          state.pendingFamilyId = null
        }
      },
      merge: (persisted, current) => {
        const p = { ...(persisted ?? {}) } as Partial<WorkspaceState> &
          Record<string, unknown>
        // TODO 54：旧版顶层 mindmapViewports 已迁入族 viewport，整体废弃不入 state
        delete p.mindmapViewports
        // 迁移：旧版「单一模型配置」（aiProvider/aiApiKey/aiBaseUrl/aiModel）转为多模型数组。
        // 旧快照里这些字段存在但 aiModels 不存在；新用户则 aiModels 为空、由首次配置补齐。
        const rawSettings = (p.settings as Record<string, unknown> | undefined) ?? {}
        let aiModels: AIModelEntry[] = Array.isArray(rawSettings.aiModels)
          ? (rawSettings.aiModels as AIModelEntry[])
          : []
        let aiActiveModelId: string | null =
          typeof rawSettings.aiActiveModelId === "string"
            ? rawSettings.aiActiveModelId
            : null
        if (aiModels.length === 0) {
          const legacyProvider = rawSettings.aiProvider as Settings["aiModels"][number]["provider"] | undefined
          const entry: AIModelEntry = {
            id: `m_${Date.now().toString(36)}`,
            label:
              legacyProvider && AI_PROVIDERS[legacyProvider]
                ? AI_PROVIDERS[legacyProvider].label
                : "默认模型",
            provider: legacyProvider ?? "zcode",
            apiKey: typeof rawSettings.aiApiKey === "string" ? rawSettings.aiApiKey : "",
            baseUrl: typeof rawSettings.aiBaseUrl === "string" ? rawSettings.aiBaseUrl : "",
            model: typeof rawSettings.aiModel === "string" ? rawSettings.aiModel : "",
          }
          aiModels = [entry]
          aiActiveModelId = entry.id
        }
        // 迁移：旧版单一人设字符串（aiPersona）升级为多人人设列表 + 全局选中。
        const persona = migratePersona(rawSettings)
        // 若历史数据没有 settings，则并入当前默认设置
        // 关系族（TODO 54）：新格式 relationFamilies 规范化；旧格式 categories[].relation +
        // mindmapViewports 迁移为每分类一个默认族「我的分类」（id 稳定 `fam_${catId}`，viewport 随迁）；
        // 内建「待办事项」分类缺失时自动补建（含默认族）
        const relationState = migrateRelationState(p.categories, p.relationFamilies, persisted ? (persisted as Record<string, unknown>).mindmapViewports : undefined)
        return {
          ...current,
          ...p,
          // 旧存档节点可能缺失 createdAt / completedAt：补齐默认值并随本次写入持久化。
          categories: relationState.categories,
          relationFamilies: relationState.relationFamilies,
          // 跨组件跳族标记：不持久化生效
          pendingFamilyId: null,
          conversations: (p.conversations as Conversation[] | undefined) ?? [],
          activeConversationId:
            (p.activeConversationId as string | null | undefined) ?? null,
          // 贡献账本：旧存档无此字段 → 空数组（存量由 Profile 页「补算历史」补齐）
          contributions: Array.isArray(p.contributions)
            ? (p.contributions as Contribution[])
            : [],
          // GitHub 队列：旧存档无此字段 → 空数组
          issueQueue: Array.isArray(p.issueQueue)
            ? (p.issueQueue as IssueQueueItem[])
            : [],
          // 通讯录 / 自定义节日（TODO 48）：旧存档无此字段 → 空数组（TODO 48 前数据在 public/*.yml，由设置页按钮导入）
          contacts: Array.isArray(p.contacts) ? (p.contacts as Person[]) : [],
          customFestivals: Array.isArray(p.customFestivals)
            ? (p.customFestivals as FestivalDef[])
            : [],
          // 「问 AI 今日待办」会话存档：旧存档无此字段 / 坏值 → null（下次点击重新建会话）
          todayTodoAi:
            !!p.todayTodoAi &&
            typeof p.todayTodoAi === "object" &&
            typeof (p.todayTodoAi as Record<string, unknown>).dayKey === "string" &&
            typeof (p.todayTodoAi as Record<string, unknown>).conversationId === "string"
              ? (p.todayTodoAi as { dayKey: string; conversationId: string })
              : null,
          settings: {
            ...DEFAULT_SETTINGS,
            ...(rawSettings as Partial<Settings>),
            aiModels,
            aiActiveModelId,
            aiPersonas: persona.aiPersonas,
            aiActivePersonaId: persona.aiActivePersonaId,
            // 兜底：缺失 / 非法 → "04:00"
            dayStartOffset: normalizeDayStartOffset(rawSettings.dayStartOffset),
            // 兜底：旧存档 string[] 或坏值 → NotificationRepoConfig[]（每仓库套默认扫描类型）
            notificationRepos: normalizeNotificationRepos(rawSettings.notificationRepos),
            // 兜底：旧存档无此字段 / 坏值 → 默认（builtin 开、qq 关）
            notificationChannels: normalizeNotificationChannels(rawSettings.notificationChannels),
            // 兜底（TODO 49）：缺失 / 非布尔值 → 开启（仅显式 false 才关闭）
            scanAdaptive: rawSettings.scanAdaptive !== false,
            // 兜底：旧存档无此字段 / 非法 → 默认 QQ 中转地址
            qqRelayUrl: normalizeQqRelayUrl(rawSettings.qqRelayUrl),
            // 兜底（TODO 52）：缺失 / 非法 → 默认组件顺序（合法 id 去重 + 缺失补齐）
            profileWidgetOrder: normalizeProfileWidgetOrder(rawSettings.profileWidgetOrder),
          },
        }
      },
    }
  )
)

function applyDefaultView(state: WorkspaceState) {
  const dv: DefaultView = state.settings?.defaultView ?? "ai-chat"
  // "last"：view/activeCategoryId 本身已持久化，rehydrate 出来的就是上次的视图，什么都不做即可
  if (dv === "last") return
  if (dv === "ai-chat" && state.view !== "ai-chat") {
    state.view = "ai-chat"
    state.activeCategoryId = null
  }
  if (dv === "calendar" && state.view !== "calendar") {
    state.view = "calendar"
    state.activeCategoryId = null
  }
}

function iconForTemplate(t: TemplateType): string {
  switch (t) {
    case "novel":
      return "BookOpen"
    case "study":
      return "GraduationCap"
    case "work":
      return "Briefcase"
    case "life":
      return "Home"
    case "relation":
      return "Workflow"
    default:
      return "SquarePen"
  }
}

// 依据单位（unit）生成标题，如 unit="章" → "第%章" + 序号 => "第一章"。
// unit 为单位语义的唯一来源，同时决定导航「上一X/下一X」与自动编号标题。
export function buildTitle(config: CategoryConfig, index: number): string {
  const rule = `第%${config.unit || "章"}`
  const num =
    config.autoNumber !== false ? toChineseNumber(index) : String(index)
  if (rule.includes("%")) return rule.replace("%", num)
  return `${rule} ${num}`
}

export function toChineseNumber(n: number): string {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"]
  const units = ["", "十", "百", "千"]
  if (n === 0) return "零"
  if (n < 0) return String(n)
  if (n <= 10) return n === 10 ? "十" : digits[n]
  if (n < 20) return "十" + digits[n - 10]
  if (n < 100) {
    const tens = Math.floor(n / 10)
    const ones = n % 10
    return digits[tens] + "十" + (ones ? digits[ones] : "")
  }
  // 100-999
  let result = ""
  const str = String(n)
  for (let i = 0; i < str.length; i++) {
    const d = Number(str[i])
    const unit = units[str.length - 1 - i]
    if (d === 0) {
      if (!result.endsWith("零") && i !== str.length - 1) result += "零"
    } else {
      result += digits[d] + unit
    }
  }
  return result.replace(/零+$/, "")
}
