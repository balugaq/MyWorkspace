"use client"

import { useEffect, useMemo, useRef } from "react"
import { Plus, Trash2, ChevronLeft, ChevronRight, Tag, FileText } from "lucide-react"
import { toast } from "sonner"
import { useWorkspace } from "@/lib/store"
import type { Category, Chapter } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { TagPicker } from "@/components/tag-picker"
import { cn } from "@/lib/utils"

export function NovelWorkspace({ category }: { category: Category }) {
  const activeItemId = useWorkspace((s) => s.activeItemId)
  const chapters = category.chapters ?? []
  const active = chapters.find((c) => c.id === activeItemId) ?? null

  // 记住总览滚动位置，进出章节后恢复
  const overviewScrollRef = useRef(0)

  if (active) {
    return <ChapterEditor category={category} chapter={active} chapters={chapters} />
  }
  return (
    <ChapterOverview
      category={category}
      chapters={chapters}
      scrollRef={overviewScrollRef}
    />
  )
}

function ChapterOverview({
  category,
  chapters,
  scrollRef,
}: {
  category: Category
  chapters: Chapter[]
  scrollRef: { current: number }
}) {
  const addChapter = useWorkspace((s) => s.addChapter)
  const setActiveItem = useWorkspace((s) => s.setActiveItem)
  const isNovel = category.template === "novel"
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // 挂载后恢复上次滚动位置；并监听 viewport 滚动把 scrollTop 写回 ref（跨进出章节持久）
  useEffect(() => {
    const el = scrollAreaRef.current
    const raf = requestAnimationFrame(() => {
      const vp = el?.querySelector?.(
        '[data-slot="scroll-area-viewport"]',
      ) as (HTMLElement & { __dshScroll?: () => void }) | null
      if (!vp) return
      vp.scrollTop = scrollRef.current
      vp.__dshScroll = () => {
        scrollRef.current = vp.scrollTop
      }
      vp.addEventListener("scroll", vp.__dshScroll, { passive: true })
    })
    return () => {
      cancelAnimationFrame(raf)
      const vp = el?.querySelector?.(
        '[data-slot="scroll-area-viewport"]',
      ) as (HTMLElement & { __dshScroll?: () => void }) | null
      if (vp?.__dshScroll) {
        vp.removeEventListener("scroll", vp.__dshScroll)
        delete vp.__dshScroll
      }
    }
  }, [scrollRef])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mx-auto w-full max-w-4xl px-6 pt-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl font-semibold text-balance">{category.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              共 {chapters.length} {isNovel ? "篇" : "条"}内容
            </p>
          </div>
          <Button
            onClick={() => {
              addChapter(category.id)
              toast.success("已添加")
            }}
          >
            <Plus className="size-4" />
            添加{isNovel ? "篇目" : "笔记"}
          </Button>
        </div>
      </div>

      {chapters.length === 0 ? (
        <div className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center px-6">
          <div className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
            <FileText className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">还没有内容，点击右上角添加。</p>
          </div>
        </div>
      ) : (
        <ScrollArea ref={scrollAreaRef} className="min-h-0 flex-1 px-6 pb-8">
          <div className="mx-auto max-w-4xl">
            <ul className="grid gap-3 sm:grid-cols-2">
              {chapters.map((ch) => (
                <li key={ch.id}>
                  <button
                    type="button"
                    onClick={() => setActiveItem(ch.id)}
                    className="flex w-full flex-col gap-2 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("truncate font-medium", ch.done && "text-muted-foreground line-through")}>
                        {ch.title || "未命名"}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {ch.done && (
                          <Badge variant="secondary" className="text-[10px] text-emerald-600 dark:text-emerald-400">
                            ✓ 已完成
                          </Badge>
                        )}
                        {ch.tags.length > 0 && (
                          <Badge variant="secondary" className="text-[10px]">
                            {ch.tags[0]}
                          </Badge>
                        )}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "line-clamp-2 min-h-8 whitespace-pre-wrap text-xs text-muted-foreground",
                        ch.done && "opacity-60",
                      )}
                    >
                      {ch.content || "（空白）"}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

function ChapterEditor({
  category,
  chapter,
  chapters,
}: {
  category: Category
  chapter: Chapter
  chapters: Chapter[]
}) {
  const updateChapter = useWorkspace((s) => s.updateChapter)
  const removeChapter = useWorkspace((s) => s.removeChapter)
  const setActiveItem = useWorkspace((s) => s.setActiveItem)

  const { prev, next } = useMemo(() => {
    const idx = chapters.findIndex((c) => c.id === chapter.id)
    return { prev: chapters[idx - 1] ?? null, next: chapters[idx + 1] ?? null }
  }, [chapters, chapter.id])

  const isNovel = category.template === "novel"

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-6 py-6">
      <div className="mb-3 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setActiveItem(null)} className="gap-1 text-muted-foreground">
          <ChevronLeft className="size-4" />
          {category.name}
        </Button>
        <div className="flex-1" />
        <label className="flex cursor-pointer select-none items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted">
          <Checkbox
            checked={!!chapter.done}
            onCheckedChange={(v) => updateChapter(category.id, chapter.id, { done: !!v })}
            id={`done-${chapter.id}`}
          />
          完成
        </label>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-destructive"
          onClick={() => {
            removeChapter(category.id, chapter.id)
            toast.success("已删除")
          }}
        >
          <Trash2 className="size-4" />
          <span className="sr-only">删除</span>
        </Button>
      </div>

      <Input
        value={chapter.title}
        onChange={(e) => updateChapter(category.id, chapter.id, { title: e.target.value })}
        placeholder="标题"
        className="h-auto border-0 px-0 font-serif text-2xl font-semibold shadow-none focus-visible:ring-0 md:text-3xl"
      />

      <div className="mt-3 flex items-center gap-1.5">
        <Tag className="size-3.5 shrink-0 text-muted-foreground" />
        <TagPicker
          tags={chapter.tags}
          onChange={(next) => updateChapter(category.id, chapter.id, { tags: next })}
        />
      </div>

      <Separator className="my-4" />

      <ScrollArea className="flex-1">
        <textarea
          value={chapter.content}
          onChange={(e) => updateChapter(category.id, chapter.id, { content: e.target.value })}
          placeholder="在此书写内容…"
          className={cn(
            "min-h-[45vh] w-full resize-none bg-transparent leading-relaxed outline-none placeholder:text-muted-foreground/60",
            isNovel ? "font-serif text-lg" : "text-base",
          )}
        />
      </ScrollArea>

      <div className="mt-4 flex items-center justify-between border-t pt-4">
        <Button
          variant="outline"
          size="sm"
          disabled={!prev}
          onClick={() => prev && setActiveItem(prev.id)}
          className="gap-1"
        >
          <ChevronLeft className="size-4" />
          上一{isNovel ? "首" : "条"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!next}
          onClick={() => next && setActiveItem(next.id)}
          className="gap-1"
        >
          下一{isNovel ? "首" : "条"}
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
