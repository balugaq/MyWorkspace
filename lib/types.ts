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
}

// 节点之间的连线
export interface MindEdge {
  id: string
  source: string
  target: string
  kind: "flow" | "sub" | "solution"
}

export interface RelationContent {
  nodes: MindNode[]
  edges: MindEdge[]
  view: "mindmap" | "list"
}

export interface CategoryConfig {
  namingRule?: string // 命名规则，如 "第%首"
  autoNumber?: boolean
  itemLabel?: string // 单条目的称呼，如 "章节" "笔记"
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

export const TEMPLATES: TemplateMeta[] = [
  { type: "novel", label: "小说类", icon: "BookOpen", description: "自动生成章节目录，适合诗集、小说、连载" },
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
