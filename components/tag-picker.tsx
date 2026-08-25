"use client"

import { useMemo, useState } from "react"
import { Plus, X, Search } from "lucide-react"
import { useWorkspace } from "@/lib/store"
import { collectAllTagsWithKnown } from "@/lib/tags"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

/**
 * 可复用的标签编辑器（章节与思维图节点共用同一套标签体系）。
 * - 展示当前标签（可删除）。
 * - "+" 打开标签库下拉：可像 GitHub 一样搜索已有标签并点击添加。
 * - 也可直接输入新标签并按 Enter 创建。
 */
export function TagPicker({
  tags,
  onChange,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const categories = useWorkspace((s) => s.categories)
  const knownTags = useWorkspace((s) => s.knownTags)
  const allTags = useMemo(
    () => collectAllTagsWithKnown(categories, knownTags),
    [categories, knownTags],
  )
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const add = (t: string) => {
    const q = t.trim()
    if (q && !tags.includes(q)) onChange([...tags, q])
  }
  const remove = (t: string) => onChange(tags.filter((x) => x !== t))

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = allTags.filter((t) => !tags.includes(t))
    return q ? pool.filter((t) => t.toLowerCase().includes(q)) : pool
  }, [allTags, query, tags])

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <Badge key={t} variant="secondary" className="gap-1 pr-1">
          {t}
          <button
            type="button"
            onClick={() => remove(t)}
            className="rounded-full hover:text-destructive"
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="flex size-5 items-center justify-center rounded-full border border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              title="添加标签"
            />
          }
        >
          <Plus className="size-3" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64">
          <div className="flex items-center gap-1.5 border-b pb-2">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.trim()) {
                  e.preventDefault()
                  add(query.trim())
                  setQuery("")
                }
              }}
              placeholder="搜索或新建标签…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
          </div>
          <ScrollArea className="h-48 shrink-0 overflow-hidden pt-1.5">
            {filtered.length === 0 ? (
              <p className="px-1 py-2 text-center text-xs text-muted-foreground">
                {query.trim() ? "无匹配，按回车新建" : "暂无其它标签，输入后回车创建"}
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {filtered.map((t) => (
                  <li key={t}>
                    <button
                      type="button"
                      onClick={() => add(t)}
                      className="w-full rounded px-2 py-1 text-left text-sm hover:bg-accent"
                    >
                      {t}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  )
}
