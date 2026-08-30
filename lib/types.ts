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
  hidden?: boolean // 是否在图里隐藏（隐藏后仅列表显示）
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

// AI 助手：单条对话消息（用户 / 助手）
export interface AIChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  /** 本次回复过程中 AI 调用过的技能（用于 UI 展示） */
  tools?: { name: string; display?: string; result?: string }[]
}

// AI 助手：一个独立对话（各自持有完整上下文，持久化到 localStorage）
export interface Conversation {
  id: string
  title: string
  messages: AIChatMessage[]
  createdAt: number
  updatedAt: number
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

export interface Settings {
  theme: ThemePreference
  defaultView: DefaultView
  shortcuts: Record<ShortcutAction, ShortcutBinding>
  fontSize: number // 全局基础字号 rem，例如 16（对应 --font-size-base）
  githubToken: string // GitHub 个人访问令牌（PAT），用于提升 GitHub 预览卡的 API 限额；留空则匿名（60 次/小时/IP）
  // AI 助手配置：用户选 provider + 填 apiKey；所有供应商均可在下方「模型名」框覆盖默认模型；custom 模式另需填 baseURL
  aiProvider: AIProviderId
  aiApiKey: string
  aiBaseUrl: string // 仅 custom 模式使用
  aiModel: string // 覆盖模型名（留空则用供应商默认模型，如 智谱 glm-4-plus / DeepSeek deepseek-chat）
  aiUserAvatar: string // 用户头像（data URL，压缩后存储）；留空则用默认用户图标
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
  aiProvider: "zcode",
  aiApiKey: "",
  aiBaseUrl: "",
  aiModel: "",
  aiUserAvatar: "",
}

