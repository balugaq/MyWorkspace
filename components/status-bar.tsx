"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useWorkspace } from "@/lib/store"
import { VIEW_LABEL } from "@/lib/types"
import { loadAddressBook } from "@/lib/address-book"
import { parse, format } from "date-fns"

/**
 * 底部状态栏：根据当前视图对聚合数据做轻量摘要。
 * - workspace（分类页）：关系类（思维导图）显示「X 节点 X 已完成」；其余模板显示「X 项」（即章节数）
 * - contacts（联系人页）：X 人（联系人列表大小）
 * - vault（密码保险库页）：不显示内容
 * - ai-chat（AI 对话页）：X 轮 | 输入 X tok · 输出 X tok |（token 以 3 位有效数字缩写）
 * - calendar：本月待办 X / 已完成 Y / 事件 Z
 * 纯展示组件，只订阅 store，不修改任何数据。
 */
export function StatusBar() {
  const view = useWorkspace((s) => s.view)
  const categories = useWorkspace((s) => s.categories)
  const activeCategoryId = useWorkspace((s) => s.activeCategoryId)
  const calendar = useWorkspace((s) => s.calendar)
  const selectedDate = useWorkspace((s) => s.selectedDate)
  const conversations = useWorkspace((s) => s.conversations)
  const activeConversationId = useWorkspace((s) => s.activeConversationId)

  const activeCategory = categories.find((c) => c.id === activeCategoryId)
  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) ?? null

  // 联系人数量（异步加载，loadAddressBook 自带模块级缓存）。
  const [contactCount, setContactCount] = useState<number | null>(null)
  useEffect(() => {
    if (view !== "contacts") {
      setContactCount(null)
      return
    }
    let active = true
    loadAddressBook()
      .then((p) => {
        if (active) setContactCount(p.length)
      })
      .catch(() => {
        if (active) setContactCount(0)
      })
    return () => {
      active = false
    }
  }, [view])

  const left = useMemo<ReactNode[]>(() => {
    switch (view) {
      case "calendar":
        return calendarStats(calendar, selectedDate).map((s) => (
          <Stat key={s.key} value={s.value} label={s.label} />
        ))
      case "workspace": {
        if (activeCategory?.relation) {
          const nodes = activeCategory.relation.nodes
          const done = nodes.filter((n) => n.done).length
          return [
            <Stat key="nodes" value={nodes.length} label="节点" />,
            <Stat key="done" value={done} label="已完成" />,
          ]
        }
        const total = (activeCategory?.chapters ?? []).length
        return [<Stat key="items" value={total} label="项" />]
      }
      case "contacts":
        return [<Stat key="people" value={contactCount ?? 0} label="人" />]
      case "vault":
        return []
      case "ai-chat": {
        if (!activeConversation) return []
        const rounds = activeConversation.messages.filter(
          (m) => m.role === "user",
        ).length
        let input = 0
        let output = 0
        for (const m of activeConversation.messages) {
          if (m.tokens) {
            input += m.tokens.input
            output += m.tokens.output
          }
        }
        return [
          <span key="rounds">
            <span className="font-medium text-foreground">{rounds}</span> 轮
          </span>,
          <span key="sep1" className="text-border">
            |
          </span>,
          <span key="tokens">
            输入 {formatTokens(input)} tok · 输出 {formatTokens(output)} tok
          </span>,
          <span key="sep2" className="text-border">
            |
          </span>,
        ]
      }
      default:
        return []
    }
  }, [view, calendar, selectedDate, activeCategory, contactCount, activeConversation])

  return (
    <footer className="flex h-8 shrink-0 items-center gap-4 border-t bg-background/80 px-4 text-[11px] text-muted-foreground backdrop-blur">
      {left}
      <span className="ml-auto hidden truncate sm:inline">
        {view === "workspace" ? (activeCategory?.name ?? "工作台") : VIEW_LABEL[view]}
      </span>
    </footer>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="font-medium text-foreground">{value}</span>
      {label}
    </span>
  )
}

/** token 数字缩写：保留 3 位有效数字，加 T/B/M/K 后缀（如 1.34T、98.5B、9.99M、173K、392）。 */
function formatTokens(n: number): string {
  if (!n || n < 1000) return String(Math.round(n))
  const units: Array<[number, string]> = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ]
  for (const [div, suffix] of units) {
    if (n >= div) {
      const v = n / div
      return `${parseFloat(v.toPrecision(3))}${suffix}`
    }
  }
  return String(Math.round(n))
}

interface StatItem {
  key: string
  value: number
  label: string
}

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
