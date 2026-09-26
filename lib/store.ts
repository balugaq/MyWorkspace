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
} from "./types"
import { DEFAULT_SETTINGS, CONTRIBUTION_AMOUNT, normalizeNotificationRepos, normalizeNotificationChannels, normalizeQqRelayUrl, type AIPersona } from "./types"
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
function normalizeCategoryNodes(cats: Category[]): Category[] {
  return cats.map((c) => {
    if (!c.relation || !Array.isArray(c.relation.nodes) || c.relation.nodes.length === 0)
      return c
    let changed = false
    const nodes = c.relation.nodes.map((n) => {
      const next = { ...n }
      if (typeof next.createdAt !== "number") {
        next.createdAt = LEGACY_NODE_TIME
        changed = true
      }
      if (next.completedAt === undefined) {
        next.completedAt = LEGACY_NODE_TIME
        changed = true
      }
      return next
    })
    return changed ? { ...c, relation: { ...c.relation, nodes } } : c
  })
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

  // 天气：用户所选城市代码（9 位市级码），持久化以便刷新后保留；实时数据本身不持久化
  weatherCityCode: string

  // AI 助手：多会话（各自持有上下文，持久化到 localStorage）
  conversations: Conversation[]
  activeConversationId: string | null
  // 外部（如日历 DayDetail）触发的"打开 AI 闲聊并自动询问"：携带待发送 query；消费后清空（不持久化）。
  pendingAiQuery: string | null

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

  // 关系类思维图视口存档（key = category.id）：保存上次浏览的 scale 及 x,y，重挂载后恢复
  mindmapViewports: Record<string, MindmapViewport>

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

  // AI 助手：多会话管理（各自持有上下文）
  createConversation: () => string
  selectConversation: (id: string) => void
  deleteConversation: (id: string) => void
  renameConversation: (id: string, title: string) => void
  togglePinConversation: (id: string) => void
  setConversationMessages: (id: string, messages: AIChatMessage[]) => void
  // 外部触发：新建会话并切到 AI 闲聊，携带一条待发送 query（由 AI 聊天界面消费后清空）
  askAiAbout: (text: string) => void
  clearPendingAiQuery: () => void

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

  // 天气：设置所选城市代码
  setWeatherCityCode: (code: string) => void

  // 全局标签库（导入联系人 roles 等）：并入去重后的标签，已存在则忽略
  addKnownTags: (tags: string[]) => void

  // 数据备份
  exportData: () => string | null
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

  // 思维导图
  addNode: (catId: string, position?: { x: number; y: number }, title?: string) => string
  /** 添加子节点（统一入口）：以「父标题 序号」避重命名、置于父节点右侧并自动连线，
   *  末尾显式 setActiveItem(childId) 保证详情面板切到新节点。返回子节点 id（失败为 null）。 */
  addChildNode: (catId: string, parentId: string) => string | null
  updateNode: (catId: string, nodeId: string, patch: Partial<MindNode>) => void
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
  setNodeSolution: (
    catId: string,
    nodeId: string,
    content: string,
    status: SolutionStatus
  ) => void
  connectNodes: (
    catId: string,
    source: string,
    target: string,
    kind: "flow" | "sub"
  ) => ConnectResult
  removeEdge: (catId: string, edgeId: string) => void
  removeSub: (catId: string, nodeId: string, subId: string) => void
  setRelationView: (catId: string, view: "mindmap" | "list") => void
  setMindmapViewport: (categoryId: string, viewport: MindmapViewport) => void

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

      // 天气：默认无城市，需用户在天气卡片中手动选择
      weatherCityCode: "",

      // AI 助手：默认无会话（视图挂载时若无会话则创建一个），不预置 activeConversationId
      conversations: [],
      activeConversationId: null,
      pendingAiQuery: null,

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

      // 关系图视口存档：默认空（首次进入画布走 fitView 自适应）
      mindmapViewports: {},

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

      setWeatherCityCode: (code) => set({ weatherCityCode: code }),

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

      exportData: () => {
        const s = get()
        try {
          return JSON.stringify(
            {
              version: 1,
              exportedAt: new Date().toISOString(),
              categories: s.categories,
              calendar: s.calendar,
              settings: s.settings,
              conversations: s.conversations,
              activeConversationId: s.activeConversationId,
              // 贡献账本（v4 起纳入备份；旧备份无此字段 → 导入时保留当前账本）
              contributions: s.contributions,
            },
            null,
            2
          )
        } catch {
          return null
        }
      },

      importData: (json) => {
        try {
          const data = JSON.parse(json)
          if (
            !data ||
            !Array.isArray(data.categories) ||
            typeof data.calendar !== "object"
          )
            return false
          // AI 对话：仅当备份显式包含 conversations 时才覆盖（旧版无此字段则保留当前对话）。
          const convs = Array.isArray(data.conversations)
            ? (data.conversations as Conversation[])
            : null
          // 贡献账本：仅当备份显式包含数组时才覆盖（旧备份无此字段 → 保留当前账本，不清空）
          const bContribs = Array.isArray(data.contributions)
            ? (data.contributions as Contribution[])
            : null
          const cur = get()
          const persona = migratePersona((data.settings ?? {}) as Record<string, unknown>)
          set({
            categories: normalizeCategoryNodes(data.categories as Category[]),
            calendar: data.calendar as CalendarData,
            settings: {
              ...DEFAULT_SETTINGS,
              ...(data.settings ?? {}),
              aiPersonas: persona.aiPersonas,
              aiActivePersonaId: persona.aiActivePersonaId,
              // 兜底：备份里的 dayStartOffset 缺失 / 非法 → "04:00"
              dayStartOffset: normalizeDayStartOffset(
                (data.settings as Record<string, unknown> | undefined)?.dayStartOffset
              ),
              // 兜底：旧备份 string[] 或坏值 → NotificationRepoConfig[]
              notificationRepos: normalizeNotificationRepos(
                (data.settings as Record<string, unknown> | undefined)?.notificationRepos
              ),
              // 兜底：备份里的渠道配置缺失 / 坏值 → 默认（builtin 开、qq 关）
              notificationChannels: normalizeNotificationChannels(
                (data.settings as Record<string, unknown> | undefined)?.notificationChannels
              ),
              // 兜底：备份里的 QQ 中转地址缺失 / 非法 → 默认地址
              qqRelayUrl: normalizeQqRelayUrl(
                (data.settings as Record<string, unknown> | undefined)?.qqRelayUrl
              ),
            } as Settings,
            conversations: convs ?? cur.conversations,
            activeConversationId: convs
              ? (convs.find((c) => c.id === data.activeConversationId)
                  ? data.activeConversationId
                  : convs[0]?.id ?? null)
              : cur.activeConversationId,
            // 账本：备份显式包含则覆盖，否则保留当前（向后兼容旧备份）
            contributions: bContribs ?? cur.contributions,
            activeCategoryId: data.categories[0]?.id ?? null,
            activeItemId: null,
            view: "workspace",
          })
          return true
        } catch {
          return false
        }
      },

      // 合并导入：分类按 id、日历按日期合并，保留当前 settings 与视图状态。
      mergeData: (json) => {
        try {
          const data = JSON.parse(json)
          if (
            !data ||
            !Array.isArray(data.categories) ||
            typeof data.calendar !== "object"
          )
            return false
          const cur = get()
          // 分类：按 id 合并（备份覆盖同 id，新 id 追加）
          const catMap = new Map<string, Category>()
          for (const c of cur.categories) catMap.set(c.id, c)
          for (const c of data.categories as Category[]) catMap.set(c.id, c)
          const categories = normalizeCategoryNodes([...catMap.values()])
          // 日历：按日期合并
          const calendar: CalendarData = { ...cur.calendar }
          const bCal = data.calendar as CalendarData
          for (const date of Object.keys(bCal)) {
            const bDay = bCal[date]
            const cDay = calendar[date]
            calendar[date] = cDay ? mergeCalendarDay(cDay, bDay) : bDay
          }
          // 贡献账本：仅当备份包含 contributions 时按 id 合并（同 id 覆盖，新 id 追加），否则完全不碰。
          const bContribs = Array.isArray(data.contributions)
            ? (data.contributions as Contribution[])
            : null
          // 分类 + 日历 +（可选）账本：合并模式下的公共载荷，两个分支共用
          const base: {
            categories: Category[]
            calendar: CalendarData
            contributions?: Contribution[]
          } = { categories, calendar }
          if (bContribs) {
            const contribMap = new Map<string, Contribution>()
            for (const x of cur.contributions) contribMap.set(x.id, x)
            for (const x of bContribs) contribMap.set(x.id, x)
            base.contributions = [...contribMap.values()]
          }
          // AI 对话：仅当备份包含 conversations 时按 id 合并（同 id 覆盖，新 id 追加），
          // 否则保留当前对话；合并模式不改动当前选中的会话（若仍存在于结果中）。
          const bConvs = data.conversations as Conversation[] | undefined
          if (Array.isArray(bConvs)) {
            const convMap = new Map<string, Conversation>()
            for (const c of cur.conversations) convMap.set(c.id, c)
            for (const c of bConvs) convMap.set(c.id, c)
            const conversations = [...convMap.values()]
            const activeConversationId =
              cur.activeConversationId && convMap.has(cur.activeConversationId)
                ? cur.activeConversationId
                : (conversations[0]?.id ?? null)
            set({ ...base, conversations, activeConversationId })
          } else {
            set(base)
          }
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
        if (template === "relation") {
          cat.relation = { nodes: [], edges: [], view: "mindmap" }
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
          activeCategoryId: id,
          activeItemId: null,
          view: "workspace",
        }))
        return id
      },

      removeCategory: (id) =>
        set((s) => {
          const removing = s.categories.find((c) => c.id === id)
          const categories = s.categories.filter((c) => c.id !== id)
          const activeCategoryId =
            s.activeCategoryId === id
              ? (categories[0]?.id ?? null)
              : s.activeCategoryId
          // 账本：删整个关系型分类 = 连带删掉其下所有节点，口径与 removeNode 一致
          let contributions = s.contributions
          if (removing?.relation && removing.relation.nodes.length > 0) {
            const prefixes = removing.relation.nodes.map((n) => `${n.id}:`)
            const kept = s.contributions.filter(
              (x) => !prefixes.some((p) => x.id.startsWith(p))
            )
            // 未命中则保持原引用，避免无谓重渲染
            if (kept.length !== s.contributions.length) contributions = kept
          }
          return { categories, activeCategoryId, activeItemId: null, contributions }
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

      addNode: (catId, position, title) => {
        const id = uid()
        const now = Date.now()
        const nodeTitle = title ?? "新节点"
        set((s) => {
          const cat = s.categories.find((c) => c.id === catId)
          // 目标分类不存在 / 非 relation：不建节点（保留 activeItemId 行为）
          if (!cat || !cat.relation) return { activeItemId: id }
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
            categories: s.categories.map((c) =>
              c.id === catId && c.relation
                ? {
                    ...c,
                    relation: { ...c.relation, nodes: [...c.relation.nodes, node] },
                  }
                : c
            ),
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
      addChildNode: (catId, parentId) => {
        const s = get()
        const cat = s.categories.find((c) => c.id === catId)
        if (!cat || !cat.relation) return null
        const parent = cat.relation.nodes.find((n) => n.id === parentId)
        if (!parent) return null
        const base = parent.title?.trim() || "新节点"
        const existing = new Set(cat.relation.nodes.map((n) => (n.title ?? "").trim()))
        let seq = 1
        while (existing.has(`${base} ${seq}`)) seq++
        const pos = parent.position ?? { x: 200, y: 120 }
        const childId = s.addNode(catId, { x: pos.x + 300, y: pos.y }, `${base} ${seq}`)
        s.connectNodes(catId, parentId, childId, "flow")
        s.setActiveItem(childId)
        return childId
      },

      updateNode: (catId, nodeId, patch) =>
        set((s) => {
          const cat = s.categories.find((c) => c.id === catId)
          if (!cat || !cat.relation) return {}
          const prev = cat.relation.nodes.find((n) => n.id === nodeId)
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

          const categories = s.categories.map((c) =>
            c.id === catId && c.relation
              ? {
                  ...c,
                  relation: {
                    ...c.relation,
                    nodes: c.relation.nodes.map((n) => (n.id === nodeId ? next : n)),
                  },
                }
              : c
          )

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

          return { categories, contributions }
        }),

      removeNode: (catId, nodeId) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === catId && c.relation
              ? {
                  ...c,
                  relation: {
                    ...c.relation,
                    nodes: c.relation.nodes
                      .filter((n) => n.id !== nodeId)
                      .map((n) =>
                        n.sub.includes(nodeId)
                          ? { ...n, sub: n.sub.filter((x) => x !== nodeId) }
                          : n
                      ),
                    edges: c.relation.edges.filter(
                      (e) => e.source !== nodeId && e.target !== nodeId
                    ),
                  },
                }
              : c
          ),
          // 记账：删除节点 → 清掉该节点全部条（id 形如 `${nodeId}:created` / `${nodeId}:done`）。
          // 注：removeNode 非递归，子节点会存活（仅从父节点 sub 解绑），故只清本节点记录。
          contributions: s.contributions.filter((x) => !x.id.startsWith(`${nodeId}:`)),
          activeItemId: s.activeItemId === nodeId ? null : s.activeItemId,
        })),

      // 一次性存量补算（幂等）：为账本缺失的节点补 created / done 记录，返回新增条数。
      // 临时功能：入口在 Profile 页「补算历史」按钮，主人用完会要求删除 —— 与按钮一并摘除。
      scanLegacyContributions: () => {
        let added = 0
        set((s) => {
          const existing = new Set(s.contributions.map((c) => c.id))
          const next = [...s.contributions]
          for (const c of s.categories) {
            if (!c.relation) continue
            for (const n of c.relation.nodes) {
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

      setNodeSolution: (catId, nodeId, content, status) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === catId && c.relation
              ? {
                  ...c,
                  relation: {
                    ...c.relation,
                    nodes: c.relation.nodes.map((n) =>
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
                }
              : c
          ),
        })),

      connectNodes: (catId, source, target, kind) => {
        let result: ConnectResult = "invalid"
        set((s) => {
          const cat = s.categories.find((c) => c.id === catId)
          if (!cat || !cat.relation) return s
          if (source === target) {
            result = "invalid"
            return s
          }
          const exists = cat.relation.edges.some(
            (e) => e.source === source && e.target === target
          )
          if (exists) {
            result = "exists"
            return s
          }
          const edge: MindEdge = { id: uid(), source, target, kind }
          let nodes = cat.relation.nodes
          if (kind === "sub") {
            nodes = nodes.map((n) =>
              n.id === source && !n.sub.includes(target)
                ? { ...n, sub: [...n.sub, target] }
                : n
            )
          }
          result = "created"
          return {
            categories: s.categories.map((c) =>
              c.id === catId && c.relation
                ? {
                    ...c,
                    relation: {
                      ...c.relation,
                      edges: [...c.relation.edges, edge],
                      nodes,
                    },
                  }
                : c
            ),
          }
        })
        return result
      },

      removeEdge: (catId, edgeId) =>
        set((s) => ({
          categories: s.categories.map((c) => {
            if (c.id !== catId || !c.relation) return c
            const edge = c.relation.edges.find((e) => e.id === edgeId)
            const nodes =
              edge && edge.kind === "sub"
                ? c.relation.nodes.map((n) =>
                    n.id === edge.source
                      ? { ...n, sub: n.sub.filter((x) => x !== edge.target) }
                      : n
                  )
                : c.relation.nodes
            return {
              ...c,
              relation: {
                ...c.relation,
                edges: c.relation.edges.filter((e) => e.id !== edgeId),
                nodes,
              },
            }
          }),
        })),

      removeSub: (catId, nodeId, subId) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === catId && c.relation
              ? {
                  ...c,
                  relation: {
                    ...c.relation,
                    nodes: c.relation.nodes.map((n) =>
                      n.id === nodeId
                        ? { ...n, sub: n.sub.filter((x) => x !== subId) }
                        : n
                    ),
                    edges: c.relation.edges.filter(
                      (e) =>
                        !(
                          e.kind === "sub" &&
                          e.source === nodeId &&
                          e.target === subId
                        )
                    ),
                  },
                }
              : c
          ),
        })),

      setRelationView: (catId, view) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === catId && c.relation
              ? { ...c, relation: { ...c.relation, view } }
              : c
          ),
        })),

      setMindmapViewport: (categoryId, viewport) =>
        set((s) => ({
          mindmapViewports: {
            ...s.mindmapViewports,
            [categoryId]: viewport,
          },
        })),

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
          // pendingAiQuery 不持久化：刷新后不应自动重发，置空保险
          state.pendingAiQuery = null
        }
      },
      merge: (persisted, current) => {
        const p = { ...(persisted ?? {}) } as Partial<WorkspaceState> &
          Record<string, unknown>
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
        return {
          ...current,
          ...p,
          // 旧存档节点可能缺失 createdAt / completedAt：补齐默认值并随本次写入持久化。
          categories: Array.isArray(p.categories)
            ? normalizeCategoryNodes(p.categories)
            : current.categories,
          conversations: (p.conversations as Conversation[] | undefined) ?? [],
          activeConversationId:
            (p.activeConversationId as string | null | undefined) ?? null,
          // 贡献账本：旧存档无此字段 → 空数组（存量由 Profile 页「补算历史」补齐）
          contributions: Array.isArray(p.contributions)
            ? (p.contributions as Contribution[])
            : [],
          // 关系图视口存档：旧存档无此字段 → 空对象
          mindmapViewports:
            (p.mindmapViewports as Record<string, MindmapViewport> | undefined) ??
            {},
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
            // 兜底：旧存档无此字段 / 非法 → 默认 QQ 中转地址
            qqRelayUrl: normalizeQqRelayUrl(rawSettings.qqRelayUrl),
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
