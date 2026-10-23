"use client"

import { useMemo, type ReactNode } from "react"
import { useWorkspace } from "@/lib/store"
import { VIEW_LABEL } from "@/lib/types"
import { useTranslation } from "react-i18next"

/**
 * 底部状态栏：按当前视图做轻量摘要（workspace 节点/项数、contacts 人数、
 * ai-chat 轮数与 token 总量；calendar/vault 不展示）。纯展示组件，只读 store。
 */
export function StatusBar() {
  const { t } = useTranslation()
  const view = useWorkspace((s) => s.view)
  const categories = useWorkspace((s) => s.categories)
  const relationFamilies = useWorkspace((s) => s.relationFamilies)
  const activeCategoryId = useWorkspace((s) => s.activeCategoryId)
  const conversations = useWorkspace((s) => s.conversations)
  const activeConversationId = useWorkspace((s) => s.activeConversationId)
  const contactCount = useWorkspace((s) => (s.view === "contacts" ? s.contacts.length : null))

  const activeCategory = categories.find((c) => c.id === activeCategoryId)
  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) ?? null

  const famNodes = useMemo(
    () =>
      view === "workspace" && activeCategory?.template === "relation"
        ? Object.values(relationFamilies)
            .filter((f) => f.categoryId === activeCategory.id)
            .flatMap((f) => f.nodes)
        : null,
    [view, activeCategory, relationFamilies],
  )

  const left = useMemo<ReactNode[]>(() => {
    switch (view) {
      case "calendar":
        // TODO 2 停用：日历统计（保留 mindmap dueDate 体系，可恢复）
        return []
      case "workspace": {
        if (famNodes) {
          const done = famNodes.filter((n) => n.done).length
          return [
            <Stat key="nodes" value={famNodes.length} label={t("statusBar.nodes")} />,
            <Stat key="done" value={done} label={t("statusBar.done")} />,
          ]
        }
        const total = (activeCategory?.chapters ?? []).length
        return [<Stat key="items" value={total} label={t("statusBar.items")} />]
      }
      case "contacts":
        return [<Stat key="people" value={contactCount ?? 0} label={t("statusBar.people")} />]
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
            <span className="font-medium text-foreground">{rounds}</span> {t("statusBar.rounds")}
          </span>,
          <span key="sep1" className="text-border">
            |
          </span>,
          <span key="tokens">
            {t("statusBar.tokensIn", { n: formatTokens(input) })} · {t("statusBar.tokensOut", { n: formatTokens(output) })}
          </span>,
          <span key="sep2" className="text-border">
            |
          </span>,
        ]
      }
      default:
        return []
    }
  }, [view, activeCategory, famNodes, contactCount, activeConversation, t])

  return (
    <footer className="flex h-8 shrink-0 items-center gap-4 border-t bg-background/80 px-4 text-[11px] text-muted-foreground backdrop-blur">
      {left}
      <span className="ml-auto hidden truncate sm:inline">
        {view === "workspace" ? (activeCategory?.name ?? t("statusBar.workspace")) : VIEW_LABEL[view]}
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

/** token 缩写：3 位有效数字 + T/B/M/K 后缀（如 1.34T、98.5B、173K） */
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

/* TODO 2 停用：日历待办/事件统计（保留 mindmap dueDate 体系，可恢复）
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
*/
