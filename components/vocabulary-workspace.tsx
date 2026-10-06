"use client"

// 词汇表工作区（TODO 64）：工具栏「词汇表」视图。
// 数据存 IndexedDB（lib/vocab-store.ts），本组件挂载时 loadVocab 全量载入缓存并渲染。
// 功能：列表 + 拼音搜索 + 来源筛选 / 词条增删改 / 来源管理（独立小系统，id 引用）/ AI 批量导入（粘贴 JSON 预览后入库）。
// 问答系统与 AI 评分在 TODO 64 批 2 接入。

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Pencil, Plus, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { matchTextPinyin } from "@/lib/pinyin"
import {
  addVocabEntries,
  deleteVocabSource,
  ensureVocabSource,
  isVocabWordTaken,
  listQuizRecords,
  listVocabEntries,
  listVocabSources,
  loadVocab,
  parseVocabImport,
  removeVocabEntry,
  renameVocabSource,
  upsertVocabEntry,
} from "@/lib/vocab-store"
import {
  VOCAB_RATING_META,
  type VocabEntry,
  type VocabSource,
} from "@/lib/types"

/** 列表渲染上限（万级词库时避免一次性渲染卡顿；搜索过滤后仍按此截断并提示总数） */
const LIST_RENDER_LIMIT = 200

export function VocabularyWorkspace() {
  const [, setVersion] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [query, setQuery] = useState("")
  const [sourceFilter, setSourceFilter] = useState<string>("all")

  // 词条编辑弹窗
  const [editing, setEditing] = useState<VocabEntry | null>(null)
  const [creating, setCreating] = useState(false)
  const [draftWord, setDraftWord] = useState("")
  const [draftDefinition, setDraftDefinition] = useState("")
  const [draftSourceId, setDraftSourceId] = useState<string>("none")
  const [draftNewSource, setDraftNewSource] = useState("")

  // 来源管理弹窗
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [newSourceName, setNewSourceName] = useState("")
  const [renamingSourceId, setRenamingSourceId] = useState<string | null>(null)
  const [renameSourceDraft, setRenameSourceDraft] = useState("")
  const [confirmDelSource, setConfirmDelSource] = useState<VocabSource | null>(null)

  // 批量导入弹窗
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState("")
  const [importing, setImporting] = useState(false)

  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    let cancelled = false
    loadVocab()
      .then(() => {
        if (!cancelled) {
          setLoaded(true)
          refresh()
        }
      })
      .catch(() => toast.error("词汇表加载失败"))
    return () => {
      cancelled = true
    }
  }, [refresh])

  const entries = listVocabEntries()
  const sources = listVocabSources()
  const sourceById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources])
  const records = listQuizRecords()

  const filtered = useMemo(() => {
    const q = query.trim()
    return entries.filter((e) => {
      if (sourceFilter !== "all") {
        if (sourceFilter === "none" ? e.sourceId : e.sourceId !== sourceFilter) return false
      }
      if (!q) return true
      return matchTextPinyin(e.word, q) || matchTextPinyin(e.definition, q)
    })
  }, [entries, query, sourceFilter])

  // ---- 词条增删改 ----

  const openCreate = () => {
    setEditing(null)
    setCreating(true)
    setDraftWord("")
    setDraftDefinition("")
    setDraftSourceId(sourceFilter !== "all" && sourceFilter !== "none" ? sourceFilter : "none")
    setDraftNewSource("")
  }

  const openEdit = (e: VocabEntry) => {
    setEditing(e)
    setCreating(true)
    setDraftWord(e.word)
    setDraftDefinition(e.definition)
    setDraftSourceId(e.sourceId ?? "none")
    setDraftNewSource("")
  }

  const closeEditor = () => {
    setCreating(false)
    setEditing(null)
  }

  const commitEntry = async () => {
    const word = draftWord.trim()
    const definition = draftDefinition.trim()
    if (!word || !definition) {
      toast.error("词条与释义均不能为空")
      return
    }
    if (isVocabWordTaken(word, editing?.id)) {
      toast.error(`词条「${word}」已存在`)
      return
    }
    let sourceId: string | undefined
    if (draftNewSource.trim()) {
      sourceId = await ensureVocabSource(draftNewSource)
    } else if (draftSourceId !== "none") {
      sourceId = draftSourceId
    }
    await upsertVocabEntry({
      id: editing?.id ?? `ve_${Math.random().toString(36).slice(2, 10)}`,
      word,
      definition,
      ...(sourceId ? { sourceId } : {}),
      createdAt: editing?.createdAt ?? Date.now(),
      review: editing?.review ?? { total: 0, wrongCount: 0 },
    })
    toast.success(editing ? "已保存修改" : "已添加词条")
    closeEditor()
    refresh()
  }

  const [confirmDelEntry, setConfirmDelEntry] = useState<VocabEntry | null>(null)
  const doDeleteEntry = async () => {
    const e = confirmDelEntry
    setConfirmDelEntry(null)
    if (!e) return
    await removeVocabEntry(e.id)
    toast.success(`已删除词条「${e.word}」`)
    refresh()
  }

  // ---- 来源管理 ----

  const addSource = async () => {
    const name = newSourceName.trim()
    if (!name) return
    if (sources.some((s) => s.name === name)) {
      toast.error(`来源「${name}」已存在`)
      return
    }
    await ensureVocabSource(name)
    setNewSourceName("")
    toast.success(`已添加来源「${name}」`)
    refresh()
  }

  const commitSourceRename = async () => {
    const id = renamingSourceId
    setRenamingSourceId(null)
    setRenameSourceDraft("")
    if (!id) return
    const name = renameSourceDraft.trim()
    if (!name) return
    if (sources.some((s) => s.id !== id && s.name === name)) {
      toast.error(`来源「${name}」已存在`)
      return
    }
    await renameVocabSource(id, name)
    toast.success("已重命名来源")
    refresh()
  }

  const doDeleteSource = async () => {
    const s = confirmDelSource
    setConfirmDelSource(null)
    if (!s) return
    const affected = entries.filter((e) => e.sourceId === s.id).length
    await deleteVocabSource(s.id)
    toast.success(
      affected > 0 ? `已删除来源「${s.name}」，${affected} 个词条变为未分类` : `已删除来源「${s.name}」`,
    )
    refresh()
  }

  // ---- 批量导入 ----

  const parsedImport = useMemo(() => parseVocabImport(importText), [importText])

  const duplicatesInDb = useMemo(
    () => parsedImport.items.filter((it) => isVocabWordTaken(it.word)).length,
    [parsedImport],
  )

  const doImport = async () => {
    setImporting(true)
    try {
      const report = await addVocabEntries(parsedImport.items)
      toast.success(
        `导入完成：新增 ${report.added} 条，跳过重复 ${report.skippedDuplicate} 条` +
          (report.invalid > 0 ? `，无效 ${report.invalid} 条` : "") +
          (report.sourcesCreated.length > 0 ? `；新建来源：${report.sourcesCreated.join("、")}` : ""),
      )
      setImportOpen(false)
      setImportText("")
      refresh()
    } catch {
      toast.error("导入失败")
    } finally {
      setImporting(false)
    }
  }

  const sourceNameOf = (e: VocabEntry) => (e.sourceId ? sourceById.get(e.sourceId)?.name : undefined)

  return (
    <div className="flex h-full flex-col">
      {/* 顶栏：标题 + 统计 + 操作 */}
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <h1 className="font-serif text-lg font-semibold">词汇表</h1>
        <span className="text-xs text-muted-foreground">
          {entries.length} 词 · {sources.length} 来源 · 已练 {records.length} 轮
        </span>
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setSourcesOpen(true)}>
          来源管理
        </Button>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setImportOpen(true)}>
          <Upload className="size-3.5" />
          AI 批量导入
        </Button>
        <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={openCreate}>
          <Plus className="size-3.5" />
          添加词条
        </Button>
      </div>

      {/* 搜索 + 来源筛选 */}
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索词条 / 释义（支持拼音）"
          className="h-8 max-w-72"
        />
        <Select
          value={sourceFilter}
          onValueChange={(v) => {
            if (v) setSourceFilter(v)
          }}
        >
          <SelectTrigger className="h-8 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部来源</SelectItem>
            <SelectItem value="none">未分类</SelectItem>
            {sources.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          {filtered.length} 条{filtered.length > LIST_RENDER_LIMIT ? `（仅渲染前 ${LIST_RENDER_LIMIT} 条）` : ""}
        </span>
      </div>

      {/* 列表 */}
      <div className="native-scroll min-h-0 flex-1 overflow-auto px-4 py-2">
        {!loaded ? (
          <p className="py-10 text-center text-sm text-muted-foreground">加载中…</p>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {entries.length === 0
              ? "词库还是空的。点右上角「AI 批量导入」或「添加词条」开始。"
              : "没有匹配的词条。"}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {filtered.slice(0, LIST_RENDER_LIMIT).map((e) => {
              const rating = e.review.lastRating
              const ratingMeta = rating ? VOCAB_RATING_META[rating] : null
              return (
                <li
                  key={e.id}
                  className="group flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 font-medium text-foreground">{e.word}</span>
                      {e.sourceId && (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {sourceNameOf(e) ?? "未知来源"}
                        </span>
                      )}
                      {ratingMeta && (
                        <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px]", ratingMeta.className)}>
                          {ratingMeta.label}
                        </span>
                      )}
                      {e.review.total > 0 && (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          练过 {e.review.total} 次
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground" title={e.definition}>
                      {e.definition.split("\n")[0]}
                    </p>
                  </div>
                  <button
                    type="button"
                    title="编辑"
                    aria-label={`编辑词条 ${e.word}`}
                    onClick={() => openEdit(e)}
                    className="hidden size-6 shrink-0 items-center justify-center rounded hover:bg-primary/10 group-hover:flex"
                  >
                    <Pencil className="size-3.5 text-muted-foreground" />
                  </button>
                  <button
                    type="button"
                    title="删除"
                    aria-label={`删除词条 ${e.word}`}
                    onClick={() => setConfirmDelEntry(e)}
                    className="hidden size-6 shrink-0 items-center justify-center rounded hover:bg-destructive/10 group-hover:flex"
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* 词条编辑弹窗 */}
      <Dialog
        open={creating}
        onOpenChange={(v) => {
          if (!v) closeEditor()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑词条" : "添加词条"}</DialogTitle>
            <DialogDescription>
              {editing ? "词条与释义均可修改；改成已有词条会被拦截。" : "词条重复会被拦截（与现有库精确匹配）。"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="vocab-word">词条</Label>
              <Input
                id="vocab-word"
                value={draftWord}
                onChange={(e) => setDraftWord(e.target.value)}
                placeholder="如：abandon"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="vocab-def">释义</Label>
              <textarea
                id="vocab-def"
                value={draftDefinition}
                onChange={(e) => setDraftDefinition(e.target.value)}
                rows={4}
                className="native-scroll min-h-0 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="v. 放弃；抛弃"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>来源</Label>
              <div className="flex items-center gap-2">
                <Select
                  value={draftSourceId}
                  onValueChange={(v) => {
                    if (v) {
                      setDraftSourceId(v)
                      setDraftNewSource("")
                    }
                  }}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">未分类</SelectItem>
                    {sources.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* 快捷写入：输入新名则优先使用并自动创建（同名已存在则直接复用） */}
              <Input
                value={draftNewSource}
                onChange={(e) => setDraftNewSource(e.target.value)}
                placeholder="或输入新来源名，保存时自动创建（优先于上方选择）"
                className="h-7 text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEditor}>
              取消
            </Button>
            <Button onClick={commitEntry}>{editing ? "保存" : "添加"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除词条确认 */}
      <AlertDialog
        open={confirmDelEntry !== null}
        onOpenChange={(v) => !v && setConfirmDelEntry(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除词条「{confirmDelEntry?.word ?? ""}」？</AlertDialogTitle>
            <AlertDialogDescription>此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDelEntry(null)}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={doDeleteEntry}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 来源管理 */}
      <Dialog open={sourcesOpen} onOpenChange={setSourcesOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>来源管理</DialogTitle>
            <DialogDescription>
              来源是独立小系统：词条按 id 引用，重命名不影响词条；删除来源仅摘标记，词条保留。
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input
              value={newSourceName}
              onChange={(e) => setNewSourceName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void addSource()
                }
              }}
              placeholder="新来源名（如：书名 / 教材名）"
              className="h-8 flex-1"
            />
            <Button variant="outline" className="h-8 shrink-0 gap-1" onClick={() => void addSource()}>
              <Plus className="size-3.5" />
              添加
            </Button>
          </div>
          <ul className="native-scroll flex max-h-64 flex-col gap-1 overflow-auto">
            {sources.length === 0 && (
              <li className="py-4 text-center text-xs text-muted-foreground">还没有来源。</li>
            )}
            {sources.map((s) => {
              const count = entries.filter((e) => e.sourceId === s.id).length
              return (
                <li key={s.id} className="group flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-xs">
                  {renamingSourceId === s.id ? (
                    <input
                      autoFocus
                      value={renameSourceDraft}
                      onChange={(e) => setRenameSourceDraft(e.target.value)}
                      onBlur={() => void commitSourceRename()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          void commitSourceRename()
                        } else if (e.key === "Escape") {
                          e.preventDefault()
                          setRenamingSourceId(null)
                          setRenameSourceDraft("")
                        }
                      }}
                      className="h-6 min-w-0 flex-1 rounded border bg-background px-1.5 outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate text-foreground" title={s.name}>
                        {s.name}
                      </span>
                      <span className="shrink-0 text-muted-foreground">{count} 词</span>
                      <button
                        type="button"
                        title="重命名"
                        aria-label={`重命名来源 ${s.name}`}
                        onClick={() => {
                          setRenamingSourceId(s.id)
                          setRenameSourceDraft(s.name)
                        }}
                        className="hidden size-5 shrink-0 items-center justify-center rounded hover:bg-primary/10 group-hover:flex"
                      >
                        <Pencil className="size-3 text-muted-foreground" />
                      </button>
                      <button
                        type="button"
                        title="删除"
                        aria-label={`删除来源 ${s.name}`}
                        onClick={() => setConfirmDelSource(s)}
                        className="hidden size-5 shrink-0 items-center justify-center rounded hover:bg-destructive/10 group-hover:flex"
                      >
                        <Trash2 className="size-3 text-destructive" />
                      </button>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        </DialogContent>
      </Dialog>

      {/* 删除来源确认 */}
      <AlertDialog
        open={confirmDelSource !== null}
        onOpenChange={(v) => !v && setConfirmDelSource(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除来源「{confirmDelSource?.name ?? ""}」？</AlertDialogTitle>
            <AlertDialogDescription>
              {entries.filter((e) => e.sourceId === confirmDelSource?.id).length > 0
                ? `${entries.filter((e) => e.sourceId === confirmDelSource?.id).length} 个词条将变为「未分类」，词条本身保留。`
                : "该来源暂无词条引用。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDelSource(null)}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={doDeleteSource}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI 批量导入 */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>AI 批量导入</DialogTitle>
            <DialogDescription>
              在 AI 对话里让 AI 用 wb_prepare_vocab_import 技能把书单整理成 JSON，复制其输出粘贴到此处。
              格式：数组，每项含 word / definition / source（来源可选）。
              重复词条自动跳过（保留旧释义），source 不存在时自动创建。
            </DialogDescription>
          </DialogHeader>
          <code className="block overflow-x-auto rounded bg-muted px-2 py-1.5 font-mono text-[10px] break-all text-muted-foreground">
            {`[{"word":"abandon","definition":"v. 放弃；抛弃","source":"book1"}]`}
          </code>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={10}
            className="native-scroll min-h-0 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder='[{"word":"abandon","definition":"v. 放弃；抛弃","source":"book1"}]'
          />
          {importText.trim() && (
            <p className="text-xs text-muted-foreground">
              解析结果：有效 {parsedImport.items.length} 条
              {parsedImport.invalid > 0 ? `，无效 ${parsedImport.invalid} 条` : ""}
              {duplicatesInDb > 0 ? `，与现有词库重复 ${duplicatesInDb} 条（将跳过）` : ""}
              {parsedImport.items.length > 0 && `。预览：${parsedImport.items.slice(0, 3).map((it) => it.word).join("、")}${parsedImport.items.length > 3 ? " …" : ""}`}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => void doImport()}
              disabled={importing || parsedImport.items.length === 0}
            >
              {importing ? "导入中…" : `导入 ${parsedImport.items.length} 条`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
