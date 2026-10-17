"use client"

// 词汇表工作区（TODO 64）：工具栏「词汇表」视图。
// 数据存 IndexedDB（lib/vocab-store.ts），本组件挂载时 loadVocab 全量载入缓存并渲染。
// 功能：列表 + 拼音搜索 + 来源筛选 / 词条增删改 / 来源管理（独立小系统，id 引用）/ AI 批量导入（粘贴 JSON 预览后入库）。
// 问答系统与 AI 评分在 TODO 64 批 2 接入。

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react"
import { useTranslation } from "react-i18next"
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
import { useWorkspace } from "@/lib/store"
import { pickQuizEntries } from "@/lib/vocab-quiz"
import { gradeVocabAnswer } from "@/lib/ai/vocab-grader"
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
  saveQuizResult,
  upsertVocabEntry,
} from "@/lib/vocab-store"
import {
  VOCAB_RATING_META,
  type VocabEntry,
  type VocabQuizRecord,
  type VocabRating,
  type VocabSource,
} from "@/lib/types"

/** 列表渲染上限（万级词库时避免一次性渲染卡顿；搜索过滤后仍按此截断并提示总数） */
const LIST_RENDER_LIMIT = 200

// ---- 问答状态机（TODO 64 批 2）----

type QuizSuccess = { rating: VocabRating; comment: string }
type QuizGrade = QuizSuccess | { error: string }

function quizSuccessOf(g: QuizGrade | null): QuizSuccess | null {
  return g !== null && "rating" in g ? g : null
}

/** 确认框等窄场景的词名截断（2026-10-07 主人口径：最多 20 字符） */
function truncateWord(word: string, max = 20): string {
  return word.length > max ? `${word.slice(0, max)}…` : word
}

/** 问答记录列表/详情共用的时间格式（M/d HH:mm） */
function formatRecordTime(at: number): string {
  return new Date(at).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

interface QuizState {
  /** 本轮范围显示名（null = 全部来源，随 VocabQuizRecord.sourceName 口径） */
  scopeLabel: string | null
  queue: VocabEntry[]
  /** 当前题下标；>= queue.length 即已进入评分/报告阶段 */
  index: number
  /** 各题当前草稿（随写随存，切题不丢；提交时未填按空白评分） */
  answers: string[]
  /** 各题累计停留用时 ms（切题 / 提交时结算） */
  times: number[]
  /** 当前题最近一次停留起点 */
  questionStart: number
  grades: (QuizGrade | null)[]
  /** 全部评分成功后的自动保存记录 id；null = 尚未保存 */
  savedId: string | null
}

export function VocabularyWorkspace() {
  const { t } = useTranslation()
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

  // 问答（批 2）：null = 未开轮；配置弹窗参数；中途退出确认
  const [quiz, setQuiz] = useState<QuizState | null>(null)
  const [quizConfigOpen, setQuizConfigOpen] = useState(false)
  const [quizScope, setQuizScope] = useState("all")
  const [quizCount, setQuizCount] = useState("10")
  const [confirmExitQuiz, setConfirmExitQuiz] = useState(false)
  /** 提交作答确认：null = 关闭；数字 = 未作答题数 */
  const [confirmSubmitQuiz, setConfirmSubmitQuiz] = useState<number | null>(null)
  /** 正在回看的问答记录（点击右半屏卡片打开） */
  const [viewingRecord, setViewingRecord] = useState<VocabQuizRecord | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const quizSavingRef = useRef(false)
  // 作答期间自动收起底部工具栏（提交/退出后恢复；仅记录「是本轮收起的」，不动主人手动收起的状态）
  const setToolbarCollapsed = useWorkspace((s) => s.setToolbarCollapsed)
  const quizHidToolbarRef = useRef(false)
  const hideToolbarForQuiz = () => {
    setToolbarCollapsed(true)
    quizHidToolbarRef.current = true
  }
  const resumeToolbar = () => {
    if (quizHidToolbarRef.current) {
      setToolbarCollapsed(false)
      quizHidToolbarRef.current = false
    }
  }
  // 直接切走视图丢弃本轮时也要把工具栏还回来
  useEffect(
    () => () => {
      if (quizHidToolbarRef.current) setToolbarCollapsed(false)
    },
    [setToolbarCollapsed],
  )

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
      .catch(() => toast.error(t("vocab.loadFail")))
    return () => {
      cancelled = true
    }
  }, [refresh, t])

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

  /** 「已存在」提示旁的切换按钮：把已有词条内容载入表单转编辑态（2026-10-07 主人口径） */
  const loadExistingEntry = (e: VocabEntry) => {
    setEditing(e)
    setDraftWord(e.word)
    setDraftDefinition(e.definition)
    setDraftSourceId(e.sourceId ?? "none")
    setDraftNewSource("")
  }

  const commitEntry = async () => {
    const word = draftWord.trim()
    const definition = draftDefinition.trim()
    if (!word || !definition) {
      toast.error(t("vocab.errEmpty"))
      return
    }
    if (isVocabWordTaken(word, editing?.id)) {
      toast.error(t("vocab.errDuplicate", { word }))
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
    toast.success(editing ? t("common.saved") : t("vocab.entryAdded"))
    closeEditor()
    refresh()
  }

  const [confirmDelEntry, setConfirmDelEntry] = useState<VocabEntry | null>(null)
  const doDeleteEntry = async () => {
    const e = confirmDelEntry
    setConfirmDelEntry(null)
    if (!e) return
    await removeVocabEntry(e.id)
    toast.success(t("vocab.entryDeleted", { word: e.word }))
    refresh()
  }

  // ---- 来源管理 ----

  const addSource = async () => {
    const name = newSourceName.trim()
    if (!name) return
    if (sources.some((s) => s.name === name)) {
      toast.error(t("vocab.sourceExists", { name }))
      return
    }
    await ensureVocabSource(name)
    setNewSourceName("")
    toast.success(t("vocab.sourceAdded", { name }))
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
      toast.error(t("vocab.sourceExists", { name }))
      return
    }
    await renameVocabSource(id, name)
    toast.success(t("vocab.sourceRenamed"))
    refresh()
  }

  const doDeleteSource = async () => {
    const s = confirmDelSource
    setConfirmDelSource(null)
    if (!s) return
    const affected = entries.filter((e) => e.sourceId === s.id).length
    await deleteVocabSource(s.id)
    toast.success(
      affected > 0 ? t("vocab.sourceDeletedWith", { name: s.name, n: affected }) : t("vocab.sourceDeleted", { name: s.name }),
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
        t("vocab.importDone", {
          added: report.added,
          skipped: report.skippedDuplicate,
          invalidTail:
            report.invalid > 0
              ? t("vocab.importInvalidTail", { n: report.invalid })
              : "",
          sourcesTail:
            report.sourcesCreated.length > 0
              ? t("vocab.importSourcesTail", { sources: report.sourcesCreated.join("、") })
              : "",
        }),
      )
      setImportOpen(false)
      setImportText("")
      refresh()
    } catch {
      toast.error(t("vocab.importFail"))
    } finally {
      setImporting(false)
    }
  }

  const sourceNameOf = (e: VocabEntry) => (e.sourceId ? sourceById.get(e.sourceId)?.name : undefined)

  // 新建态输入的词已存在时，给「已存在」提示 + 一键载入（编辑态不提示，重名保存会被拦）
  const draftKey = draftWord.trim().toLowerCase()
  const existingEntry =
    creating && !editing && draftKey
      ? (entries.find((e) => e.word.trim().toLowerCase() === draftKey) ?? null)
      : null

  // ---- 问答（批 2）：配置 → 逐题作答 → AI 评分 → 报告/存档 ----

  const quizPool = useMemo(
    () =>
      entries.filter((e) =>
        quizScope === "all" ? true : quizScope === "none" ? !e.sourceId : e.sourceId === quizScope
      ),
    [entries, quizScope],
  )

  // 作答阶段每秒刷新一次计时显示
  useEffect(() => {
    if (!quiz || quiz.index >= quiz.queue.length) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [quiz])

  const quizErrCount = quiz ? quiz.grades.filter((g) => g !== null && !("rating" in g)).length : 0
  const quizOkCount = quiz ? quiz.grades.filter((g) => quizSuccessOf(g) !== null).length : 0
  const quizAllDone = quiz !== null && quiz.index >= quiz.queue.length
  /** 作答阶段：问答界面占满全屏（右半屏记录面板让位，工具栏收起） */
  const quizAnswering = quiz !== null && quiz.index < quiz.queue.length
  const quizAllSuccess = quizAllDone && quizErrCount === 0 && quizOkCount === quiz.queue.length
  const ratingCounts = useMemo(() => {
    const c: Record<VocabRating, number> = { wrong: 0, partial: 0, correct: 0, beyond: 0 }
    if (quiz) {
      for (const g of quiz.grades) {
        const s = quizSuccessOf(g)
        if (s) c[s.rating]++
      }
    }
    return c
  }, [quiz])

  const openQuizConfig = () => {
    setQuizScope(sourceFilter)
    setQuizCount("10")
    setQuizConfigOpen(true)
  }

  const startQuiz = () => {
    if (quizPool.length === 0) {
      toast.error(t("vocab.emptyPool"))
      return
    }
    // 一次问答最多 100 题（2026-10-07 主人口径）
    const count = Math.max(1, Math.min(100, Math.floor(Number(quizCount) || 10)))
    const picked = pickQuizEntries(quizPool, count)
    setQuizConfigOpen(false)
    setNow(Date.now())
    hideToolbarForQuiz()
    setQuiz({
      scopeLabel:
        quizScope === "all" ? null : quizScope === "none" ? t("vocab.uncategorized") : (sourceById.get(quizScope)?.name ?? null),
      queue: picked,
      index: 0,
      answers: picked.map(() => ""),
      times: picked.map(() => 0),
      questionStart: Date.now(),
      grades: picked.map(() => null),
      savedId: null,
    })
  }

  /** 结算当前题的停留用时（切题 / 提交时调用） */
  const settleCurrent = (q: QuizState): QuizState => {
    const t = Date.now()
    const times = [...q.times]
    times[q.index] = (times[q.index] ?? 0) + Math.max(0, t - q.questionStart)
    return { ...q, times, questionStart: t }
  }

  const goToQuestion = (i: number) => {
    if (!quiz || i < 0 || i >= quiz.queue.length || i === quiz.index) return
    setQuiz({ ...settleCurrent(quiz), index: i })
  }

  const requestSubmitQuiz = () => {
    if (!quiz) return
    const unanswered = quiz.answers.filter((a) => !a.trim()).length
    if (unanswered > 0) {
      setConfirmSubmitQuiz(unanswered)
      return
    }
    doSubmitQuiz()
  }

  /** 一次性提交全部作答（未填按空白），进入逐题评分；提交后恢复工具栏 */
  const doSubmitQuiz = () => {
    setConfirmSubmitQuiz(null)
    if (!quiz) return
    resumeToolbar()
    const settled = settleCurrent(quiz)
    const next: QuizState = {
      ...settled,
      answers: settled.answers.map((a) => a.trim()),
      index: settled.queue.length,
    }
    setQuiz(next)
    void runGrading(next)
  }

  /** 逐题串行评分（避免并发打爆 API），进度实时刷新到界面 */
  const runGrading = async (state: QuizState) => {
    for (let i = 0; i < state.queue.length; i++) {
      const entry = state.queue[i]
      try {
        const g = await gradeVocabAnswer({
          word: entry.word,
          definition: entry.definition,
          answer: state.answers[i],
        })
        setQuiz((q) => (q ? { ...q, grades: q.grades.map((old, j) => (j === i ? g : old)) } : q))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setQuiz((q) => (q ? { ...q, grades: q.grades.map((old, j) => (j === i ? { error: msg } : old)) } : q))
      }
    }
  }

  const retryGrade = async (i: number) => {
    if (!quiz) return
    setQuiz((q) => (q ? { ...q, grades: q.grades.map((old, j) => (j === i ? null : old)) } : q))
    try {
      const g = await gradeVocabAnswer({
        word: quiz.queue[i].word,
        definition: quiz.queue[i].definition,
        answer: quiz.answers[i],
      })
      setQuiz((q) => (q ? { ...q, grades: q.grades.map((old, j) => (j === i ? g : old)) } : q))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setQuiz((q) => (q ? { ...q, grades: q.grades.map((old, j) => (j === i ? { error: msg } : old)) } : q))
    }
  }

  // 全部评分成功后自动存档（整轮一条 VocabQuizRecord + 逐题 review 回写）
  useEffect(() => {
    if (!quiz || quiz.savedId || quiz.index < quiz.queue.length || quizSavingRef.current) return
    if (quiz.grades.some((g) => quizSuccessOf(g) === null)) return
    quizSavingRef.current = true
    saveQuizResult({
      at: Date.now(),
      sourceName: quiz.scopeLabel,
      items: quiz.queue.map((e, i) => {
        const g = quiz.grades[i] as QuizSuccess
        return {
          id: e.id,
          word: e.word,
          definition: e.definition,
          answer: quiz.answers[i],
          timeMs: quiz.times[i],
          rating: g.rating,
          comment: g.comment,
        }
      }),
    })
      .then((saved) => {
        setQuiz((q) => (q ? { ...q, savedId: saved.id } : q))
        toast.success(t("vocab.quizSaved"))
      })
      .catch(() => toast.error(t("vocab.quizSaveFail")))
      .finally(() => {
        quizSavingRef.current = false
      })
  }, [quiz, t])

  /** 报告页返回列表：未自动存档（有失败题）时保存已成功的题 */
  const finishPartial = () => {
    const q = quiz
    resumeToolbar()
    setQuiz(null)
    if (!q || q.savedId) return
    const idxs = q.grades.map((g, i) => (quizSuccessOf(g) !== null ? i : -1)).filter((i) => i >= 0)
    if (idxs.length === 0) return
    saveQuizResult({
      at: Date.now(),
      sourceName: q.scopeLabel,
      items: idxs.map((i) => {
        const g = q.grades[i] as QuizSuccess
        return {
          id: q.queue[i].id,
          word: q.queue[i].word,
          definition: q.queue[i].definition,
          answer: q.answers[i],
          timeMs: q.times[i],
          rating: g.rating,
          comment: g.comment,
        }
      }),
    })
      .then(() => toast.success(t("vocab.ratingsSaved", { n: idxs.length })))
      .catch(() => toast.error(t("vocab.quizSaveFail")))
  }

  const restartQuiz = () => {
    resumeToolbar()
    setQuiz(null)
    openQuizConfig()
  }

  const discardQuiz = () => {
    setConfirmExitQuiz(false)
    resumeToolbar()
    setQuiz(null)
  }

  return (
    <div className="flex h-full flex-col">
      {/* 顶栏：标题 + 统计 + 操作 */}
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <h1 className="font-serif text-lg font-semibold">{t("vocab.title")}</h1>
        <span className="text-xs text-muted-foreground">
          {t("vocab.stats", { words: entries.length, sources: sources.length, rounds: records.length })}
        </span>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          disabled={quiz !== null}
          onClick={openQuizConfig}
        >
          <Play className="size-3.5" />
          {t("vocab.startQuiz")}
        </Button>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setSourcesOpen(true)}>
          {t("vocab.sourceManage")}
        </Button>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setImportOpen(true)}>
          <Upload className="size-3.5" />
          {t("vocab.aiImport")}
        </Button>
        <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={openCreate}>
          <Plus className="size-3.5" />
          {t("vocab.addEntry")}
        </Button>
      </div>

      {/* 主区两栏：左 = 列表 / 问答视图，右 = 问答记录（md 以下隐藏避免拥挤） */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
      {/* 搜索 + 来源筛选（问答进行时隐藏，主区让位给答题视图） */}
      {!quiz && (
        <>
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("vocab.searchPlaceholder")}
          className="h-8 max-w-72"
        />
        <Select
          value={sourceFilter}
          onValueChange={(v) => {
            if (v) setSourceFilter(v)
          }}
        >
          {/* base-ui SelectValue 不传 children 时渲染原始 value（id），必须手写标签 */}
          <SelectTrigger className="h-8 w-36">
            <SelectValue>
              {sourceFilter === "all"
                ? t("vocab.allSources")
                : sourceFilter === "none"
                  ? t("vocab.uncategorized")
                  : (sourceById.get(sourceFilter)?.name ?? t("vocab.allSources"))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("vocab.allSources")}</SelectItem>
            <SelectItem value="none">{t("vocab.uncategorized")}</SelectItem>
            {sources.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          {t("vocab.filteredCount", { n: filtered.length, limit: filtered.length > LIST_RENDER_LIMIT ? t("vocab.renderLimited", { n: LIST_RENDER_LIMIT }) : "" })}
        </span>
      </div>

      {/* 列表（宽度对齐筛选框右缘：搜索框 288px + gap 8px + 下拉 144px = 440px） */}
      <div className="native-scroll min-h-0 flex-1 overflow-auto px-4 py-2">
        <div className="w-full max-w-[440px]">
        {!loaded ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {entries.length === 0
              ? t("vocab.emptyLibrary")
              : t("vocab.noMatch")}
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
                      <span className="min-w-0 break-all font-medium text-foreground">{e.word}</span>
                      {e.sourceId && (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {sourceNameOf(e) ?? t("vocab.unknownSource")}
                        </span>
                      )}
                      {ratingMeta && (
                        <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px]", ratingMeta.className)}>
                          {ratingMeta.label}
                        </span>
                      )}
                      {e.review.total > 0 && (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {t("vocab.reviewed", { n: e.review.total })}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground" title={e.definition}>
                      {e.definition.split("\n")[0]}
                    </p>
                  </div>
                  <button
                    type="button"
                    title={t("common.edit")}
                    aria-label={t("vocab.editEntryAria", { word: e.word })}
                    onClick={() => openEdit(e)}
                    className="hidden size-6 shrink-0 items-center justify-center rounded hover:bg-primary/10 group-hover:flex"
                  >
                    <Pencil className="size-3.5 text-muted-foreground" />
                  </button>
                  <button
                    type="button"
                    title={t("common.delete")}
                    aria-label={t("vocab.deleteEntryAria", { word: e.word })}
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
      </div>
        </>
      )}

      {/* 问答视图：自由切题作答，一次性提交（2026-10-07 主人口径） */}
      {quiz && quiz.index < quiz.queue.length && (
        <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
          {/* 顶部：上一题 / 下一题 + 结束本轮 */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              disabled={quiz.index === 0}
              onClick={() => goToQuestion(quiz.index - 1)}
              aria-label={t("vocab.prevQ")}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs text-muted-foreground">
              {t("vocab.questionPos", { cur: quiz.index + 1, total: quiz.queue.length })} · {t("vocab.elapsed")}{" "}
              {Math.max(
                0,
                Math.floor(((quiz.times[quiz.index] ?? 0) + (now - quiz.questionStart)) / 1000),
              )}{" "}
              {t("vocab.seconds")}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              disabled={quiz.index === quiz.queue.length - 1}
              onClick={() => goToQuestion(quiz.index + 1)}
              aria-label={t("vocab.nextQ")}
            >
              <ChevronRight className="size-4" />
            </Button>
            <div className="flex-1" />
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setConfirmExitQuiz(true)}>
              {t("vocab.finishRound")}
            </Button>
          </div>

          {/* 题面 */}
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5">
            <p className="max-w-[440px] break-all text-center font-serif text-4xl font-semibold text-foreground">
              {quiz.queue[quiz.index].word}
            </p>
            <textarea
              value={quiz.answers[quiz.index] ?? ""}
              onChange={(e) => {
                const v = e.target.value
                setQuiz((q) =>
                  q ? { ...q, answers: q.answers.map((old, i) => (i === q.index ? v : old)) } : q,
                )
              }}
              rows={5}
              className="native-scroll w-full max-w-[440px] rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder={t("vocab.answerPlaceholder")}
            />
          </div>

          {/* 底部：题号选择（未答=蓝圆 / 已答=绿圆，当前题描边）+ 一次性提交 */}
          <div className="flex flex-col items-center gap-3 border-t pt-3">
            <div className="flex flex-wrap justify-center gap-1.5">
              {quiz.queue.map((e, i) => {
                const answered = (quiz.answers[i] ?? "").trim().length > 0
                return (
                  <button
                    key={e.id}
                    type="button"
                    title={t("vocab.questionN", { n: i + 1, word: e.word })}
                    onClick={() => goToQuestion(i)}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full text-xs font-medium transition-colors",
                      answered
                        ? "bg-green-500/90 text-white hover:bg-green-500"
                        : "bg-primary/15 text-primary hover:bg-primary/25",
                      i === quiz.index && "ring-2 ring-ring ring-offset-1 ring-offset-background",
                    )}
                  >
                    {i + 1}
                  </button>
                )
              })}
            </div>
            <Button size="sm" className="h-8 text-xs" onClick={requestSubmitQuiz}>
              {t("vocab.submitAnswers", { done: quiz.queue.length - quiz.answers.filter((a) => !a.trim()).length, total: quiz.queue.length })}
            </Button>
          </div>
        </div>
      )}

      {/* 问答视图：评分中 / 报告 */}
      {quiz && quiz.index >= quiz.queue.length && (
        <>
          <div className="native-scroll min-h-0 flex-1 overflow-auto px-4 py-2">
            <div className="flex w-full max-w-[440px] flex-col gap-1.5">
              {quiz.queue.map((e, i) => {
                const g = quiz.grades[i]
                const ok = quizSuccessOf(g)
                return (
                  <div key={e.id} className="rounded-lg border bg-card px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 break-all font-medium text-foreground">{e.word}</span>
                      {g === null ? (
                        <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                          <Loader2 className="size-3 animate-spin" />
                          {t("vocab.rating")}
                        </span>
                      ) : ok ? (
                        <>
                          <span
                            className={cn(
                              "ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px]",
                              VOCAB_RATING_META[ok.rating].className,
                            )}
                          >
                            {VOCAB_RATING_META[ok.rating].label}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {Math.round(quiz.times[i] / 100) / 10}s
                          </span>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="ml-auto flex shrink-0 items-center gap-1 text-xs text-destructive hover:underline"
                          onClick={() => void retryGrade(i)}
                        >
                          <RotateCcw className="size-3" />
                          {t("vocab.retryRating")}
                        </button>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground" title={quiz.answers[i]}>
                      {t("vocab.yourAnswer")}：{quiz.answers[i]}
                    </p>
                    {ok ? (
                      <p className="mt-1 text-xs text-muted-foreground">{ok.comment}</p>
                    ) : g && "error" in g ? (
                      <p className="mt-1 text-xs text-destructive">{t("vocab.ratingFail")}：{g.error}</p>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
            {quizAllSuccess ? (
              <span>
                {t("vocab.roundSavedState", { saved: quiz.savedId ? t("vocab.saved") : t("vocab.saving") })} · {t("vocab.wrong")} {ratingCounts.wrong} / {t("vocab.partial")}{" "}
                {ratingCounts.partial} / {t("vocab.correct")} {ratingCounts.correct} / {t("vocab.beyond")} {ratingCounts.beyond}
              </span>
            ) : (
              <span>{t("vocab.someRatingFailed", { n: quizErrCount })}</span>
            )}
            <div className="flex-1" />
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={restartQuiz}>
              {t("vocab.again")}
            </Button>
            {quizAllSuccess ? (
              <Button size="sm" className="h-7 text-xs" onClick={() => setQuiz(null)}>
                {t("vocab.backToList")}
              </Button>
            ) : (
              <Button size="sm" className="h-7 text-xs" onClick={finishPartial}>
                {t("vocab.backToListSaved", { n: quizOkCount })}
              </Button>
            )}
          </div>
        </>

      )}

        </div>

        {/* 右半屏：问答记录（作答阶段让位，问答界面占满全屏） */}
        {!quizAnswering && (
        <div className="hidden w-1/2 min-w-0 flex-col border-l md:flex">
          <div className="flex items-center gap-2 border-b px-4 py-2">
            <h2 className="text-sm font-medium">{t("vocab.quizRecords")}</h2>
            <span className="text-xs text-muted-foreground">{t("vocab.rounds", { n: records.length })}</span>
          </div>
          {records.length === 0 ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
              <p className="text-sm text-muted-foreground">{t("vocab.noRecords")}</p>
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={openQuizConfig}>
                <Play className="size-3.5" />
                {t("vocab.startOneQuiz")}
              </Button>
            </div>
          ) : (
            <ul className="native-scroll flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto px-4 py-2">
              {records.map((r) => {
                const c: Record<VocabRating, number> = { wrong: 0, partial: 0, correct: 0, beyond: 0 }
                for (const it of r.items) c[it.rating]++
                return (
                  <li
                    key={r.id}
                    title={t("vocab.viewAnswer")}
                    onClick={() => setViewingRecord(r)}
                    className="cursor-pointer rounded-lg border bg-card px-3 py-2 text-sm transition-colors hover:border-ring/40"
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <span className="shrink-0 font-medium text-foreground">{formatRecordTime(r.at)}</span>
                      <span className="truncate text-muted-foreground" title={r.sourceName ?? t("vocab.allSources")}>
                        {r.sourceName ?? t("vocab.allSources")}
                      </span>
                      <span className="ml-auto shrink-0 text-muted-foreground">{t("vocab.nQuestions", { n: r.items.length })}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {(Object.keys(VOCAB_RATING_META) as VocabRating[]).map((k) =>
                        c[k] > 0 ? (
                          <span
                            key={k}
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px]",
                              VOCAB_RATING_META[k].className,
                            )}
                          >
                            {VOCAB_RATING_META[k].label} {c[k]}
                          </span>
                        ) : null,
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
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
            <DialogTitle>{editing ? t("vocab.editEntry") : t("vocab.addEntryTitle")}</DialogTitle>
            <DialogDescription>
              {editing ? t("vocab.editEntryDesc") : t("vocab.addEntryDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="vocab-word">{t("vocab.word")}</Label>
              <Input
                id="vocab-word"
                value={draftWord}
                onChange={(e) => setDraftWord(e.target.value)}
                maxLength={100}
                placeholder={t("vocab.wordPlaceholder")}
              />
              {existingEntry && (
                <p className="flex items-center gap-2 text-xs text-orange-600 dark:text-orange-400">
                  <span>{t("vocab.wordExists")}</span>
                  <button
                    type="button"
                    className="shrink-0 rounded underline underline-offset-2 hover:text-foreground"
                    onClick={() => loadExistingEntry(existingEntry)}
                  >
                    {t("vocab.loadExisting")}
                  </button>
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="vocab-def">{t("vocab.definition")}</Label>
              <textarea
                id="vocab-def"
                value={draftDefinition}
                onChange={(e) => setDraftDefinition(e.target.value)}
                rows={4}
                className="native-scroll min-h-0 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder={t("vocab.defPlaceholder")}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>{t("vocab.source")}</Label>
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
                    <SelectValue>
                      {draftSourceId === "none"
                        ? t("vocab.uncategorized")
                        : (sourceById.get(draftSourceId)?.name ?? t("vocab.uncategorized"))}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("vocab.uncategorized")}</SelectItem>
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
                placeholder={t("vocab.newSourcePlaceholder")}
                className="h-7 text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEditor}>
              {t("common.cancel")}
            </Button>
            <Button onClick={commitEntry}>{editing ? t("common.save") : t("common.add")}</Button>
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
            <AlertDialogTitle>{t("vocab.deleteEntryTitle", { word: truncateWord(confirmDelEntry?.word ?? "") })}</AlertDialogTitle>
            <AlertDialogDescription>{t("vault.deleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDelEntry(null)}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={doDeleteEntry}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 来源管理 */}
      <Dialog open={sourcesOpen} onOpenChange={setSourcesOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("vocab.sourceManage")}</DialogTitle>
            <DialogDescription>
              {t("vocab.sourceDesc")}
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
              placeholder={t("vocab.newSourcePlaceholder2")}
              className="h-8 flex-1"
            />
            <Button variant="outline" className="h-8 shrink-0 gap-1" onClick={() => void addSource()}>
              <Plus className="size-3.5" />
              {t("common.add")}
            </Button>
          </div>
          <ul className="native-scroll flex max-h-64 flex-col gap-1 overflow-auto">
            {sources.length === 0 && (
              <li className="py-4 text-center text-xs text-muted-foreground">{t("vocab.noSources")}</li>
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
                      <span className="shrink-0 text-muted-foreground">{t("vocab.nWords", { n: count })}</span>
                      <button
                        type="button"
                        title={t("common.rename")}
                        aria-label={t("vocab.renameSourceAria", { name: s.name })}
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
                        title={t("common.delete")}
                        aria-label={t("vocab.deleteSourceAria", { name: s.name })}
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
            <AlertDialogTitle>{t("vocab.deleteSourceTitle", { name: confirmDelSource?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {entries.filter((e) => e.sourceId === confirmDelSource?.id).length > 0
                ? t("vocab.deleteSourceDesc", { n: entries.filter((e) => e.sourceId === confirmDelSource?.id).length })
                : t("vocab.sourceUnused")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDelSource(null)}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={doDeleteSource}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI 批量导入 */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("vocab.aiImportTitle")}</DialogTitle>
            <DialogDescription>
              {t("vocab.aiImportDesc1")}
              {t("vocab.aiImportDesc2")}
              {t("vocab.aiImportDesc3")}
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
              {t("vocab.parseResult", { n: parsedImport.items.length })}
              {parsedImport.invalid > 0 ? t("vocab.parseInvalid", { n: parsedImport.invalid }) : ""}
              {duplicatesInDb > 0 ? t("vocab.parseDuplicates", { n: duplicatesInDb }) : ""}
              {parsedImport.items.length > 0 && t("vocab.parsePreview", { words: parsedImport.items.slice(0, 3).map((it) => it.word).join("、"), more: parsedImport.items.length > 3 ? " …" : "" })}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => void doImport()}
              disabled={importing || parsedImport.items.length === 0}
            >
              {importing ? t("vocab.importing") : t("vocab.importN", { n: parsedImport.items.length })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 问答配置 */}
      <Dialog open={quizConfigOpen} onOpenChange={setQuizConfigOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("vocab.startQuizTitle")}</DialogTitle>
            <DialogDescription>
              {t("vocab.startQuizDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label>{t("vocab.quizScope")}</Label>
              <Select
                value={quizScope}
                onValueChange={(v) => {
                  if (v) setQuizScope(v)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {quizScope === "all"
                      ? t("vocab.allSources")
                      : quizScope === "none"
                        ? t("vocab.uncategorized")
                        : (sourceById.get(quizScope)?.name ?? t("vocab.allSources"))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("vocab.allSources")}</SelectItem>
                  <SelectItem value="none">{t("vocab.uncategorized")}</SelectItem>
                  {sources.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("vocab.poolSize", { n: quizPool.length })}</p>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="quiz-count">{t("vocab.questionCount")}</Label>
              <Input
                id="quiz-count"
                type="number"
                min={1}
                max={Math.min(100, Math.max(1, quizPool.length))}
                value={quizCount}
                onChange={(e) => setQuizCount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuizConfigOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={quizPool.length === 0} onClick={startQuiz}>
              {t("profile.start")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 问答中途退出确认 */}
      <AlertDialog open={confirmExitQuiz} onOpenChange={setConfirmExitQuiz}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("vocab.quitQuizTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("vocab.quitQuizDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("vocab.keepAnswering")}</AlertDialogCancel>
            <AlertDialogAction onClick={discardQuiz}>{t("profile.finish")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 提交作答确认（有未答题时） */}
      <AlertDialog
        open={confirmSubmitQuiz !== null}
        onOpenChange={(v) => !v && setConfirmSubmitQuiz(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("vocab.unansweredTitle", { n: confirmSubmitQuiz ?? 0 })}</AlertDialogTitle>
            <AlertDialogDescription>{t("vocab.unansweredDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("vocab.continueAnswering")}</AlertDialogCancel>
            <AlertDialogAction onClick={doSubmitQuiz}>{t("vocab.submit")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 问答记录详情：回看当时作答 */}
      <Dialog
        open={viewingRecord !== null}
        onOpenChange={(v) => {
          if (!v) setViewingRecord(null)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("vocab.quizRecords")}</DialogTitle>
            <DialogDescription>
              {viewingRecord &&
                `${formatRecordTime(viewingRecord.at)} · ${viewingRecord.sourceName ?? t("vocab.allSources")} · ${viewingRecord.items.length} 题`}
            </DialogDescription>
          </DialogHeader>
          <ul className="native-scroll flex max-h-[60vh] flex-col gap-1.5 overflow-auto">
            {viewingRecord?.items.map((it, i) => (
              <li
                key={`${it.id}-${i}`}
                className="rounded-lg border bg-card px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 break-all font-medium text-foreground">{it.word}</span>
                  <span
                    className={cn(
                      "ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px]",
                      VOCAB_RATING_META[it.rating].className,
                    )}
                  >
                    {VOCAB_RATING_META[it.rating].label}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {Math.round(it.timeMs / 100) / 10}s
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground" title={it.answer}>
                  {t("vocab.yourAnswer")}：{it.answer}
                </p>
                {it.comment && <p className="mt-1 text-xs text-muted-foreground">{it.comment}</p>}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingRecord(null)}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
