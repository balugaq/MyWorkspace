"use client"

import { useMemo, useState } from "react"
import { Search, BookOpen, Workflow, StickyNote, Lightbulb, CheckSquare } from "lucide-react"
import { useWorkspace } from "@/lib/store"
import { runSearch } from "@/lib/search"
import type { SearchResult, SearchScope } from "@/lib/types"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const SCOPES: { value: SearchScope; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "category", label: "当前分类" },
  { value: "calendar", label: "日历笔记" },
  { value: "todo", label: "Todo" },
  { value: "mindmap", label: "思维导图" },
]

const TYPE_ICON = {
  chapter: BookOpen,
  node: Workflow,
  note: StickyNote,
  solution: Lightbulb,
  "calendar-todo": CheckSquare,
} as const

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-primary/20 px-0.5 text-primary">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const categories = useWorkspace((s) => s.categories)
  const calendar = useWorkspace((s) => s.calendar)
  const activeCategoryId = useWorkspace((s) => s.activeCategoryId)
  const setActiveCategory = useWorkspace((s) => s.setActiveCategory)
  const setActiveItem = useWorkspace((s) => s.setActiveItem)
  const goCalendar = useWorkspace((s) => s.goCalendar)
  const setSelectedDate = useWorkspace((s) => s.setSelectedDate)

  const [query, setQuery] = useState("")
  const [scope, setScope] = useState<SearchScope>("all")

  const results = useMemo(
    () => runSearch(categories, calendar, query, scope, activeCategoryId),
    [categories, calendar, query, scope, activeCategoryId],
  )

  function jump(r: SearchResult) {
    if (r.categoryId) {
      setActiveCategory(r.categoryId)
      if (r.type === "chapter") setActiveItem(r.targetId)
      else if (r.type === "node" || r.type === "solution") setActiveItem(r.targetId)
    } else if (r.date) {
      goCalendar()
      setSelectedDate(r.date)
    }
    onOpenChange(false)
    setQuery("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="sr-only">
          <DialogTitle>全局搜索</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索分类、篇目、Todo、解决方案、日历笔记…"
            autoFocus
            className="h-12 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="flex flex-wrap gap-1.5 border-b px-4 py-2.5">
          {SCOPES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setScope(s.value)}
              className={cn(
                "rounded-full px-3 py-1 text-xs transition-colors",
                scope === s.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {query.trim() === "" ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">输入关键词开始搜索</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              没有找到与「{query}」匹配的结果
            </p>
          ) : (
            <>
              <p className="px-3 py-2 text-xs text-muted-foreground">
                找到 {results.length} 个结果
              </p>
              <ul className="flex flex-col gap-1">
                {results.map((r) => {
                  const Icon = TYPE_ICON[r.type]
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => jump(r)}
                        className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
                      >
                        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
                          <Icon className="size-3.5" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              <Highlight text={r.title} query={query} />
                            </span>
                            <Badge variant="secondary" className="shrink-0 text-[10px]">
                              {r.typeLabel}
                            </Badge>
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            <Highlight text={r.snippet} query={query} />
                          </span>
                          <span className="text-[11px] text-muted-foreground/70">来自：{r.source}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
