"use client"

import { useMemo } from "react"
import { useWorkspace } from "@/lib/store"
import { VIEW_LABEL, type RelationContent } from "@/lib/types"
import { parse, format } from "date-fns"

/**
 * 底部状态栏：根据当前视图对聚合数据做轻量摘要。
 * - workspace + 普通分类：共 N 项 / 已完成 X / 进行中 Y
 * - workspace + 关系类：节点 N / 已完成 Y
 * - calendar：本月待办 X / 已完成 Y / 事件 Z
 * 纯展示组件，只订阅 store，不修改任何数据。
 */
export function StatusBar() {
  const view = useWorkspace((s) => s.view)
  const categories = useWorkspace((s) => s.categories)
  const activeCategoryId = useWorkspace((s) => s.activeCategoryId)
  const calendar = useWorkspace((s) => s.calendar)
  const selectedDate = useWorkspace((s) => s.selectedDate)

  const activeCategory = categories.find((c) => c.id === activeCategoryId)

  const stats = useMemo(() => {
    if (view === "calendar") return calendarStats(calendar, selectedDate)
    if (activeCategory?.relation) return relationStats(activeCategory.relation)
    return categoryStats(activeCategory?.chapters ?? [])
  }, [view, calendar, selectedDate, activeCategory])

  const labels = useMemo(() => buildStats(stats), [stats])

  return (
    <footer className="flex h-8 shrink-0 items-center gap-4 border-t bg-background/80 px-4 text-[11px] text-muted-foreground backdrop-blur">
      {labels.map((l) => (
        <span key={l.key} className="flex items-center gap-1">
          <span className="font-medium text-foreground">{l.value}</span>
          {l.label}
        </span>
      ))}
      <span className="ml-auto hidden truncate sm:inline">
        {view === "workspace" ? (activeCategory?.name ?? "工作台") : VIEW_LABEL[view]}
      </span>
    </footer>
  )
}

interface StatItem {
  key: string
  value: number
  label: string
}

function buildStats(s: StatItem[]): StatItem[] {
  if (s.length === 0) return [{ key: "empty", value: 0, label: "项" }]
  return s
}

function categoryStats(chapters: Array<{ done?: boolean }>): StatItem[] {
  const total = chapters.length
  const done = chapters.filter((c) => c.done).length
  const pending = total - done
  return [
    { key: "total", value: total, label: "项" },
    { key: "done", value: done, label: "已完成" },
    { key: "pending", value: pending, label: "进行中" },
  ]
}

function relationStats(relation: RelationContent): StatItem[] {
  const total = relation.nodes.length
  const done = relation.nodes.filter((n) => n.done).length
  return [
    { key: "nodes", value: total, label: "节点" },
    { key: "done", value: done, label: "已完成" },
  ]
}

/** 统计所选日期所在月份的日历待办与事件 */
function calendarStats(
  calendar: Record<string, { todos?: Array<{ done: boolean }>; events?: unknown[] }>,
  selectedDate: string,
): StatItem[] {
  const month = parse(selectedDate, "yyyy-MM-dd", new Date())
  const prefix = format(month, "yyyy-MM")
  let todos = 0
  let done = 0
  let events = 0
  for (const [key, day] of Object.entries(calendar)) {
    if (!key.startsWith(prefix)) continue
    if (day.todos) {
      todos += day.todos.length
      done += day.todos.filter((t) => t.done).length
    }
    events += day.events?.length ?? 0
  }
  return [
    { key: "ctodos", value: todos, label: "本月待办" },
    { key: "cdone", value: done, label: "已完成" },
    { key: "cevents", value: events, label: "事件" },
  ]
}
