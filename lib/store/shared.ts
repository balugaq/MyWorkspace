// store 切片共享的纯工具（无 zustand 依赖，可被 slices/ 与 store.ts 共同 import；
// 独立成模块而非留在 store.ts，是为了避免 slices → store.ts 的值 import 形成运行时循环）
import type { WorkspaceState } from "../store"
import type { CalendarDay, CategoryConfig, DefaultView, TemplateType } from "../types"

export const uid = () => Math.random().toString(36).slice(2, 10)

export const emptyDay = (): CalendarDay => ({ note: "", todos: [], events: [] })

/** 按 id 合并两个数组：备份项覆盖同 id 项，新 id 追加 */
export function mergeById<T extends { id: string }>(a: T[], b: T[]): T[] {
  const m = new Map<string, T>()
  for (const x of a) m.set(x.id, x)
  for (const x of b) m.set(x.id, x)
  return [...m.values()]
}

// 标签数组去重（保序）：renameTag 合并语义（TODO 67）用
export function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of tags) if (!seen.has(x)) {
    seen.add(x)
    out.push(x)
  }
  return out
}

/** 合并某天的日历数据：笔记取备份非空值，待办/事件按 id 合并 */
export function mergeCalendarDay(a: CalendarDay, b: CalendarDay): CalendarDay {
  return {
    note: b.note || a.note || "",
    todos: mergeById(a.todos ?? [], b.todos ?? []),
    events: mergeById(a.events ?? [], b.events ?? []),
  }
}

export function applyDefaultView(state: WorkspaceState) {
  const dv: DefaultView = state.settings?.defaultView ?? "ai-chat"
  // "last"：view/activeCategoryId 本身已持久化，rehydrate 出来的就是上次的视图，什么都不做即可
  if (dv === "last") return
  if (state.view !== dv) {
    state.view = dv
    // workspace 是分类工作区：保留持久化的当前分类；其余视图清空分类选中
    if (dv !== "workspace") state.activeCategoryId = null
  }
}

export function iconForTemplate(t: TemplateType): string {
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
