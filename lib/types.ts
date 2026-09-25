// 模板类型
export type TemplateType =
  | "novel"
  | "study"
  | "work"
  | "life"
  | "relation"
  | "calendar"
  | "custom"

// 解决方案状态
export type SolutionStatus = "doing" | "paused" | "done"

// 小说类 / 通用类的条目（章节、笔记条目等）
export interface Chapter {
  id: string
  index: number
  title: string
  content: string
  tags: string[]
  done?: boolean
}

// 思维导图节点上的解决方案
export interface Solution {
  content: string
  status: SolutionStatus
}

// 思维导图 Todo 节点
export interface MindNode {
  id: string
  title: string
  content: string
  cause: string // 原因
  leadTo: string // 导向
  result: string // 结果
  sub: string[] // 子任务节点 id 列表
  solution: Solution | null
  position: { x: number; y: number }
  solutionPosition?: { x: number; y: number } // 解决方案节点的独立位置（可拖拽后记忆）
  tags?: string[] // 与章节共用的标签体系
  dueDate?: string | null // 截止日期 yyyy-MM-dd；null / 缺省 = 长期任务
  longTerm?: boolean // 是否为长期任务（true 时不显示在日历）
  done?: boolean // 节点本身是否已完成
  createdAt?: number // 节点创建时间（epoch ms）；旧存档缺失时由迁移逻辑补齐
  completedAt?: number | null // 节点完成时间（epoch ms）；null = 未完成；旧存档缺失时由迁移逻辑补齐
  hidden?: boolean // 是否在图里隐藏（隐藏后仅列表显示）
  /** 单图节点的图片缩放倍数（1 = 100%）；仅当节点内容恰好含 1 张图时生效，范围 0.1–4 */
  imageZoom?: number
  /** 节点风格：边框颜色，ARGB 十六进制（#AARRGGBB；缺 alpha 视为不透明 #RRGGBB）。
   *  为空时回落到主题默认（border-border）。 */
  borderColor?: string
  /** 节点风格：背景颜色，ARGB 十六进制（同 borderColor 格式）。
   *  为空时回落到主题默认（bg-card）。 */
  bgColor?: string
}

// 节点之间的连线
export interface MindEdge {
  id: string
  source: string
  target: string
  kind: "flow" | "sub" | "solution"
}

// connectNodes 的结果
export type ConnectResult = "created" | "exists" | "invalid"

// 关系类思维图视口（与 @xyflow/react 的 Viewport 结构一致），持久化保存上次浏览位置
export type MindmapViewport = { x: number; y: number; zoom: number }

export interface RelationContent {
  nodes: MindNode[]
  edges: MindEdge[]
  view: "mindmap" | "list"
}

export interface CategoryConfig {
  autoNumber?: boolean
  unit?: string // 单条目单位（量词），如 "章" "首" "回" "条" "课"；唯一来源，同时决定导航「上一X/下一X」与自动编号标题「第%X」，缺省回退为 "章"
}

// 分类
export interface Category {
  id: string
  name: string
  template: TemplateType
  icon: string
  config: CategoryConfig
  builtin?: boolean
  chapters?: Chapter[] // novel / study / work / life / custom
  relation?: RelationContent // relation
}

// 日历
export interface CalendarTodo {
  id: string
  content: string
  done: boolean
}

export interface CalendarEvent {
  id: string
  time: string
  content: string
}

export interface CalendarDay {
  note: string
  todos: CalendarTodo[]
  events: CalendarEvent[]
}

export type CalendarData = Record<string, CalendarDay> // key: yyyy-MM-dd

// ---- 贡献账本（Profile 热力图数据源）----

/**
 * 贡献类型。含思维图节点的「新建 / 完成」两类，每日签到（TODO 9 已实现），以及专注钟（TODO 10 已实现）。
 */
export type ContributionType =
  | "mindmap-node-created"
  | "mindmap-node-done"
  | "check-in" // 签到（TODO 9 已实现）
  | "focus" // 专注钟（TODO 10 已实现）
  | "github-commit" // GitHub commit（TODO 18：committer/author 与「Git 本地名称」一致计 1）
  | "github-issue" // GitHub issue（TODO 18：作者与「Git 本地名称」一致计 2）
  | "github-pr" // GitHub PR（TODO 18：作者与「Git 本地名称」一致计 2）

/**
 * 一条贡献记录（**真账本，非派生**）。
 * 存「发生时间 `at`」，读取时按当前 `settings.dayStartOffset` 现算所属日 —— 改翻篇时间后历史会重新分桶。
 */
export interface Contribution {
  /** 复合 id：`${nodeId}:created` | `${nodeId}:done`（唯一，且可从 id 反查节点，便于删除时清理） */
  id: string
  /** 发生时间（epoch ms） */
  at: number
  /** 贡献值：新建 0.2 / 完成 1 */
  amount: number
  type: ContributionType
  /** 快照：写入时节点的 title（之后改标题不回填） */
  content: string
}

/** 各贡献类型的权重（唯一来源，集中管理）。
 *  注：`focus` 的 0 为占位；真实 amount 由专注分钟运行时算（floor(分钟 / 10)），不读此值。 */
export const CONTRIBUTION_AMOUNT: Record<ContributionType, number> = {
  "mindmap-node-created": 0.2,
  "mindmap-node-done": 1,
  "check-in": 2,
  "focus": 0,
  "github-commit": 1,
  "github-issue": 2,
  "github-pr": 2,
}

// ---- 站内通知（TODO 20 / TODO 18：通知中心 + GitHub sender）----

export type NotificationKind = "commit" | "issue" | "pr" | "release"

export interface NotificationItem {
  /** 幂等去重键：gh:commit:{owner}/{repo}:{sha} | gh:issue:{owner}/{repo}:{number} | gh:pr:{owner}/{repo}:{number} | gh:release:{owner}/{repo}:{id} */
  id: string
  /** 内置 sender 标识，固定 "github"；未来扩展新 sender 用 */
  senderId: string
  kind: NotificationKind
  /** 仓库，格式 owner/name */
  repo: string
  title: string
  /** 正文/描述摘要 */
  brief: string
  /** 跳转用的 html_url */
  url: string
  /** committer/author/login */
  actor: string
  /** 发生时间（ISO 字符串） */
  createdAt: string
}

// 全局搜索结果
export type SearchScope = "all" | "category" | "calendar" | "todo" | "mindmap"

export interface SearchResult {
  id: string
  type: "chapter" | "node" | "note" | "solution" | "calendar-todo"
  typeLabel: string
  title: string
  snippet: string
  source: string
  categoryId: string | null
  targetId: string | null // chapter/node id or date
  date?: string
}

// 模板元信息
export interface TemplateMeta {
  type: TemplateType
  label: string
  icon: string
  description: string
}

export const TEMPLATES: TemplateMeta[] = [  { type: "novel", label: "小说类", icon: "BookOpen", description: "自动生成章节目录，适合诗集、小说、连载" },
  { type: "study", label: "学习类", icon: "GraduationCap", description: "知识笔记与学习条目管理" },
  { type: "work", label: "工作类", icon: "Briefcase", description: "工作文档与任务清单" },
  { type: "life", label: "生活类", icon: "Home", description: "生活记录与随手笔记" },
  { type: "relation", label: "关系类", icon: "Workflow", description: "思维导图模式，管理 Todo 之间的因果关系" },
  { type: "custom", label: "自定义", icon: "SquarePen", description: "空白分类，自由记录" },
]

export const STATUS_META: Record<SolutionStatus, { label: string; symbol: string }> = {
  doing: { label: "正在做", symbol: "●" },
  paused: { label: "暂停", symbol: "○" },
  done: { label: "已完成", symbol: "✓" },
}

// ---- 系统设置 / 快捷键 ----

// 可自定义的全局快捷键动作
export type ShortcutAction = "newCategory" | "goCalendar" | "search"

// 一个组合键绑定：modifier=true 表示配合 Ctrl/Cmd 使用
export interface ShortcutBinding {
  modifier: boolean // Ctrl / Cmd
  key: string // 单字符，如 "n" / "b" / "k"
}

export interface ShortcutMeta {
  action: ShortcutAction
  label: string
  description: string
  defaults: ShortcutBinding
}

export const SHORTCUT_META: ShortcutMeta[] = [
  { action: "newCategory", label: "新建分类", description: "打开“添加分类”弹窗", defaults: { modifier: true, key: "m" } },
  { action: "goCalendar", label: "打开日历", description: "切换到日历视图", defaults: { modifier: true, key: "b" } },
  { action: "search", label: "全局搜索", description: "打开全局搜索", defaults: { modifier: true, key: "k" } },
]

// AI 供应商选择（见 lib/ai/providers.ts）
export type AIProviderId = "zcode" | "deepseek" | "custom"

// AI 人设：可创建多个，供全局选择使用（注入每段 AI 对话的 system 提示词）。
export interface AIPersona {
  id: string
  name: string // 展示名
  content: string // 人设正文（自定义指令）
}

// AI 助手：单条对话消息（用户 / 助手）
export interface AIChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  /** 消息创建时间（epoch ms）；用于对话列表按时间分组与置顶排序。旧存档消息可能缺失，分组时回落 updatedAt/createdAt */
  createdAt?: number
  /** 本次回复过程中 AI 调用过的技能（用于 UI 展示） */
  tools?: { name: string; display?: string; result?: string }[]
  /** 该轮（助手消息）消耗的 token（来自 OpenAI 兼容 usage）；用于状态栏汇总 */
  tokens?: { input: number; output: number }
}

// AI 助手：一个独立对话（各自持有完整上下文，持久化到 localStorage）
export interface Conversation {
  id: string
  title: string
  messages: AIChatMessage[]
  createdAt: number
  updatedAt: number
  /** 是否置顶：置顶的对话排在列表最前（旧存档缺此字段回落 false，无需迁移） */
  pinned?: boolean
}

// 底部状态栏 / 导航等处使用的「视图显示名」。新增视图时只需在此补一项，
// 避免像此前「密码保险库」那样漏改状态栏导致显示成「工作台」。
// （workspace 视图的显示名是动态的——当前分类名或「工作台」，故不在此列出。）
export const VIEW_LABEL: Record<
  | "calendar"
  | "contacts"
  | "vault"
  | "ai-chat"
  | "profile"
  | "settings"
  | "notifications",
  string
> = {
  calendar: "日历",
  contacts: "联系人",
  vault: "密码保险库",
  "ai-chat": "AI 助手",
  profile: "个人主页",
  settings: "设置",
  notifications: "通知",
}

// 通知系统日志（TODO 27）：记录每轮扫描检查了哪些仓库、发现哪些新内容，以及是否发送了通知提示。
export interface NotificationLogEntry {
  id: string
  at: number
  /** scan = 一轮扫描摘要；item = 单个新发现的 commit/issue/pr/release */
  kind: "scan" | "item"
  message: string
  /** 该条内容是否发送了通知提示（按渠道勾选与仅监听规则判定） */
  notified: boolean
}

// 可持久化的系统设置
export type ThemePreference = "light" | "dark" | "system"
/** 默认启动视图；"last" = 打开上次的视图（view/activeCategoryId 本身已持久化，rehydrate 后即为上次状态） */
export type DefaultView = "workspace" | "calendar" | "ai-chat" | "last"
/** 界面字体家族：映射根元素 fontFamily 的 CSS 变量（--font-sans / --font-serif / --font-mono） */
export type UIFontFamily = "system" | "serif" | "mono"

// AI 模型条目：支持配置多个模型，每条独立保存 provider / key / baseUrl / model。
// 各 Key 仅存于本机 localStorage（纯前端静态站，无后端），互不干扰。
export interface AIModelEntry {
  id: string
  label: string // 展示名，如「GPT-4o」「我的 DeepSeek」
  provider: AIProviderId
  apiKey: string
  baseUrl: string // 仅 custom 供应商使用
  model: string // 覆盖模型名（留空则用供应商默认模型，如 智谱 glm-4-plus / DeepSeek deepseek-chat）
}

export interface Settings {
  theme: ThemePreference
  defaultView: DefaultView
  shortcuts: Record<ShortcutAction, ShortcutBinding>
  fontSize: number // 全局基础字号 rem，例如 16（对应 --font-size-base）
  // 界面字体家族：映射根元素 fontFamily（system → var(--font-sans) 等，见 components/theme-provider.tsx）
  uiFontFamily: UIFontFamily
  githubToken: string // GitHub 个人访问令牌（PAT），用于提升 GitHub 预览卡的 API 限额；留空则匿名（60 次/小时/IP）
  // AI 助手：支持配置多个模型，可随时切换当前使用的模型。
  aiModels: AIModelEntry[]
  aiActiveModelId: string | null // 当前选中的模型 id；为空表示尚未配置任何模型
  // 全局技能启停：null = 全部启用；否则为「启用」的技能名列表（用户技能名 + 内置技能名）。
  aiEnabledSkills: string[] | null
  aiUserAvatar: string // 用户头像（data URL，压缩后存储）；留空则用默认用户图标
  aiAssistantAvatar: string // AI 头像（data URL，压缩后存储）；留空则用默认机器人图标
  // 用户自定义「所在地区」标签（Profile 头像下方展示）；留空则默认显示「中国」
  location: string
  // 用户昵称（Profile 头像下方展示）；留空则默认显示「未命名用户」
  userName: string
  // AI 对话强制同步：开启后所有对话的用户请求统一进入单队列串行处理；
  // 关闭则允许并发（同一会话仍不会重复发起）。两种模式下切换会话/视图都不会中断在途请求。
  aiForceSync: boolean
  // AI 人设：可创建多条，全局选择其中一条作为「当前人设」注入每段对话的 system 提示词。
  // aiPersonas 为空 或 aiActivePersonaId 为 null/不存在 → 仅用基础提示词（不使用人设）。
  aiPersonas: AIPersona[]
  aiActivePersonaId: string | null
  /** 每天几点「翻篇」（HH:mm，用户本地时区）。默认 "04:00"：04:00 之前仍算前一天。
   *  影响贡献热力图按日分桶（见 lib/contributions.ts）；后续签到类功能亦复用同一 offset。 */
  dayStartOffset: string
  // 通知（TODO 20 / TODO 18）：Git 本地名称，与 commit 的 committer/author 名比对，
  // 命中则按 CONTRIBUTION_AMOUNT 计入贡献热力图。与 profile 的 userName 互相独立。
  gitUserName: string
  // 通知 sender 要扫描的仓库列表，每个仓库带自己的扫描类型开关（TODO 18 反馈：按仓库单独配置）。
  notificationRepos: NotificationRepoConfig[]
  // 通知发送渠道（TODO 22）：勾选哪些渠道，扫描到新通知时就以哪些方式投递。
  // builtin = 右下角弹窗；qq = 本机 QQ 中转服务（默认 localhost:18899，地址可配置）。
  notificationChannels: { builtin: boolean; qq: boolean }
  // QQ 互联通知的中转服务地址（POST {"text":"..."}）；留空 / 非法回落 DEFAULT_QQ_RELAY_URL
  qqRelayUrl: string
  // 保险库侧边栏密码生成器偏好（TODO 25）：位数与启用的字符集，持久化记住
  pwdGenerator: {
    length: number
    upper: boolean
    lower: boolean
    digits: boolean
    symbols: boolean
  }
}

// ---- 通知扫描配置（TODO 18 / 20）----

/** 单仓库的扫描类型开关 */
export interface NotificationScanTypes {
  commits: boolean
  issues: boolean
  prs: boolean
  releases: boolean
}

/** 通知扫描的仓库配置：owner/name + 该仓库独立的扫描类型 */
export interface NotificationRepoConfig {
  repo: string // "owner/name"
  scanTypes: NotificationScanTypes
  /**
   * 仅监听 commit：该仓库的 commit 仍会被扫描并按 committer 匹配计贡献（热力图），
   * 但**不产生通知、不弹弹窗**。issue/PR/release 不受影响，照常通知。
   */
  commitMonitorOnly: boolean
}

/** 新增仓库的默认扫描类型：commit 默认关，其余默认开（主人指定） */
export const DEFAULT_NOTIFICATION_SCAN_TYPES: NotificationScanTypes = {
  commits: false,
  issues: true,
  prs: true,
  releases: true,
}

/**
 * 规范化仓库配置列表：兼容旧存档的 string[]（每个仓库套默认扫描类型），
 * 对象条目逐键兜底（commits 缺省视为关，其余缺省视为开，与默认值语义一致）。
 * persist merge 与备份导入（importData）两处组装 settings 时都要过一遍。
 */
export function normalizeNotificationRepos(value: unknown): NotificationRepoConfig[] {
  if (!Array.isArray(value)) return []
  const out: NotificationRepoConfig[] = []
  for (const raw of value) {
    if (typeof raw === "string") {
      out.push({ repo: raw, scanTypes: { ...DEFAULT_NOTIFICATION_SCAN_TYPES }, commitMonitorOnly: false })
      continue
    }
    if (raw && typeof raw === "object") {
      const r = raw as Partial<NotificationRepoConfig>
      if (typeof r.repo !== "string" || !r.repo) continue
      const s = (r.scanTypes ?? {}) as Partial<NotificationScanTypes>
      out.push({
        repo: r.repo,
        scanTypes: {
          commits: s.commits === true,
          issues: s.issues !== false,
          prs: s.prs !== false,
          releases: s.releases !== false,
        },
        commitMonitorOnly: r.commitMonitorOnly === true,
      })
    }
  }
  return out
}

export function normalizeNotificationChannels(value: unknown): { builtin: boolean; qq: boolean } {
  const v = (value ?? {}) as { builtin?: unknown; qq?: unknown }
  return { builtin: v.builtin !== false, qq: v.qq === true }
}

/** QQ 中转服务默认地址（可在设置页修改；留空 / 非法时回落此值） */
export const DEFAULT_QQ_RELAY_URL = "http://localhost:18899/send"

/** 规范化 QQ 中转地址：空 / 非 http(s) 字符串回落默认值 */
export function normalizeQqRelayUrl(value: unknown): string {
  if (typeof value === "string") {
    const v = value.trim()
    if (/^https?:\/\/\S+/i.test(v)) return v
  }
  return DEFAULT_QQ_RELAY_URL
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  defaultView: "ai-chat",
  shortcuts: Object.fromEntries(SHORTCUT_META.map((m) => [m.action, { ...m.defaults }])) as Record<
    ShortcutAction,
    ShortcutBinding
  >,
  fontSize: 16,
  uiFontFamily: "system",
  githubToken: "",
  aiModels: [],
  aiActiveModelId: null,
  aiEnabledSkills: null,
  aiUserAvatar: "",
  aiAssistantAvatar: "",
  location: "",
  userName: "",
  aiForceSync: false,
  aiPersonas: [],
  aiActivePersonaId: null,
  // 与 lib/contributions.ts 的 DEFAULT_DAY_START_OFFSET 保持一致（此处写字面量避免循环依赖）
  dayStartOffset: "04:00",
  gitUserName: "",
  notificationRepos: [],
  notificationChannels: { builtin: true, qq: false },
  qqRelayUrl: DEFAULT_QQ_RELAY_URL,
  pwdGenerator: { length: 16, upper: true, lower: true, digits: true, symbols: true },
}

