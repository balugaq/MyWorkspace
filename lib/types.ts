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
export const VIEW_LABEL: Record<"calendar" | "contacts" | "vault" | "ai-chat", string> = {
  calendar: "日历",
  contacts: "联系人",
  vault: "密码保险库",
  "ai-chat": "AI 助手",
}

// 可持久化的系统设置
export type ThemePreference = "light" | "dark" | "system"
export type DefaultView = "workspace" | "calendar"

/** 一条日历标记脚本（已弃用 / 注释停用：日历标记脚本整体停用，类型保留注释以备恢复） */
// export interface CalendarScript {
//   id: string
//   name: string
//   enabled: boolean
//   code: string
// }

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
  githubToken: string // GitHub 个人访问令牌（PAT），用于提升 GitHub 预览卡的 API 限额；留空则匿名（60 次/小时/IP）
  // AI 助手：支持配置多个模型，可随时切换当前使用的模型。
  aiModels: AIModelEntry[]
  aiActiveModelId: string | null // 当前选中的模型 id；为空表示尚未配置任何模型
  // 全局技能启停：null = 全部启用；否则为「启用」的技能名列表（用户技能名 + 内置技能名）。
  aiEnabledSkills: string[] | null
  aiUserAvatar: string // 用户头像（data URL，压缩后存储）；留空则用默认用户图标
  aiAssistantAvatar: string // AI 头像（data URL，压缩后存储）；留空则用默认机器人图标
  // AI 对话强制同步：开启后所有对话的用户请求统一进入单队列串行处理；
  // 关闭则允许并发（同一会话仍不会重复发起）。两种模式下切换会话/视图都不会中断在途请求。
  aiForceSync: boolean
  // AI 人设：可创建多条，全局选择其中一条作为「当前人设」注入每段对话的 system 提示词。
  // aiPersonas 为空 或 aiActivePersonaId 为 null/不存在 → 仅用基础提示词（不使用人设）。
  aiPersonas: AIPersona[]
  aiActivePersonaId: string | null
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  defaultView: "workspace",
  shortcuts: Object.fromEntries(SHORTCUT_META.map((m) => [m.action, { ...m.defaults }])) as Record<
    ShortcutAction,
    ShortcutBinding
  >,
  fontSize: 16,
  githubToken: "",
  aiModels: [],
  aiActiveModelId: null,
  aiEnabledSkills: null,
  aiUserAvatar: "",
  aiAssistantAvatar: "",
  aiForceSync: false,
  aiPersonas: [],
  aiActivePersonaId: null,
}

