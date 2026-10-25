"use client"

import { create } from "zustand"
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware"
import type {
  Category,
  CalendarData,
  Chapter,
  MindNode,
  SolutionStatus,
  TemplateType,
  CategoryConfig,
  Settings,
  ShortcutAction,
  ShortcutBinding,
  ConnectResult,
  Conversation,
  AIChatMessage,
  Contribution,
  ContributionType,
  NotificationItem,
  NotificationLogEntry,
  MindmapViewport,
  RelationFamily,
  IssueQueueItem,
  IssueQueueColumn,
  BackupSections,
  Person,
  FestivalDef,
} from "./types"
// persist merge 迁移（TODO 83）：纯数据变换抽成独立模块；store 仅复用其 merge 入口
import { mergePersistedState } from "./persist-merge"
// 切片共享纯工具（TODO 85）：独立模块避免 slices → store.ts 值 import 形成运行时循环
import { applyDefaultView } from "./store/shared"
// 领域切片（TODO 85）：store.ts 退化为组合层，全部状态/action 按领域拆分到 slices/
import { createCalendarSlice } from "./store/slices/calendar-slice"
import { createSettingsSlice } from "./store/slices/settings-slice"
import { createUiSlice } from "./store/slices/ui-slice"
import { createCategoriesSlice } from "./store/slices/categories-slice"
import { createAiSlice } from "./store/slices/ai-slice"
import { createContactsSlice } from "./store/slices/contacts-slice"
import { createRelationsSlice } from "./store/slices/relations-slice"
import { createNotificationsSlice } from "./store/slices/notifications-slice"
import { createContributionsSlice } from "./store/slices/contributions-slice"
import { createIssueQueueSlice } from "./store/slices/issue-queue-slice"
import { createTagsSlice } from "./store/slices/tags-slice"
import { createBackupSlice } from "./store/slices/backup-slice"

/** 全量工作区状态（含 actions）。导出供 lib/persist-merge.ts 的 merge 迁移做类型标注（TODO 83） */
export interface WorkspaceState {
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
    | "vocabulary"
  selectedDate: string
  hydrated: boolean

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

  conversations: Conversation[]
  activeConversationId: string | null
  // 外部（如日历 DayDetail）触发的"打开 AI 闲聊并自动询问"：携带待发送 query；消费后清空（不持久化）。
  pendingAiQuery: string | null
  // Profile「问 AI 今日待办」的会话存档（按 dayStartOffset 翻篇时间划分"今天"）：
  // 记录今天那次询问所在的会话 id，当天内重复点击直接复用该会话，跨天/会话被删后重建。
  todayTodoAi: { dayKey: string; conversationId: string } | null

  // 贡献账本（Profile 热力图数据源）：每条为一次「新建/完成节点」事件（真账本，非派生）
  contributions: Contribution[]

  // 站内通知（TODO 20 / 18，GitHub sender 等入库）：按「发现时间」降序，上限 200 条（超出截断最旧）
  notifications: NotificationItem[]
  // 通知系统日志（TODO 27）：每轮扫描检查了哪些仓库/发现哪些新内容、是否发送提示；按 at 降序，上限 500 条
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
  // 新闻精选上次触发时刻（epoch ms，TODO 23）：与 18:00 周期起点比对判断本周期是否已拉取；null = 从未拉过
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
  goVocabulary: () => void

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

  updateSettings: (patch: Partial<Settings>) => void
  setShortcut: (action: ShortcutAction, binding: ShortcutBinding) => void
  setAddCategoryOpen: (v: boolean) => void
  setConfigEditorOpen: (v: boolean) => void
  setImagesOpen: (v: boolean) => void

  setCalendarDetailWidth: (w: number) => void

  setSidebarWidth: (w: number) => void
  setSidebarCollapsed: (v: boolean) => void
  // 侧边栏收起后贴边悬浮开关的纵向位置（距视口顶部 px；null = 默认垂直居中），拖动后持久化
  sidebarToggleY: number | null
  setSidebarToggleY: (y: number) => void
  setToolbarCollapsed: (v: boolean) => void

  // 全局标签库（导入联系人 roles 等）：并入去重后的标签，已存在则忽略
  addKnownTags: (tags: string[]) => void
  /** 全站重命名标签（TODO 67）：随笔章节 / 思维图节点 / 联系人角色 / 全局标签库同步替换；目标名已被使用时自动合并（去重）。返回修改的使用处数量 */
  renameTag: (from: string, to: string) => number
  /** 全站删除标签（TODO 67）：从章节 / 思维图节点 / 联系人角色 / 全局标签库移除。返回清理的使用处数量（不含标签库条目本身） */
  deleteTag: (name: string) => number

  /** 导出 store 快照为 JSON；sections 指定导出分区（TODO 41），缺省口径见实现内注释 */
  exportData: (sections?: BackupSections) => string | null
  importData: (json: string) => boolean
  mergeData: (json: string) => boolean

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
  /** 通知入库（TODO 20 / 18）：按 id 去重合并（已有条目保留原样），按「发现时间」降序，上限 200 条截断最旧。 */
  addNotifications: (items: NotificationItem[]) => void
  // 追加通知系统日志（TODO 27）：按 id 去重、at 降序、上限 500 条
  appendNotificationLogs: (entries: NotificationLogEntry[]) => void
  setNotificationWatermark: (ms: number) => void
  setLastActiveAt: (ms: number) => void
  markNotificationsRead: () => void
  setLastWaterRemindAt: (ms: number) => void
  setLastStandRemindAt: (ms: number) => void
  setNewsLastFetchedAt: (ms: number) => void

  /** 拉取到的 issue/PR 加入队列：按 id 去重（已存在则覆盖，保留其当前所在列） */
  addToIssueQueue: (items: IssueQueueItem[]) => void
  /** 移动某卡片到指定列（手动搬运 = 重新入队，刷新 queuedAt 让卡片浮到新列顶） */
  moveIssueQueueItem: (id: string, column: IssueQueueColumn) => void
  removeIssueQueueItem: (id: string) => void
  /** 批量回写 issue/PR 状态标记（state/merged）：监听收到 close/merge/reopen 事件时联动；列与排序位次不动 */
  syncIssueQueueStates: (
    entries: Array<{ id: string; state: "open" | "closed"; merged: boolean }>
  ) => void

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
  setFamilyView: (familyId: string, view: "mindmap" | "list") => void
  setFamilyViewport: (familyId: string, viewport: MindmapViewport) => void

  /** 新建族：返回新族 id（默认命名「我的分类」） */
  addRelationFamily: (categoryId: string, name?: string) => string
  renameRelationFamily: (familyId: string, name: string) => void
  /** 删除族：清理族内全部节点的贡献账本记录 */
  deleteRelationFamily: (familyId: string) => void
  /** 调整族在族列表中的位置（TODO 69）：toIndex 为同分类族数组的目标插入索引（0..len，原数组口径）；顺序承载在 relationFamilies 的 key 顺序上 */
  moveRelationFamily: (familyId: string, toIndex: number) => void
  /** 搬迁节点：只搬节点 + 两端都在搬移集合内的边（跨分类搬迁不改族归属字段以外的东西） */
  moveNodesToFamily: (familyId: string, nodeIds: string[], targetFamilyId: string) => void
  setPendingFamilyId: (id: string | null) => void

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

/** 防抖持久化：zustand 每次 set() 都会同步 JSON.stringify 全量状态写 localStorage，
 * 这里 setItem 只暂存对象、静止 800ms 后才落盘；pagehide / 切后台立即 flush，最多丢最后 800ms 的变更。 */
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
      ...createUiSlice(set),
      ...createSettingsSlice(set),
      ...createCalendarSlice(set),
      ...createCategoriesSlice(set),
      ...createAiSlice(set, get),
      ...createContactsSlice(set),
      ...createRelationsSlice(set, get),
      ...createNotificationsSlice(set),
      ...createContributionsSlice(set, get),
      ...createIssueQueueSlice(set),
      ...createTagsSlice(set, get),
      ...createBackupSlice(set, get),

      // rehydrate 时由 onRehydrateStorage 置 true；初始值 false
      hydrated: false,

    }),
    {
      name: STORAGE_NAME,
      storage: createDebouncedStorage(),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.hydrated = true
          applyDefaultView(state)
          // pendingAiQuery / pendingFamilyId 不持久化：刷新后不应自动重发/跳转，置空保险
          state.pendingAiQuery = null
          state.pendingFamilyId = null
        }
      },
      merge: mergePersistedState,
    }
  )
)
