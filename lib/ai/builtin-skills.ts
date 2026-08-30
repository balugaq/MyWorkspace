// 内置（builtin）技能：一组**只读**的数据查询能力，供 AI 助手通过 Tool Calling 调用。
//
// 与 public/skills/*.md（用户编写的「说明书」型技能，execute 仅回传正文）不同，
// 本文件的技能是**代码驱动**的：execute 直接读取运行时状态与数据文件，返回结构化 JSON。
// 所有技能均为只读操作，不修改任何状态 / 不写回磁盘。
//
// 工具名统一以 `wb_` 前缀，避免与用户 markdown 技能（文件名 slug）冲突。
// 每个技能都带 zod 参数 schema，由 use-ai-chat.ts 注册为 AI SDK tool。

"use client"

import { z } from "zod"
import { format, isSameDay, isSameMonth } from "date-fns"

import { useWorkspace } from "@/lib/store"
import { loadAddressBook, type Person } from "@/lib/address-book"
import { loadPublicYaml } from "@/lib/fetch-data"
import {
  builtinChinaFestivals,
  festivalsForDate,
  type Festival,
  type FestivalsFile,
} from "@/lib/festivals"
import { birthdaysOn } from "@/lib/birthday"
import { dayShortHint } from "@/lib/day-hint"
import { collectDueNodes } from "@/lib/deadlines"
import type { Category, Chapter, MindNode } from "@/lib/types"

/** 一个内置技能的定义。execute 接收已校验的参数对象，返回可 JSON 序列化的结果。 */
export interface BuiltinSkill {
  /** tool 名（唯一，wb_ 前缀） */
  name: string
  /** 给 AI 选择用的描述 */
  description: string
  /** 参数 zod schema */
  parameters: z.ZodTypeAny
  /** 实际执行：纯只读查询 */
  execute: (args: Record<string, unknown>) => Promise<unknown>
}

// ----------------------------- 通用辅助 -----------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 解析 yyyy-MM-dd；非法抛错。 */
function parseYmd(s: string): { year: number; month: number; day: number; date: Date } {
  if (!DATE_RE.test(s)) throw new Error(`日期格式应为 yyyy-MM-dd，收到：${s}`)
  const [y, m, d] = s.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    throw new Error(`非法日期：${s}`)
  }
  return { year: y, month: m, day: d, date }
}

/** 按 id 或 name 在分类列表中查找分类；找不到返回 null。 */
function findCategory(
  categories: Category[],
  args: Record<string, unknown>,
): Category | null {
  const id = typeof args.categoryId === "string" ? args.categoryId : ""
  const name = typeof args.categoryName === "string" ? args.categoryName : ""
  if (id) {
    const byId = categories.find((c) => c.id === id)
    if (byId) return byId
  }
  if (name) {
    const byName = categories.find((c) => c.name === name)
    if (byName) return byName
    // 容错：子串匹配
    const bySub = categories.find((c) => c.name.includes(name))
    if (bySub) return bySub
  }
  return null
}

/** 加载用户自定义节日定义（custom_festivals.yml）。失败返回空数组。 */
async function loadFestivalDefs(): Promise<FestivalsFile["festivals"]> {
  const file = await loadPublicYaml<FestivalsFile>("custom_festivals.yml")
  return file?.festivals ?? []
}

function festivalToPlain(f: Festival) {
  return { name: f.name, color: f.color, holiday: f.holiday, workday: f.workday, kind: f.kind }
}

function personToPlain(p: Person) {
  return {
    name: p.name,
    description: p.description ?? "",
    birthday: p.birthday,
    address: p.address,
    roles: p.roles ?? [],
    contact: p.contact ?? [],
  }
}

function nodeToPlain(n: MindNode) {
  return {
    id: n.id,
    title: n.title,
    content: n.content,
    cause: n.cause,
    leadTo: n.leadTo,
    result: n.result,
    sub: n.sub,
    tags: n.tags ?? [],
    dueDate: n.dueDate ?? null,
    longTerm: !!n.longTerm,
    done: !!n.done,
    hidden: !!n.hidden,
    solution: n.solution
      ? { content: n.solution.content, status: n.solution.status }
      : null,
  }
}

// ----------------------------- 技能定义 -----------------------------

export const BUILTIN_SKILLS: BuiltinSkill[] = [
  // 1. 获取某一天笔记内容
  {
    name: "wb_get_day_note",
    description:
      "获取指定日期（yyyy-MM-dd）的日历笔记正文。返回该日的 note 文本；若该日无笔记则返回空字符串。",
    parameters: z.object({ date: z.string().describe("日期，格式 yyyy-MM-dd") }),
    execute: async (args) => {
      const { date } = parseYmd(String(args.date))
      const key = format(date, "yyyy-MM-dd")
      const calendar = useWorkspace.getState().calendar
      return { date: key, note: calendar[key]?.note ?? "" }
    },
  },

  // 2. 获取所有有笔记内容的日期
  {
    name: "wb_get_dates_with_notes",
    description:
      "获取所有存在笔记内容的日期列表。返回 [{ date, note }]，按日期升序；无笔记则空数组。",
    parameters: z.object({}),
    execute: async () => {
      const calendar = useWorkspace.getState().calendar
      const list = Object.entries(calendar)
        .filter(([, d]) => d.note.trim() !== "")
        .map(([date, d]) => ({ date, note: d.note }))
        .sort((a, b) => a.date.localeCompare(b.date))
      return { count: list.length, dates: list }
    },
  },

  // 3. 获取某一天所有日期数据（镜像 calendar-workspace 的日格计算）
  {
    name: "wb_get_day_calendar_data",
    description:
      "获取指定日期（yyyy-MM-dd）的完整日历数据，包含：笔记、思维导图截止任务(dueNodes)、是否周末、是否有笔记、合并后的节日(内置中国要素+用户自定义)、当天生日、是否法定假日/调休/生日、农历短提示(shortHint)。selected/outside 以「今天」为参照（无月视图上下文）。",
    parameters: z.object({ date: z.string().describe("日期，格式 yyyy-MM-dd") }),
    execute: async (args) => {
      const { year, month, day, date: dayDate } = parseYmd(String(args.date))
      const key = format(dayDate, "yyyy-MM-dd")
      const calendar = useWorkspace.getState().calendar
      const data = calendar[key]
      const dueMap = collectDueNodes(useWorkspace.getState().categories)
      const dueNodes = dueMap[key] ?? []

      const today = new Date()
      const selected = isSameDay(dayDate, today)
      const outside = !isSameMonth(dayDate, today)
      const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6
      const hasNote = !!data && data.note.trim() !== ""

      const builtin = builtinChinaFestivals(year, month, day)
      const defs = await loadFestivalDefs()
      const userFests = festivalsForDate(defs, year, month, day)
      const festivals = [...builtin, ...userFests]
      const people = await loadAddressBook()
      const bdays = birthdaysOn(people, year, month, day)
      const hasHoliday = festivals.some((f) => f.holiday)
      const hasWorkday = festivals.some((f) => f.workday)
      const hasBirthday = bdays.length > 0
      const shortHint = dayShortHint(dayDate)

      return {
        key,
        note: data?.note ?? "",
        todos: data?.todos ?? [],
        events: data?.events ?? [],
        dueNodes,
        selected,
        outside,
        isWeekend,
        hasNote,
        festivals: festivals.map(festivalToPlain),
        birthdays: bdays.map((p) => p.name),
        hasHoliday,
        hasWorkday,
        hasBirthday,
        shortHint,
      }
    },
  },

  // 4. 获取所有联系人姓名
  {
    name: "wb_get_contact_names",
    description: "获取通讯录中所有联系人的姓名列表（只读 public/address_book.yml）。",
    parameters: z.object({}),
    execute: async () => {
      const people = await loadAddressBook()
      return { count: people.length, names: people.map((p) => p.name) }
    },
  },

  // 5. 获取指定的联系人姓名和描述
  {
    name: "wb_get_contact",
    description:
      "按姓名（精确或包含匹配）获取某位联系人的姓名与描述，并附带生日/地址/角色/联系方式。找不到返回 null。",
    parameters: z.object({ name: z.string().describe("联系人姓名（可模糊）") }),
    execute: async (args) => {
      const people = await loadAddressBook()
      const q = String(args.name).trim()
      if (!q) return null
      const exact = people.find((p) => p.name === q)
      const hit = exact ?? people.find((p) => p.name.includes(q))
      return hit ? personToPlain(hit) : null
    },
  },

  // 6. 获取所有分类名称及类别
  {
    name: "wb_get_categories",
    description:
      "获取所有分类的名称与类别（template）。返回 [{ id, name, template }]，template 取值如 novel/study/work/life/relation/custom。",
    parameters: z.object({}),
    execute: async () => {
      const categories = useWorkspace.getState().categories
      return {
        count: categories.length,
        categories: categories.map((c) => ({
          id: c.id,
          name: c.name,
          template: c.template,
        })),
      }
    },
  },

  // 7. 获取某一分类下所有子分类（章节）名称（仅 NovelWorkspace 类）
  {
    name: "wb_get_chapters",
    description:
      "获取指定分类（novel/study/work/life/custom）下的所有子分类（章节）名称。按 categoryId 或 categoryName 定位分类；返回章节 [{ id, index, title, done }]。",
    parameters: z.object({
      categoryId: z.string().optional().describe("分类 id"),
      categoryName: z.string().optional().describe("分类名称（可模糊）"),
    }),
    execute: async (args) => {
      const categories = useWorkspace.getState().categories
      const cat = findCategory(categories, args)
      if (!cat) return { found: false, reason: "未找到匹配的分类" }
      const chapters: Chapter[] = cat.chapters ?? []
      return {
        found: true,
        categoryId: cat.id,
        categoryName: cat.name,
        template: cat.template,
        count: chapters.length,
        chapters: chapters.map((ch) => ({
          id: ch.id,
          index: ch.index,
          title: ch.title,
          done: !!ch.done,
        })),
      }
    },
  },

  // 8. 获取某一子分类中所有内容（仅 NovelWorkspace 类）
  {
    name: "wb_get_chapter_content",
    description:
      "获取指定分类下某个子分类（章节）的全部内容：标题、正文、标签、完成状态。按 categoryId/categoryName 定位分类，按 chapterId/chapterTitle 定位章节。",
    parameters: z.object({
      categoryId: z.string().optional().describe("分类 id"),
      categoryName: z.string().optional().describe("分类名称（可模糊）"),
      chapterId: z.string().optional().describe("章节 id"),
      chapterTitle: z.string().optional().describe("章节标题（可模糊）"),
    }),
    execute: async (args) => {
      const categories = useWorkspace.getState().categories
      const cat = findCategory(categories, args)
      if (!cat) return { found: false, reason: "未找到匹配的分类" }
      const chapters: Chapter[] = cat.chapters ?? []
      const chId = typeof args.chapterId === "string" ? args.chapterId : ""
      const chTitle = typeof args.chapterTitle === "string" ? args.chapterTitle : ""
      let chapter: Chapter | undefined
      if (chId) chapter = chapters.find((c) => c.id === chId)
      if (!chapter && chTitle) {
        chapter =
          chapters.find((c) => c.title === chTitle) ??
          chapters.find((c) => c.title.includes(chTitle))
      }
      if (!chapter)
        return {
          found: false,
          reason: "未找到匹配的章节",
          categoryId: cat.id,
          categoryName: cat.name,
        }
      return {
        found: true,
        categoryId: cat.id,
        categoryName: cat.name,
        chapter: {
          id: chapter.id,
          index: chapter.index,
          title: chapter.title,
          content: chapter.content,
          tags: chapter.tags ?? [],
          done: !!chapter.done,
        },
      }
    },
  },

  // 9. 获取思维导图下所有节点的连接关系及名称（仅 mindmap / relation 类）
  {
    name: "wb_get_mindmap_graph",
    description:
      "获取指定关系类（relation）分类下思维导图的所有节点（名称/标题）与连线关系。返回 nodes([{id,title}]) 与 edges([{id,source,target,kind}])；kind 取值 flow/sub/solution。",
    parameters: z.object({
      categoryId: z.string().optional().describe("分类 id"),
      categoryName: z.string().optional().describe("分类名称（可模糊）"),
    }),
    execute: async (args) => {
      const categories = useWorkspace.getState().categories
      const cat = findCategory(categories, args)
      if (!cat) return { found: false, reason: "未找到匹配的分类" }
      if (cat.template !== "relation" || !cat.relation)
        return { found: false, reason: "该分类不是思维导图(relation)类型" }
      const { nodes, edges } = cat.relation
      return {
        found: true,
        categoryId: cat.id,
        categoryName: cat.name,
        nodes: nodes.map((n) => ({ id: n.id, title: n.title })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          kind: e.kind,
        })),
      }
    },
  },

  // 10. 获取思维导图下指定节点的所有内容（仅 mindmap / relation 类）
  {
    name: "wb_get_mindmap_node",
    description:
      "获取指定关系类(relation)分类下某个思维导图节点的全部内容：正文、原因、导向、结果、标签、截止日期、解决方案(内容+状态)、已完成状态、隐藏状态。按 categoryId/categoryName 定位分类，按 nodeId/nodeTitle 定位节点。",
    parameters: z.object({
      categoryId: z.string().optional().describe("分类 id"),
      categoryName: z.string().optional().describe("分类名称（可模糊）"),
      nodeId: z.string().optional().describe("节点 id"),
      nodeTitle: z.string().optional().describe("节点标题（可模糊）"),
    }),
    execute: async (args) => {
      const categories = useWorkspace.getState().categories
      const cat = findCategory(categories, args)
      if (!cat) return { found: false, reason: "未找到匹配的分类" }
      if (cat.template !== "relation" || !cat.relation)
        return { found: false, reason: "该分类不是思维导图(relation)类型" }
      const nodes = cat.relation.nodes
      const nId = typeof args.nodeId === "string" ? args.nodeId : ""
      const nTitle = typeof args.nodeTitle === "string" ? args.nodeTitle : ""
      let node: MindNode | undefined
      if (nId) node = nodes.find((n) => n.id === nId)
      if (!node && nTitle) {
        node =
          nodes.find((n) => n.title === nTitle) ??
          nodes.find((n) => (n.title ?? "").includes(nTitle))
      }
      if (!node)
        return {
          found: false,
          reason: "未找到匹配的节点",
          categoryId: cat.id,
          categoryName: cat.name,
        }
      return {
        found: true,
        categoryId: cat.id,
        categoryName: cat.name,
        node: nodeToPlain(node),
      }
    },
  },
]

/** 给 UI 展示用的内置技能清单（名称 + 描述）。 */
export const BUILTIN_SKILL_DISPLAY = BUILTIN_SKILLS.map((s) => ({
  name: s.name,
  description: s.description,
}))
