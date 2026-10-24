"use client"

import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react"
import {
  format,
  parse,
  addMonths,
  addDays,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns"
import { zhCN } from "date-fns/locale"
import { CalendarCog, CalendarOff, Briefcase, Check, ChevronLeft, ChevronRight, StickyNote, Sparkles, Plus, Pencil, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useWorkspace } from "@/lib/store"
import { useTranslation } from "react-i18next"
import { matchTextPinyin } from "@/lib/pinyin"
import { collectDueNodes, type DueEntry } from "@/lib/deadlines"
import { type Person } from "@/lib/address-book"
import {
  festivalsForDate,
  builtinChinaFestivals,
  parseFestivalRule,
  HOLIDAY_COLOR,
  WORKDAY_COLOR,
  type Festival,
  type FestivalDef,
} from "@/lib/festivals"
import { birthdaysOn } from "@/lib/birthday"
import { lunarTextForSolar } from "@/lib/lunar"
import { dayShortHint } from "@/lib/day-hint"
import { RichTextEditor } from "@/components/richtext/rich-text-editor"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

const WEEKDAY_KEYS = [0, 1, 2, 3, 4, 5, 6] // TODO 40：键对应 i18n calendar.weekday.0-6

// TODO 55：编辑草稿，original 为空 = 新建；保存按引用相等替换原条目
interface FestivalDraft {
  original: FestivalDef | null
  name: string
  rule: string
  color: string
  holiday: boolean
  workday: boolean
}

function cutFestivalName(name: string): string {
  return name.length > 4 ? name.slice(0, 3) + "…" : name
}

/** 桌面端（lg 1024px+）判定，用于分隔条拖拽开关 */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const m = window.matchMedia(query)
    const handler = () => setMatches(m.matches)
    handler()
    m.addEventListener("change", handler)
    return () => m.removeEventListener("change", handler)
  }, [query])
  return matches
}

export function CalendarWorkspace() {
  const { t } = useTranslation()
  const selectedDate = useWorkspace((s) => s.selectedDate)
  const setSelectedDate = useWorkspace((s) => s.setSelectedDate)
  const calendar = useWorkspace((s) => s.calendar)
  const categories = useWorkspace((s) => s.categories)
  const calendarDetailWidth = useWorkspace((s) => s.calendarDetailWidth)
  const setCalendarDetailWidth = useWorkspace((s) => s.setCalendarDetailWidth)
  const gridRef = useRef<HTMLDivElement>(null)
  // 翻月方向：+1=下月(内容自下方入)，-1=上月(内容自上方入)。用于方向感知滑入动画。
  const [direction, setDirection] = useState<1 | -1>(1)

  // 详情面板宽度：拖动中用本地 state（流畅），松手写入 store 持久化
  const [detailWidth, setDetailWidth] = useState<number>(calendarDetailWidth)
  const latestWidthRef = useRef<number>(calendarDetailWidth)
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const isDesktop = useMediaQuery("(min-width: 1024px)")

  // store 重新水合时同步回本地，保证刷新后位置生效（setState 延迟一拍避开 set-state-in-effect）
  useEffect(() => {
    const t = window.setTimeout(() => setDetailWidth(calendarDetailWidth), 0)
    latestWidthRef.current = calendarDetailWidth
    return () => window.clearTimeout(t)
  }, [calendarDetailWidth])


  // TODO 48：节日/通讯录由 store 持久化驱动（public/*.yml 仅作设置页导入源）
  const people = useWorkspace((s) => s.contacts)
  const festivalDefs = useWorkspace((s) => s.customFestivals)
  const setCustomFestivals = useWorkspace((s) => s.setCustomFestivals)

  // TODO 54：按日聚合关系族中绑定截止日期的 Todo 节点
  const relationFamilies = useWorkspace((s) => s.relationFamilies)
  const dueMap = useMemo(
    () => collectDueNodes(categories, Object.values(relationFamilies)),
    [categories, relationFamilies],
  )
  const current = useMemo(() => parse(selectedDate, "yyyy-MM-dd", new Date()), [selectedDate])

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(current))
    const end = endOfWeek(endOfMonth(current))
    return eachDayOfInterval({ start, end })
  }, [current])

  function shift(dir: 1 | -1) {
    setDirection(dir)
    setSelectedDate(format(addMonths(current, dir), "yyyy-MM-dd"))
  }

  // TODO 55：右键把某日标为假/班——实现为一次性节日写入 customFestivals，复用假/班角标管线；
  // 再点同项取消，假/班互斥（标记一类会移除同日的另一类）。
  function toggleDayMark(key: string, kind: "holiday" | "workday") {
    const isKind = (d: FestivalDef) =>
      d.festival_rule === key && !!(kind === "holiday" ? d.holiday_override : d.workday_override)
    const label = t(kind === "holiday" ? "calendar.holiday" : "calendar.workday")
    if (festivalDefs.some(isKind)) {
      setCustomFestivals(festivalDefs.filter((d) => !isKind(d)))
      toast.success(t("calendar.markCancelled", { key, label }))
      return
    }
    const next = festivalDefs.filter(
      (d) => !(d.festival_rule === key && !!(kind === "holiday" ? d.workday_override : d.holiday_override))
    )
    next.push({
      name: label,
      festival_rule: key,
      color: kind === "holiday" ? HOLIDAY_COLOR : WORKDAY_COLOR,
      ...(kind === "holiday" ? { holiday_override: true } : { workday_override: true }),
    })
    setCustomFestivals(next)
    toast.success(t("calendar.marked", { key, label }))
  }

  // TODO 55：节日管理弹窗（编辑弹窗叠于其上，草稿非空时打开）
  const [festivalManagerOpen, setFestivalManagerOpen] = useState(false)
  const [festivalSearch, setFestivalSearch] = useState("")
  const [festivalDraft, setFestivalDraft] = useState<FestivalDraft | null>(null)

  const filteredFestivals = useMemo(() => {
    const q = festivalSearch.trim().toLowerCase()
    if (!q) return festivalDefs
    return festivalDefs.filter(
      (d) => matchTextPinyin(d.name, q) || matchTextPinyin(d.festival_rule, q)
    )
  }, [festivalDefs, festivalSearch])

  function openNewFestival() {
    setFestivalDraft({ original: null, name: "", rule: "", color: "#6a5acd", holiday: false, workday: false })
  }

  function openEditFestival(def: FestivalDef) {
    setFestivalDraft({
      original: def,
      name: def.name,
      rule: def.festival_rule ?? "",
      color: /^#[0-9a-fA-F]{6}$/.test(def.color ?? "") ? (def.color as string) : "#6a5acd",
      holiday: !!def.holiday_override,
      workday: !!def.workday_override,
    })
  }

  function saveFestival() {
    if (!festivalDraft) return
    const name = festivalDraft.name.trim()
    if (!name) {
      toast.error(t("calendar.errName"))
      return
    }
    if (!parseFestivalRule(festivalDraft.rule)) {
      toast.error(t("calendar.errRule"))
      return
    }
    const def: FestivalDef = {
      name,
      festival_rule: festivalDraft.rule.trim(),
      color: festivalDraft.color,
      ...(festivalDraft.holiday ? { holiday_override: true } : {}),
      ...(festivalDraft.workday ? { workday_override: true } : {}),
    }
    const next = festivalDraft.original
      ? festivalDefs.map((d) => (d === festivalDraft.original ? def : d))
      : [...festivalDefs, def]
    setCustomFestivals(next)
    setFestivalDraft(null)
    toast.success(festivalDraft.original ? t("calendar.festivalUpdated") : t("calendar.festivalAdded"))
  }

  function removeFestival(def: FestivalDef) {
    setCustomFestivals(festivalDefs.filter((d) => d !== def))
    toast.success(t("calendar.festivalDeleted", { name: def.name }))
  }

  function startResize(e: ReactMouseEvent) {
    e.preventDefault()
    draggingRef.current = true
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const leftW = ev.clientX - rect.left
      const minLeft = 320
      const minRight = 280
      const w = Math.max(minLeft, Math.min(rect.width - minRight, leftW))
      const next = rect.width - w
      setDetailWidth(next)
      latestWidthRef.current = next
    }
    const onUp = () => {
      draggingRef.current = false
      document.body.style.userSelect = ""
      // 松手才写 store，避免拖动中每帧写 localStorage
      setCalendarDetailWidth(latestWidthRef.current)
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    document.body.style.userSelect = "none"
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  // 方向键移动选中日期（←/→ ±1 天，↑/↓ ±7 天），避开输入框聚焦
  useEffect(() => {
    function isEditable(el: EventTarget | null): boolean {
      return (
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
      )
    }
    function onKey(e: KeyboardEvent) {
      // 带修饰键不劫持，留给其它快捷键/滚动
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
      if (isEditable(e.target)) return
      const map: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
      const delta = map[e.key]
      if (delta === undefined) return
      e.preventDefault()
      // 长按连续移动；跨月动画由 key 重建触发一次，方向以最终为准
      setSelectedDate(format(addDays(current, delta), "yyyy-MM-dd"))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [current, setSelectedDate])

  const title = format(current, "yyyy 年 M 月", { locale: zhCN })

  return (
    <div
      ref={containerRef}
      className="cal-dark flex h-full flex-col lg:flex-row"
      style={{
        backgroundImage:
          "linear-gradient(135deg, rgb(26,26,46) 0%, rgb(22,33,62) 50%, rgb(15,52,96) 100%)",
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col border-b lg:border-b-0">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <h1 className="font-serif text-2xl font-semibold">{title}</h1>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="size-8" onClick={() => shift(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedDate(format(new Date(), "yyyy-MM-dd"))}
            >
              {t("calendar.today")}
            </Button>
            <Button variant="outline" size="icon" className="size-8" onClick={() => shift(1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            title={t("calendar.customFestivals")}
            aria-label={t("calendar.customFestivals")}
            onClick={() => setFestivalManagerOpen(true)}
          >
            <CalendarCog className="size-4" />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col p-3">
          <div className="grid grid-cols-7 pb-1">
            {WEEKDAY_KEYS.map((d, i) => (
              <div
                key={d}
                className={cn(
                  "text-center text-[15px] font-semibold",
                  i === 0 || i === 6 ? "text-red-400" : "text-muted-foreground"
                )}
              >
                {t(`calendar.weekday.${d}`)}
              </div>
            ))}
          </div>
          <div
            ref={gridRef}
            key={format(current, "yyyy-MM")}
            className={cn(
              "grid flex-1 auto-rows-fr grid-cols-7 gap-px rounded-xl border border-border bg-border/40",
              direction === 1 ? "cal-month-anim-down" : "cal-month-anim-up"
            )}
          >
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd")
              const data = calendar[key]
              const dueNodes = dueMap[key] ?? []
              const selected = isSameDay(day, current)
              const outside = !isSameMonth(day, current)
              const isWeekend = day.getDay() === 0 || day.getDay() === 6
              const hasNote = !!data && data.note.trim() !== ""
              // 内置节日在前，优先级高于用户节日（shortHint 与假/班角标据此取值）
              const builtin = builtinChinaFestivals(day.getFullYear(), day.getMonth() + 1, day.getDate())
              const userFests = festivalsForDate(festivalDefs, day.getFullYear(), day.getMonth() + 1, day.getDate())
              const festivals = [...builtin, ...userFests]
              const bdays = birthdaysOn(people, day.getFullYear(), day.getMonth() + 1, day.getDate())
              const hasHoliday = festivals.some((f) => f.holiday)
              const hasWorkday = festivals.some((f) => f.workday)
              const hasBirthday = bdays.length > 0
              const shortHint = dayShortHint(day)
              const dayMark = festivalDefs.find(
                (d) => d.festival_rule === key && (d.holiday_override || d.workday_override)
              )

              let dateNumClass = "text-foreground"
              let dateNumStyle: CSSProperties | undefined
              if (isToday(day)) {
                dateNumStyle = { color: "#60a5fa" }
              } else if (hasBirthday) {
                dateNumStyle = { color: "#4ade80" }
              } else if (festivals.length > 0) {
                dateNumStyle = { color: festivals[0].color }
              } else if (hasHoliday) {
                dateNumClass = "text-destructive"
              } else if (hasWorkday) {
                dateNumClass = "text-blue-400"
              } else if (outside) {
                dateNumClass = "text-muted-foreground/50"
              } else if (isWeekend) {
                dateNumClass = "text-red-400"
              } else {
                dateNumClass = "text-foreground"
              }

              let shortHintClass = "text-muted-foreground/70"
              let shortHintColor: string | undefined
              let shortHintText: ReactNode = shortHint || format(day, "M/d")
              if (isToday(day)) {
                shortHintColor = "#60a5fa"
              } else if (festivals.length > 0) {
                shortHintColor = festivals[0].color
                shortHintText = (
                  <span className="relative inline-block">
                    <span className="font-semibold">{cutFestivalName(festivals[0].name)}</span>
                    {festivals.length > 1 && (
                      <span
                        className="pointer-events-none absolute -right-2 -top-1.5 z-10 rounded-full text-[9px] font-bold leading-4"
                        style={{ color: festivals[0].color }}
                      >
                        {festivals.length}
                      </span>
                    )}
                  </span>
                )
              } else if (hasBirthday) {
                shortHintColor = "#4ade80"
              } else if (hasHoliday) {
                shortHintClass = "text-destructive"
              } else if (hasWorkday) {
                shortHintClass = "text-blue-400"
              } else if (outside) {
                shortHintClass = "text-muted-foreground/50"
              } else if (isWeekend) {
                shortHintClass = "text-red-400"
              }

              // 假/班角标互斥（至多取一），另加生日蛋糕
              const mwBadge: ReactNode =
                hasHoliday ? (
                  <span
                    className="rounded px-0.5 text-center text-[10px] font-bold leading-3.5"
                    style={{ backgroundColor: "#ff9800", color: "#e74c3c" }}
                  >
                    {t("calendar.holidayShort")}
                  </span>
                ) : hasWorkday ? (
                  <span
                    className="rounded px-0.5 text-center text-[10px] font-bold leading-3.5"
                    style={{ backgroundColor: "#3498db", color: "#fff" }}
                  >
                    {t("calendar.workdayShort")}
                  </span>
                ) : null
              const cakeBadge: ReactNode = hasBirthday ? (
                <span className="text-center text-[13px] leading-none">🎂</span>
              ) : null
              const corner = (() => {
                // 偏移基于日期数字锚点，负值越大越外探（锚点已放大以留外探空间）
                const outer = "-right-2 -top-1.5 z-30"
                const inner = "-left-2 -top-1.5 z-30"
                if (mwBadge && cakeBadge) {
                  return (
                    <>
                      <span className={cn("pointer-events-none absolute", inner)}>{cakeBadge}</span>
                      <span className={cn("pointer-events-none absolute", outer)}>{mwBadge}</span>
                    </>
                  )
                }
                const single = mwBadge ?? cakeBadge
                return single ? (
                  <span className={cn("pointer-events-none absolute", outer)}>{single}</span>
                ) : null
              })()
              return (
                <ContextMenu key={key}>
                  {/* base-ui Trigger render prop 接管原格 button，只拦 contextmenu，不影响左键选中 */}
                  <ContextMenuTrigger
                    render={(triggerProps) => (
                      <button
                        {...triggerProps}
                        type="button"
                        data-date={key}
                        onClick={() => setSelectedDate(key)}
                        className={cn(
                          triggerProps.className,
                          "group relative flex min-h-16 flex-col items-center justify-center rounded-lg px-1 py-1 text-center outline-none",
                          outside && "opacity-40"
                        )}
                      >
                  {/* 日期数字锚点（已放大供角标外探）；选中/hover 高亮挂在数字圆上而非整格 */}
                  <span className="relative inline-flex items-center justify-center">
                    {hasNote && <span className="absolute -top-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-primary" />}
                    <span
                      className={cn(
                        "inline-flex size-8 items-center justify-center rounded-full text-base transition-colors",
                        isToday(day) ? "font-bold" : "font-medium",
                        dateNumClass,
                        selected ? "bg-primary/15" : "group-hover:bg-muted/60"
                      )}
                      style={dateNumStyle}
                    >
                      {format(day, "d")}
                    </span>
                    {corner}
                  </span>
                  <span className="relative max-w-full text-center text-xs leading-3.5">
                    <span
                      className={shortHintClass}
                      style={shortHintColor ? { color: shortHintColor } : undefined}
                    >
                      {shortHintText}
                    </span>
                  </span>
                  {dueNodes.length > 0 && (
                    <span className="absolute bottom-0 right-0 mr-0.5 mb-0.5 rounded bg-primary/20 px-0.5 text-center text-[10px] font-semibold text-primary">
                      {dueNodes.length}
                    </span>
                  )}
                      </button>
                    )}
                  />
                  <ContextMenuContent className="min-w-44">
                    <ContextMenuItem onClick={() => toggleDayMark(key, "holiday")}>
                      <CalendarOff />
                      <span style={{ color: HOLIDAY_COLOR }}>{t("calendar.todayHoliday")}</span>
                      {dayMark?.holiday_override && <Check className="ml-auto" />}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => toggleDayMark(key, "workday")}>
                      <Briefcase />
                      <span style={{ color: WORKDAY_COLOR }}>{t("calendar.todayWorkday")}</span>
                      {dayMark?.workday_override && <Check className="ml-auto" />}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              )
            })}
          </div>
        </div>
      </div>

      <div
        onMouseDown={startResize}
        role="separator"
        aria-orientation="vertical"
        aria-label={t("calendar.resizeSplit")}
        className="hidden w-1.5 shrink-0 cursor-col-resize items-stretch bg-border/40 transition-colors hover:bg-primary/50 lg:flex"
      >
        <div className="mx-auto my-auto h-10 w-0.5 rounded-full bg-border" />
      </div>

      <DayDetail
        dateKey={format(current, "yyyy-MM-dd")}
        dueNodes={dueMap[format(current, "yyyy-MM-dd")] ?? []}
        people={people}
        festivals={[
          ...builtinChinaFestivals(current.getFullYear(), current.getMonth() + 1, current.getDate()),
          ...festivalsForDate(festivalDefs, current.getFullYear(), current.getMonth() + 1, current.getDate()),
        ]}
        style={isDesktop ? { width: detailWidth } : undefined}
      />

      <Dialog
        open={festivalManagerOpen}
        onOpenChange={(v) => {
          setFestivalManagerOpen(v)
          if (!v) {
            setFestivalSearch("")
            setFestivalDraft(null)
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="font-serif text-lg font-semibold">{t("calendar.customFestivals")}</DialogTitle>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={openNewFestival}>
              <Plus className="size-4" />
              {t("calendar.addFestival")}
            </Button>
          </div>
          <DialogDescription>
            {t("calendar.ruleHelp")}
          </DialogDescription>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={festivalSearch}
              onChange={(e) => setFestivalSearch(e.target.value)}
              placeholder={t("calendar.searchFestival")}
              className="pl-8"
            />
          </div>
          <div className="flex max-h-80 min-h-24 flex-col gap-1.5 overflow-y-auto">
            {filteredFestivals.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                {festivalDefs.length === 0 ? t("calendar.noFestivals") : t("calendar.noMatch")}
              </p>
            ) : (
              filteredFestivals.map((def, i) => (
                <div
                  key={`${def.name}-${def.festival_rule ?? ""}-${i}`}
                  className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: def.color || "slateblue" }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{def.name}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {def.festival_rule || t("calendar.noRule")}
                  </span>
                  {def.holiday_override && (
                    <span className="shrink-0 rounded bg-destructive/10 px-1 text-[10px] font-bold text-destructive">{t("calendar.holidayShort")}</span>
                  )}
                  {def.workday_override && (
                    <span className="shrink-0 rounded bg-blue-500/10 px-1 text-[10px] font-bold text-blue-500">{t("calendar.workdayShort")}</span>
                  )}
                  <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => openEditFestival(def)}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => removeFestival(def)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 节日编辑弹窗（叠于管理弹窗之上） */}
      <Dialog
        open={festivalDraft !== null}
        onOpenChange={(v) => {
          if (!v) setFestivalDraft(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{festivalDraft?.original ? t("calendar.editFestival") : t("calendar.newFestival")}</DialogTitle>
            <DialogDescription>
              {t("calendar.ruleHelp")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">{t("calendar.fName")}</label>
              <Input
                value={festivalDraft?.name ?? ""}
                onChange={(e) => festivalDraft && setFestivalDraft({ ...festivalDraft, name: e.target.value })}
                placeholder={t("calendar.namePlaceholder")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">{t("calendar.fRule")}</label>
              <Input
                value={festivalDraft?.rule ?? ""}
                onChange={(e) => festivalDraft && setFestivalDraft({ ...festivalDraft, rule: e.target.value })}
                placeholder={t("calendar.rulePlaceholder")}
              />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="shrink-0 text-sm font-medium">{t("calendar.color")}</label>
                <Input
                  type="color"
                  value={festivalDraft?.color ?? "#6a5acd"}
                  onChange={(e) => festivalDraft && setFestivalDraft({ ...festivalDraft, color: e.target.value })}
                  className="h-9 w-14 p-1"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={festivalDraft?.holiday ?? false}
                  onChange={(e) => festivalDraft && setFestivalDraft({ ...festivalDraft, holiday: e.target.checked })}
                  className="size-4 accent-red-500"
                />
                <span className="text-destructive">{t("calendar.holiday")}</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={festivalDraft?.workday ?? false}
                  onChange={(e) => festivalDraft && setFestivalDraft({ ...festivalDraft, workday: e.target.checked })}
                  className="size-4 accent-blue-500"
                />
                <span className="text-blue-500">{t("calendar.workday")}</span>
              </label>
            </div>
            <Button onClick={saveFestival}>{t("common.save")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DayDetail({
  dateKey,
  dueNodes,
  people,
  festivals,
  style,
}: {
  dateKey: string
  dueNodes: DueEntry[]
  people: Person[]
  festivals: Festival[]
  style?: CSSProperties
}) {
  const { t } = useTranslation()
  const calendar = useWorkspace((s) => s.calendar)
  const setDayNote = useWorkspace((s) => s.setDayNote)
  const setActiveCategory = useWorkspace((s) => s.setActiveCategory)
  const setActiveItem = useWorkspace((s) => s.setActiveItem)
  const askAiAbout = useWorkspace((s) => s.askAiAbout)

  const day = calendar[dateKey] ?? { note: "", todos: [], events: [] }

  const dateObj = parse(dateKey, "yyyy-MM-dd", new Date())
  const bdays = birthdaysOn(people, dateObj.getFullYear(), dateObj.getMonth() + 1, dateObj.getDate())
  const lunarText = lunarTextForSolar(dateObj)

  // askAiAbout 会新建 AI 会话并自动切过去发送
  const dateLabel = format(dateObj, "M 月 d 日", { locale: zhCN })
  const weekdayLabel = format(dateObj, "EEEE", { locale: zhCN })
  const askFestival = () => {
    const names = festivals.map((f) => f.name)
    if (names.length === 0) {
      toast.info(t("calendar.noFestivalToday", { date: dateLabel }))
      return
    }
    const prompt = `今天是 ${dateLabel}（${weekdayLabel}），这一天的节日有：${names.join("、")}。请给我讲讲这些节日的来历、传统习俗和相关趣味知识。`
    askAiAbout(prompt)
  }
  const askNote = () => {
    const noteText = (day.note || "").trim()
    const prompt = noteText
      ? `今天是 ${dateLabel}（${weekdayLabel}），我今天写的笔记内容如下：\n${noteText}\n请帮我梳理、补充或解读这份笔记。`
      : `今天是 ${dateLabel}（${weekdayLabel}），我今天还没有写笔记。请帮我列一份适合今天记录的笔记大纲/要点。`
    askAiAbout(prompt)
  }

  return (
    <aside className="flex w-full min-h-0 flex-col lg:h-full lg:w-auto lg:shrink-0" style={style}>
      <div className="border-b px-4 py-3">
        <p className="text-base font-semibold">{format(dateObj, "M 月 d 日", { locale: zhCN })}</p>
        <p className="text-[14px] text-muted-foreground">{format(dateObj, "EEEE", { locale: zhCN })}</p>
        <p className="mt-0.5 text-[14px] text-muted-foreground/70">{lunarText}</p>
      </div>

      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        <div className="flex flex-col gap-5 p-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={askFestival}
              className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            >
              <Sparkles className="size-3.5 text-primary" />
              {t("calendar.askFestival")}
            </button>
            <button
              type="button"
              onClick={askNote}
              className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            >
              <Sparkles className="size-3.5 text-primary" />
              {t("calendar.askNote")}
            </button>
          </div>

          {bdays.length > 0 && (
            <>
              <section className="flex flex-col gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  🎂 {t("calendar.todayBirthday")}
                </h3>
                <ul className="flex flex-col gap-1">
                  {bdays.map((p) => (
                    <li key={p.name} className="rounded-md border bg-background px-2 py-1.5 text-[15px]">
                      <span className="font-medium">{p.name}</span>
                      {p.description ? <span className="text-[13px] text-muted-foreground"> · {p.description}</span> : null}
                    </li>
                  ))}
                </ul>
              </section>
              <Separator />
            </>
          )}

          {festivals.length > 0 && (
            <>
              <section className="flex flex-col gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  🎉 {t("calendar.todayFestival")}
                </h3>
                <ul className="flex flex-col gap-1">
                  {festivals.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-[15px]">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: f.color }}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                      {f.holiday && (
                        <span
                          className="shrink-0 rounded px-1 text-[10px] font-bold leading-4"
                          style={{ backgroundColor: "#ff9800", color: "#e74c3c" }}
                        >
                          {t("calendar.holidayShort")}
                        </span>
                      )}
                      {f.workday && !f.holiday && (
                        <span
                          className="shrink-0 rounded px-1 text-[10px] font-bold leading-4"
                          style={{ backgroundColor: "#3498db", color: "#fff" }}
                        >
                          {t("calendar.workdayShort")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
              <Separator />
            </>
          )}

          <section className="flex flex-col gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <StickyNote className="size-3.5" />
              {t("calendar.todayNote")}
            </h3>
            <RichTextEditor
              value={day.note}
              onChange={(v) => setDayNote(dateKey, v)}
              minHeight="min-h-24"
            />
          </section>

          <Separator />

          {dueNodes.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-muted-foreground">{t("calendar.dueTasks")}</h3>
              <ul className="flex flex-col gap-1">
                {dueNodes.map((d) => (
                  <li key={`${d.categoryId}-${d.nodeId}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveCategory(d.categoryId)
                        setActiveItem(d.nodeId)
                      }}
                      className="flex w-full items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-left text-xs"
                    >
                      <span className="truncate font-medium">{d.title}</span>
                      <span className="ml-auto shrink-0 truncate text-muted-foreground">
                        {d.categoryName}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* TODO 2 停用：日历待办/事件（保留 mindmap dueDate 体系，可恢复）
          <Separator />

          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-medium text-muted-foreground">{t("calendar.todos")}</h3>
            <ul className="flex flex-col gap-1">
              {day.todos.map((t) => (
                <li key={t.id} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
                  <Checkbox
                    checked={t.done}
                    onCheckedChange={() => toggleCalendarTodo(dateKey, t.id)}
                    id={`todo-${t.id}`}
                  />
                  <label
                    htmlFor={`todo-${t.id}`}
                    className={cn(
                      "flex-1 cursor-pointer text-sm",
                      t.done && "text-muted-foreground line-through",
                    )}
                  >
                    {t.content}
                  </label>
                  <button
                    type="button"
                    onClick={() => removeCalendarTodo(dateKey, t.id)}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </li>
              ))}
              {day.todos.length === 0 && <p className="px-1 text-xs text-muted-foreground">{t("calendar.noTodos")}</p>}
            </ul>
            <div className="flex gap-2">
              <Input
                value={todoInput}
                onChange={(e) => setTodoInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && todoInput.trim()) {
                    addCalendarTodo(dateKey, todoInput.trim())
                    setTodoInput("")
                  }
                }}
                placeholder={t("calendar.addTodoPlaceholder")}
                className="h-9"
              />
              <Button
                size="icon"
                className="size-9 shrink-0"
                onClick={() => {
                  if (todoInput.trim()) {
                    addCalendarTodo(dateKey, todoInput.trim())
                    setTodoInput("")
                  }
                }}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </section>

          <Separator />

          <section className="flex flex-col gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Clock className="size-3.5" />
              {t("calendar.events")}
            </h3>
            <ul className="flex flex-col gap-1">
              {day.events.map((ev) => (
                <li key={ev.id} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
                  <span className="w-14 shrink-0 font-mono text-xs text-primary">{ev.time || t("calendar.allDay")}</span>
                  <span className="flex-1 text-sm">{ev.content}</span>
                  <button
                    type="button"
                    onClick={() => removeCalendarEvent(dateKey, ev.id)}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </li>
              ))}
              {day.events.length === 0 && <p className="px-1 text-xs text-muted-foreground">{t("calendar.noEvents")}</p>}
            </ul>
            <div className="flex gap-2">
              <Input
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
                placeholder={t("calendar.timePlaceholder")}
                className="h-9 w-20 shrink-0"
              />
              <Input
                value={eventContent}
                onChange={(e) => setEventContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && eventContent.trim()) {
                    addCalendarEvent(dateKey, eventTime.trim(), eventContent.trim())
                    setEventTime("")
                    setEventContent("")
                  }
                }}
                placeholder={t("calendar.eventPlaceholder")}
                className="h-9"
              />
              <Button
                size="icon"
                className="size-9 shrink-0"
                onClick={() => {
                  if (eventContent.trim()) {
                    addCalendarEvent(dateKey, eventTime.trim(), eventContent.trim())
                    setEventTime("")
                    setEventContent("")
                    toast.success(t("calendar.eventAdded"))
                  }
                }}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </section>
          */}
        </div>
      </ScrollArea>
    </aside>
  )
}
