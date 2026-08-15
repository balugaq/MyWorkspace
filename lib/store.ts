"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
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
} from "./types"

const uid = () => Math.random().toString(36).slice(2, 10)

const emptyDay = (): CalendarDay => ({ note: "", todos: [], events: [] })

// ---- 种子数据 ----
function seedCategories(): Category[] {
  const poems: Array<[string, string, string]> = [
    ["静夜思", "床前明月光\n疑是地上霜\n举头望明月\n低头思故乡", "唐诗"],
    ["春晓", "春眠不觉晓\n处处闻啼鸟\n夜来风雨声\n花落知多少", "唐诗"],
    ["登鹳雀楼", "白日依山尽\n黄河入海流\n欲穷千里目\n更上一层楼", "唐诗"],
    ["相思", "红豆生南国\n春来发几枝\n愿君多采撷\n此物最相思", "唐诗"],
  ]
  const chapters: Chapter[] = poems.map(([title, content, tag], i) => ({
    id: uid(),
    index: i + 1,
    title,
    content,
    tags: [tag],
  }))

  const nStart: MindNode = {
    id: uid(),
    title: "项目启动",
    content: "确定整体目标与范围",
    cause: "客户需求",
    leadTo: "需求分析、技术选型、团队组建",
    result: "进入开发阶段",
    sub: [],
    solution: null,
    position: { x: 340, y: 40 },
  }
  const nReq: MindNode = {
    id: uid(),
    title: "需求分析",
    content: "梳理功能清单与优先级",
    cause: "项目启动",
    leadTo: "开发阶段",
    result: "输出需求文档",
    sub: [],
    solution: null,
    position: { x: 60, y: 240 },
  }
  const nTech: MindNode = {
    id: uid(),
    title: "技术选型",
    content: "确定前后端技术栈",
    cause: "项目启动",
    leadTo: "开发阶段",
    result: "确定架构方案",
    sub: [],
    solution: { content: "对比 React Flow 与 vis-network 后选定 React Flow", status: "done" },
    position: { x: 340, y: 240 },
  }
  const nTeam: MindNode = {
    id: uid(),
    title: "团队组建",
    content: "招募与分工",
    cause: "项目启动",
    leadTo: "开发阶段",
    result: "团队就位",
    sub: [],
    solution: { content: "前端外包一部分工作", status: "paused" },
    position: { x: 620, y: 240 },
  }
  const nDev: MindNode = {
    id: uid(),
    title: "开发阶段",
    content: "按里程碑推进",
    cause: "需求分析 / 技术选型 / 团队组建",
    leadTo: "上线交付",
    result: "完成核心功能",
    sub: [],
    solution: { content: "每天写两页代码，稳步推进", status: "doing" },
    position: { x: 340, y: 440 },
  }

  const edges: MindEdge[] = [
    { id: uid(), source: nStart.id, target: nReq.id, kind: "flow" },
    { id: uid(), source: nStart.id, target: nTech.id, kind: "flow" },
    { id: uid(), source: nStart.id, target: nTeam.id, kind: "flow" },
    { id: uid(), source: nReq.id, target: nDev.id, kind: "flow" },
    { id: uid(), source: nTech.id, target: nDev.id, kind: "flow" },
    { id: uid(), source: nTeam.id, target: nDev.id, kind: "flow" },
  ]

  return [
    {
      id: "cat-poems",
      name: "糖诗三百首收录",
      template: "novel",
      icon: "BookOpen",
      config: { namingRule: "第%首", autoNumber: true, itemLabel: "首" },
      chapters,
    },
    {
      id: "cat-project",
      name: "项目思维图",
      template: "relation",
      icon: "Workflow",
      config: {},
      relation: {
        nodes: [nStart, nReq, nTech, nTeam, nDev],
        edges,
        view: "mindmap",
      },
    },
  ]
}

interface WorkspaceState {
  categories: Category[]
  calendar: CalendarData
  activeCategoryId: string | null // null 表示日历
  activeItemId: string | null // 章节 id 或节点 id
  view: "workspace" | "calendar"
  selectedDate: string
  hydrated: boolean

  // 分类
  addCategory: (name: string, template: TemplateType, config: CategoryConfig, count?: number) => string
  removeCategory: (id: string) => void
  renameCategory: (id: string, name: string) => void
  setActiveCategory: (id: string) => void
  setActiveItem: (id: string | null) => void
  goCalendar: () => void

  // 小说 / 通用条目
  addChapter: (catId: string) => void
  updateChapter: (catId: string, chapterId: string, patch: Partial<Chapter>) => void
  removeChapter: (catId: string, chapterId: string) => void

  // 思维导图
  addNode: (catId: string, position?: { x: number; y: number }) => string
  updateNode: (catId: string, nodeId: string, patch: Partial<MindNode>) => void
  removeNode: (catId: string, nodeId: string) => void
  setNodeSolution: (catId: string, nodeId: string, content: string, status: SolutionStatus) => void
  connectNodes: (catId: string, source: string, target: string, kind: "flow" | "sub") => void
  removeEdge: (catId: string, edgeId: string) => void
  setRelationView: (catId: string, view: "mindmap" | "list") => void

  // 日历
  setSelectedDate: (date: string) => void
  setDayNote: (date: string, note: string) => void
  addCalendarTodo: (date: string, content: string) => void
  toggleCalendarTodo: (date: string, todoId: string) => void
  removeCalendarTodo: (date: string, todoId: string) => void
  addCalendarEvent: (date: string, time: string, content: string) => void
  removeCalendarEvent: (date: string, eventId: string) => void
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      categories: seedCategories(),
      calendar: {},
      activeCategoryId: "cat-poems",
      activeItemId: null,
      view: "workspace",
      selectedDate: format(new Date(), "yyyy-MM-dd"),
      hydrated: false,

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
          const categories = s.categories.filter((c) => c.id !== id)
          const activeCategoryId =
            s.activeCategoryId === id ? (categories[0]?.id ?? null) : s.activeCategoryId
          return { categories, activeCategoryId, activeItemId: null }
        }),

      renameCategory: (id, name) =>
        set((s) => ({
          categories: s.categories.map((c) => (c.id === id ? { ...c, name } : c)),
        })),

      setActiveCategory: (id) => set({ activeCategoryId: id, activeItemId: null, view: "workspace" }),
      setActiveItem: (id) => set({ activeItemId: id, view: "workspace" }),
      goCalendar: () => set({ view: "calendar", activeCategoryId: null }),

      addChapter: (catId) =>
        set((s) => ({
          categories: s.categories.map((c) => {
            if (c.id !== catId || !c.chapters) return c
            const index = c.chapters.length + 1
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
                  chapters: c.chapters.map((ch) => (ch.id === chapterId ? { ...ch, ...patch } : ch)),
                }
              : c,
          ),
        })),

      removeChapter: (catId, chapterId) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === catId && c.chapters
              ? { ...c, chapters: c.chapters.filter((ch) => ch.id !== chapterId) }
              : c,
          ),
          activeItemId: s.activeItemId === chapterId ? null : s.activeItemId,
        })),

      addNode: (catId, position) => {
        const id = uid()
        set((s) => ({
          categories: s.categories.map((c) => {
            if (c.id !== catId || !c.relation) return c
            const node: MindNode = {
              id,
              title: "新节点",
              content: "",
              cause: "",
              leadTo: "",
              result: "",
              sub: [],
              solution: null,
              position: position ?? { x: 200 + Math.random() * 200, y: 120 + Math.random() * 160 },
            }
            return { ...c, relation: { ...c.relation, nodes: [...c.relation.nodes, node] } }
          }),
          activeItemId: id,
        }))
        return id
      },

      updateNode: (catId, nodeId, patch) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === catId && c.relation
              ? {
                  ...c,
                  relation: {
                    ...c.relation,
                    nodes: c.relation.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
                  },
                }
              : c,
          ),
        })),

      removeNode: (catId, nodeId) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === catId && c.relation
              ? {
                  ...c,
                  relation: {
                    ...c.relation,
                    nodes: c.relation.nodes.filter((n) => n.id !== nodeId),
                    edges: c.relation.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
                  },
                }
              : c,
          ),
          activeItemId: s.activeItemId === nodeId ? null : s.activeItemId,
        })),

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
                        ? { ...n, solution: content.trim() ? { content, status } : null }
                        : n,
                    ),
                  },
                }
              : c,
          ),
        })),

      connectNodes: (catId, source, target, kind) =>
        set((s) => ({
          categories: s.categories.map((c) => {
            if (c.id !== catId || !c.relation) return c
            const exists = c.relation.edges.some((e) => e.source === source && e.target === target)
            if (exists || source === target) return c
            const edge: MindEdge = { id: uid(), source, target, kind }
            let nodes = c.relation.nodes
            if (kind === "sub") {
              nodes = nodes.map((n) =>
                n.id === source && !n.sub.includes(target) ? { ...n, sub: [...n.sub, target] } : n,
              )
            }
            return { ...c, relation: { ...c.relation, edges: [...c.relation.edges, edge], nodes } }
          }),
        })),

      removeEdge: (catId, edgeId) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === catId && c.relation
              ? {
                  ...c,
                  relation: { ...c.relation, edges: c.relation.edges.filter((e) => e.id !== edgeId) },
                }
              : c,
          ),
        })),

      setRelationView: (catId, view) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === catId && c.relation ? { ...c, relation: { ...c.relation, view } } : c,
          ),
        })),

      setSelectedDate: (date) => set({ selectedDate: date }),

      setDayNote: (date, note) =>
        set((s) => ({
          calendar: { ...s.calendar, [date]: { ...(s.calendar[date] ?? emptyDay()), note } },
        })),

      addCalendarTodo: (date, content) =>
        set((s) => {
          const day = s.calendar[date] ?? emptyDay()
          return {
            calendar: {
              ...s.calendar,
              [date]: { ...day, todos: [...day.todos, { id: uid(), content, done: false }] },
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
                todos: day.todos.map((t) => (t.id === todoId ? { ...t, done: !t.done } : t)),
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
              [date]: { ...day, todos: day.todos.filter((t) => t.id !== todoId) },
            },
          }
        }),

      addCalendarEvent: (date, time, content) =>
        set((s) => {
          const day = s.calendar[date] ?? emptyDay()
          return {
            calendar: {
              ...s.calendar,
              [date]: { ...day, events: [...day.events, { id: uid(), time, content }] },
            },
          }
        }),

      removeCalendarEvent: (date, eventId) =>
        set((s) => {
          const day = s.calendar[date] ?? emptyDay()
          return {
            calendar: {
              ...s.calendar,
              [date]: { ...day, events: day.events.filter((e) => e.id !== eventId) },
            },
          }
        }),
    }),
    {
      name: "my-omni-workspace",
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true
      },
    },
  ),
)

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

// 依据命名规则生成标题，如 "第%首" + 序号 => "第一首"
export function buildTitle(config: CategoryConfig, index: number): string {
  const rule = config.namingRule || "第%"
  const num = config.autoNumber !== false ? toChineseNumber(index) : String(index)
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
  let str = String(n)
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
