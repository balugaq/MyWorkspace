"use client"

import { useMemo, useState } from "react"
import { Plus, Trash2, ChevronLeft, ChevronRight, Tag, X, FileText } from "lucide-react"
import { toast } from "sonner"
import { useWorkspace } from "@/lib/store"
import type { Category, Chapter } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

export function NovelWorkspace({ category }: { category: Category }) {
  const activeItemId = useWorkspace((s) => s.activeItemId)
  const chapters = category.chapters ?? []
  const active = chapters.find((c) => c.id === activeItemId) ?? null

  if (active) {
    return <ChapterEditor category={category} chapter={active} chapters={chapters} />
  }
  return <ChapterOverview category={category} chapters={chapters} />
}

function ChapterOverview({ category, chapters }: { category: Category; chapters: Chapter[] }) {
  const addChapter = useWorkspace((s) => s.addChapter)
  const setActiveItem = useWorkspace((s) => s.setActiveItem)
  const isNovel = category.template === "novel"

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
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

      {chapters.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
          <FileText className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">还没有内容，点击右上角添加。</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {chapters.map((ch) => (
            <li key={ch.id}>
              <button
                type="button"
                onClick={() => setActiveItem(ch.id)}
                className="flex w-full flex-col gap-2 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{ch.title || "未命名"}</span>
                  {ch.tags.length > 0 && (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {ch.tags[0]}
                    </Badge>
                  )}
                </div>
                <p className="line-clamp-2 min-h-8 whitespace-pre-wrap text-xs text-muted-foreground">
                  {ch.content || "（空白）"}
                </p>
              </button>
            </li>
          ))}
        </ul>
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

  const [tagInput, setTagInput] = useState("")

  const { prev, next } = useMemo(() => {
    const idx = chapters.findIndex((c) => c.id === chapter.id)
    return { prev: chapters[idx - 1] ?? null, next: chapters[idx + 1] ?? null }
  }, [chapters, chapter.id])

  const isNovel = category.template === "novel"

  function addTag() {
    const t = tagInput.trim()
    if (!t) return
    if (!chapter.tags.includes(t)) {
      updateChapter(category.id, chapter.id, { tags: [...chapter.tags, t] })
    }
    setTagInput("")
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-6 py-6">
      <div className="mb-3 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setActiveItem(null)} className="gap-1 text-muted-foreground">
          <ChevronLeft className="size-4" />
          {category.name}
        </Button>
        <div className="flex-1" />
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

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Tag className="size-3.5 text-muted-foreground" />
        {chapter.tags.map((t) => (
          <Badge key={t} variant="secondary" className="gap-1 pr-1">
            {t}
            <button
              type="button"
              onClick={() =>
                updateChapter(category.id, chapter.id, { tags: chapter.tags.filter((x) => x !== t) })
              }
              className="rounded-full hover:text-destructive"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault()
              addTag()
            }
          }}
          placeholder="添加标签"
          className="w-20 bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/60"
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
