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
  Settings,
  DefaultView,
  ShortcutAction,
  ShortcutBinding,
  ConnectResult,
  Conversation,
  AIChatMessage,
  // CalendarScript, // 日历标记脚本已弃用停用：不再引入该类型
} from "./types"
import { DEFAULT_SETTINGS } from "./types"

const uid = () => Math.random().toString(36).slice(2, 10)

const emptyDay = (): CalendarDay => ({ note: "", todos: [], events: [] })

/** 按 id 合并两个数组：备份项覆盖同 id 项，新 id 追加 */
function mergeById<T extends { id: string }>(a: T[], b: T[]): T[] {
  const m = new Map<string, T>()
  for (const x of a) m.set(x.id, x)
  for (const x of b) m.set(x.id, x)
  return [...m.values()]
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
  view: "workspace" | "calendar" | "contacts" | "vault" | "ai-chat"
  selectedDate: string
  hydrated: boolean

  // 系统设置
  settings: Settings
  // 日历标记脚本（已弃用停用，字段与下方相关 action 一并注释；merge 中显式丢弃旧存档残留）
  // calendarScripts: CalendarScript[]
  // UI 弹窗状态（跨组件触发，例如全局快捷键 Ctrl+M）
  addCategoryOpen: boolean
  settingsOpen: boolean
  // scriptsOpen: boolean // 日历标记脚本管理弹窗（已弃用停用）
  configEditorOpen: boolean
  imagesOpen: boolean

  // 日历 / DayDetail 分隔条宽度（px），持久化以便刷新后保留用户拖动结果
  calendarDetailWidth: number

  // 全局标签库：容纳从联系人 roles 等外部来源导入的标签，供 TagPicker 复用
  knownTags: string[]

  // AI 助手：多会话（各自持有上下文，持久化到 localStorage）
  conversations: Conversation[]
  activeConversationId: string | null

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
  goContacts: () => void
  goVault: () => void
  goAIChat: () => void

  // AI 助手：多会话管理（各自持有上下文）
  createConversation: () => string
  selectConversation: (id: string) => void
  deleteConversation: (id: string) => void
  renameConversation: (id: string, title: string) => void
  setConversationMessages: (id: string, messages: AIChatMessage[]) => void
  clearActiveConversation: () => void

  // 系统设置 / UI
  updateSettings: (patch: Partial<Settings>) => void
  setShortcut: (action: ShortcutAction, binding: ShortcutBinding) => void
  setAddCategoryOpen: (v: boolean) => void
  setSettingsOpen: (v: boolean) => void
  // setScriptsOpen: (v: boolean) => void // 日历标记脚本（已弃用停用）
  setConfigEditorOpen: (v: boolean) => void
  setImagesOpen: (v: boolean) => void

  // 日历 / DayDetail 分隔条宽度（持久化）
  setCalendarDetailWidth: (w: number) => void

  // 全局标签库（导入联系人 roles 等）：并入去重后的标签，已存在则忽略
  addKnownTags: (tags: string[]) => void

  // 日历标记脚本（已弃用停用：以下三个 action 一并注释）
  // upsertCalendarScript: (script: CalendarScript) => void
  // removeCalendarScript: (id: string) => void
  // toggleCalendarScript: (id: string, enabled: boolean) => void

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
  updateNode: (catId: string, nodeId: string, patch: Partial<MindNode>) => void
  removeNode: (catId: string, nodeId: string) => void
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
      categories: [],
      calendar: {},
      activeCategoryId: null,
      activeItemId: null,
      view: "workspace",
      selectedDate: format(new Date(), "yyyy-MM-dd"),
      hydrated: false,
      settings: DEFAULT_SETTINGS,
      // calendarScripts: [], // 日历标记脚本（已弃用停用）
      addCategoryOpen: false,
      settingsOpen: false,
      // scriptsOpen: false, // 日历标记脚本（已弃用停用）
      configEditorOpen: false,
      imagesOpen: false,

      // 日历 / DayDetail 分隔条默认宽度（px），与原 w-96 一致
      calendarDetailWidth: 384,

      // 全局标签库默认空（角色由联系人数据加载时导入）
      knownTags: [],

      // AI 助手：默认无会话（视图挂载时若无会话则创建一个），不预置 activeConversationId
      conversations: [],
      activeConversationId: null,

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
      setSettingsOpen: (v) => set({ settingsOpen: v }),
      // setScriptsOpen: (v) => set({ scriptsOpen: v }), // 日历标记脚本（已弃用停用）
      setConfigEditorOpen: (v) => set({ configEditorOpen: v }),
      setImagesOpen: (v) => set({ imagesOpen: v }),

      setCalendarDetailWidth: (w) => set({ calendarDetailWidth: w }),

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

      // 日历标记脚本（已弃用停用：以下三个 action 实现一并注释）
      // upsertCalendarScript: (script) =>
      //   set((s) => {
      //     const exists = s.calendarScripts.some((x) => x.id === script.id)
      //     if (exists) {
      //       return {
      //         calendarScripts: s.calendarScripts.map((x) =>
      //           x.id === script.id ? script : x,
      //         ),
      //       }
      //     }
      //     return { calendarScripts: [...s.calendarScripts, script] }
      //   }),
      //
      // removeCalendarScript: (id) =>
      //   set((s) => ({
      //     calendarScripts: s.calendarScripts.filter((x) => x.id !== id),
      //   })),
      //
      // toggleCalendarScript: (id, enabled) =>
      //   set((s) => ({
      //     calendarScripts: s.calendarScripts.map((x) =>
      //       x.id === id ? { ...x, enabled } : x,
      //     ),
      //   })),

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
              // calendarScripts: s.calendarScripts, // 日历标记脚本（已弃用停用）
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
          set({
            categories: data.categories as Category[],
            calendar: data.calendar as CalendarData,
            settings: {
              ...DEFAULT_SETTINGS,
              ...(data.settings ?? {}),
            } as Settings,
            // 日历标记脚本（已弃用停用）：不再恢复 calendarScripts 字段
            // calendarScripts: Array.isArray(data.calendarScripts)
            //   ? (data.calendarScripts as CalendarScript[])
            //   : [],
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
          const categories = [...catMap.values()]
          // 日历：按日期合并
          const calendar: CalendarData = { ...cur.calendar }
          const bCal = data.calendar as CalendarData
          for (const date of Object.keys(bCal)) {
            const bDay = bCal[date]
            const cDay = calendar[date]
            calendar[date] = cDay ? mergeCalendarDay(cDay, bDay) : bDay
          }
          set({ categories, calendar })
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
          const categories = s.categories.filter((c) => c.id !== id)
          const activeCategoryId =
            s.activeCategoryId === id
              ? (categories[0]?.id ?? null)
              : s.activeCategoryId
          return { categories, activeCategoryId, activeItemId: null }
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
      goContacts: () => set({ view: "contacts", activeCategoryId: null }),
      goVault: () => set({ view: "vault", activeCategoryId: null }),
      goAIChat: () => set({ view: "ai-chat", activeCategoryId: null }),

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
      setConversationMessages: (id, messages) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, messages, updatedAt: Date.now() } : c,
          ),
        })),
      clearActiveConversation: () =>
        set((s) => {
          if (!s.activeConversationId) return {}
          return {
            conversations: s.conversations.map((c) =>
              c.id === s.activeConversationId
                ? { ...c, messages: [], updatedAt: Date.now() }
                : c,
            ),
          }
        }),

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
        set((s) => ({
          categories: s.categories.map((c) => {
            if (c.id !== catId || !c.relation) return c
            const node: MindNode = {
              id,
              title: title ?? "新节点",
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
            }
            return {
              ...c,
              relation: { ...c.relation, nodes: [...c.relation.nodes, node] },
            }
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
                    nodes: c.relation.nodes.map((n) =>
                      n.id === nodeId ? { ...n, ...patch } : n
                    ),
                  },
                }
              : c
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
      name: "my-omni-workspace",
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.hydrated = true
          // 应用用户设置的默认视图（仅当尚未处于某个明确视图时属于启动行为）
          applyDefaultView(state)
        }
      },
      merge: (persisted, current) => {
        const p = { ...(persisted ?? {}) } as Partial<WorkspaceState> &
          Record<string, unknown>
        // 日历标记脚本已弃用停用：显式丢弃旧存档残留字段（红线 1 兼容，不破坏旧存档读取，
        // 也不把僵尸字段写回 localStorage）。
        delete p.calendarScripts
        delete p.scriptsOpen
        // 若历史数据没有 settings，则并入当前默认设置
        return {
          ...current,
          ...p,
          conversations: (p.conversations as Conversation[] | undefined) ?? [],
          activeConversationId:
            (p.activeConversationId as string | null | undefined) ?? null,
          settings: {
            ...DEFAULT_SETTINGS,
            ...(p.settings as Partial<Settings> | undefined),
          },
        }
      },
    }
  )
)

function applyDefaultView(state: WorkspaceState) {
  const dv: DefaultView = state.settings?.defaultView ?? "workspace"
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
