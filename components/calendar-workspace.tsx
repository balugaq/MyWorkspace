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
import { ChevronLeft, ChevronRight, Plus, Trash2, StickyNote, Clock } from "lucide-react"
import { toast } from "sonner"
import { useWorkspace } from "@/lib/store"
import { collectDueNodes, type DueEntry } from "@/lib/deadlines"
// 日历标记脚本已弃用停用：不再引入 emitRenderDate / DateMarkerApi / CalendarDisplayType。
// import { emitRenderDate, type DateMarkerApi, type CalendarDisplayType } from "@/lib/calendar-events"
import { loadAddressBook, type Person } from "@/lib/address-book"
import { loadPublicYaml } from "@/lib/fetch-data"
import { festivalsForDate, type Festival, type FestivalsFile } from "@/lib/festivals"
import { birthdaysOn } from "@/lib/birthday"
import { lunarTextForSolar } from "@/lib/lunar"
import { dayShortHint } from "@/lib/day-hint"
import { ImageRichInput } from "@/components/image-rich-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"]

/** shortHint 节日名截断：≤4 字全显，>4 字取前 3 字 + 省略号 */
function cutFestivalName(name: string): string {
  return name.length > 4 ? name.slice(0, 3) + "…" : name
}

/** 监听媒体查询：用于判断是否处于桌面端（lg: 1024px+）row 布局，决定分隔条是否可拖拽 */
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
  const selectedDate = useWorkspace((s) => s.selectedDate)
  const setSelectedDate = useWorkspace((s) => s.setSelectedDate)
  const calendar = useWorkspace((s) => s.calendar)
  const categories = useWorkspace((s) => s.categories)
  const calendarDetailWidth = useWorkspace((s) => s.calendarDetailWidth)
  const setCalendarDetailWidth = useWorkspace((s) => s.setCalendarDetailWidth)
  const gridRef = useRef<HTMLDivElement>(null)
  // 翻月方向：+1=下月(内容自下方入)，-1=上月(内容自上方入)。用于方向感知滑入动画。
  const [direction, setDirection] = useState<1 | -1>(1)

  // 日历 / DayDetail 分隔可拖拽：右侧详情面板宽度（px），桌面端允许左右拖动分隔条调整。
  // 实时宽度用本地 state（拖动流畅），松手时写入 store 持久化，刷新后从 store 恢复。
  const [detailWidth, setDetailWidth] = useState<number>(calendarDetailWidth)
  const latestWidthRef = useRef<number>(calendarDetailWidth)
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const isDesktop = useMediaQuery("(min-width: 1024px)")

  // store 持久值变化（如重新水合）时同步到本地，保证刷新后位置生效
  useEffect(() => {
    setDetailWidth(calendarDetailWidth)
    latestWidthRef.current = calendarDetailWidth
  }, [calendarDetailWidth])


  // 自定义数据（节日 + 通讯录），只读加载自 public/*.yml
  const [people, setPeople] = useState<Person[]>([])
  const [festivalDefs, setFestivalDefs] = useState<FestivalsFile["festivals"]>([])
  useEffect(() => {
    let active = true
    Promise.all([loadAddressBook(), loadPublicYaml<FestivalsFile>("custom_festivals.yml")])
      .then(([p, f]) => {
        if (!active) return
        setPeople(p)
        setFestivalDefs(f?.festivals ?? [])
      })
      .catch(() => {
        // fetch-data 内部已触发表单失败事件；此处兜底
      })
    return () => {
      active = false
    }
  }, [])

  // 监听 public 数据加载失败 → 页面顶部 toast（失败可跳过，不阻塞日历）
  useEffect(() => {
    const onErr = (e: Event) => {
      const detail = (e as CustomEvent<{ file?: string }>).detail
      const file = detail?.file
      toast.error(file ? `${file} 加载失败，已跳过` : "自定义数据加载失败，已跳过")
    }
    window.addEventListener("dsh:data-load-error", onErr)
    return () => window.removeEventListener("dsh:data-load-error", onErr)
  }, [])

  // 关系分类中绑定了截止日期的 Todo 节点，按日期分组
  const dueMap = useMemo(() => collectDueNodes(categories), [categories])
  const current = useMemo(() => parse(selectedDate, "yyyy-MM-dd", new Date()), [selectedDate])

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(current))
    const end = endOfWeek(endOfMonth(current))
    return eachDayOfInterval({ start, end })
  }, [current])

  // 单元格渲染后，对每个日期块触发 RenderDateEvent（供日历标记脚本订阅）
  // 日历标记脚本已弃用停用：以下 effect 整体注释，不再触发标记事件、不再构造标记 API。
  // useEffect(() => {
  //   if (view === "day") return // day 视图无网格单元格
  //   const container = gridRef.current
  //   if (!container) return
  //   const displayType: CalendarDisplayType = view === "month" ? "month" : "week"
  //   // 等一帧确保 DOM 已提交
  //   const raf = requestAnimationFrame(() => {
  //     const cells = container.querySelectorAll<HTMLElement>("[data-date]")
  //     for (const cell of cells) {
  //       const date = cell.getAttribute("data-date")
  //       if (!date) continue
  //       // 每次渲染重建标记容器，避免重复累积
  //       cell.querySelector("[data-markers]")?.remove()
  //       emitRenderDate({ displayType, date, element: cell, api: makeMarkerApi(cell) })
  //     }
  //   })
  //   return () => cancelAnimationFrame(raf)
  // }, [days, view])

  function shift(dir: 1 | -1) {
    setDirection(dir)
    setSelectedDate(format(addMonths(current, dir), "yyyy-MM-dd"))
  }

  // 拖动分隔条：根据鼠标 X 调整右侧详情面板宽度（左侧日历 flex-1 自适应），带最小宽度约束
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
      // 松手时把最终宽度持久化到 store（避免拖动过程中每帧写 localStorage）
      setCalendarDetailWidth(latestWidthRef.current)
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    document.body.style.userSelect = "none"
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  // 方向键：←/→ 选中日期 ±1 天，↑/↓ ±7 天。避开输入框聚焦；长按(repeat)持续响应。
  useEffect(() => {
    function isEditable(el: EventTarget | null): boolean {
      return (
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
      )
    }
    function onKey(e: KeyboardEvent) {
      // 仅处理纯方向键；带修饰键(如 Ctrl+↑)不劫持（留给其它快捷键/滚动）
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
      if (isEditable(e.target)) return
      const map: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
      const delta = map[e.key]
      if (delta === undefined) return
      e.preventDefault()
      // 长按(repeat)时连续移动；跨月时由 minMonth key 重建触发动画一次，方向以最终为准
      setSelectedDate(format(addDays(current, delta), "yyyy-MM-dd"))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [current, setSelectedDate])

  const title = format(current, "yyyy 年 M 月", { locale: zhCN })

  const isBackToToday = !isSameMonth(current, new Date())

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
              今天
            </Button>
            <Button variant="outline" size="icon" className="size-8" onClick={() => shift(1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="flex-1" />
          {/* 回到今天按钮（离开当月时出现） */}
          {isBackToToday && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedDate(format(new Date(), "yyyy-MM-dd"))}
            >
              回到今天
            </Button>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col p-3">
          <div className="grid grid-cols-7 pb-1">
            {WEEKDAYS.map((d, i) => (
              <div
                key={d}
                className={cn(
                  "text-center text-[15px] font-semibold",
                  i === 0 || i === 6 ? "text-red-400" : "text-muted-foreground"
                )}
              >
                {d}
              </div>
            ))}
          </div>
          <div
            ref={gridRef}
            key={format(current, "yyyy-MM")}
            className={cn(
              "grid flex-1 auto-rows-fr grid-cols-7 gap-px border-y border-border bg-border/40",
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
              // 节日 + 生日
              const festivals = festivalsForDate(festivalDefs, day.getFullYear(), day.getMonth() + 1, day.getDate())
              const bdays = birthdaysOn(people, day.getFullYear(), day.getMonth() + 1, day.getDate())
              const hasHoliday = festivals.some((f) => f.holiday)
              const hasWorkday = festivals.some((f) => f.workday)
              const hasBirthday = bdays.length > 0
              const shortHint = dayShortHint(day)

              // 日期数字颜色优先级：today > hasBirthday > festival > hasHoliday > hasWorkday > outside > isWeekend
              // selected 不影响文字/颜色，仅以背景 bg-primary/15 标识选中
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

              // shortHint 颜色/内容优先级：today > festival > hasBirthday > hasHoliday > hasWorkday > outside > isWeekend
              // selected 不影响文字/颜色，仅以背景标识选中
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

              // 角标：假/班取一（不会同现）+ 生日蛋糕
              const mwBadge: ReactNode =
                hasHoliday ? (
                  <span
                    className="rounded px-0.5 text-center text-[10px] font-bold leading-3.5"
                    style={{ backgroundColor: "#ff9800", color: "#e74c3c" }}
                  >
                    假
                  </span>
                ) : hasWorkday ? (
                  <span
                    className="rounded px-0.5 text-center text-[10px] font-bold leading-3.5"
                    style={{ backgroundColor: "#3498db", color: "#fff" }}
                  >
                    班
                  </span>
                ) : null
              const cakeBadge: ReactNode = hasBirthday ? (
                <span className="text-center text-[13px] leading-none">🎂</span>
              ) : null
              // 定位规则：单个→日期数字右上角；🎂+(假/班)两个→🎂左上、假/班右上
              const corner = (() => {
                // 偏移基于「日期数字锚点」；负值越大越外探。锚点已等比例放大以容纳更多外探空间。
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
                <button
                  key={key}
                  type="button"
                  data-date={key}
                  onClick={() => setSelectedDate(key)}
                  className={cn(
                    "relative flex min-h-16 flex-col items-center justify-center rounded-lg px-1 py-1 text-center transition-colors outline-none",
                    selected ? "bg-primary/15" : "hover:bg-muted/60",
                    outside && "opacity-40"
                  )}
                >
                  {/* 顶部中间：笔记圆点 */}
                  {hasNote && <span className="absolute left-1/2 top-0.5 size-1 -translate-x-1/2 rounded-full bg-primary" />}
                  {/* 日期数字容器：角标基于日期数字定位。锚点占位等比例放大，角标可在此范围内更外探，日期数字仍居中。 */}
                  <span className="relative inline-flex items-center justify-center">
                    <span
                      className={cn(
                        "inline-flex h-7 w-8 items-center justify-center rounded-full text-base",
                        isToday(day) ? "font-bold" : "font-medium",
                        dateNumClass
                      )}
                      style={dateNumStyle}
                    >
                      {format(day, "d")}
                    </span>
                    {corner}
                  </span>
                  {/* 日期外显短提示：按优先级 today > festival > 生日 > 假日 > 班日 > 跨月 > 周末 着色（festival 显示首节日名+多节日数角标）；selected 仅以背景标识 */}
                  <span className="relative max-w-full text-center text-xs leading-3.5">
                    <span
                      className={shortHintClass}
                      style={shortHintColor ? { color: shortHintColor } : undefined}
                    >
                      {shortHintText}
                    </span>
                  </span>
                  {/* 待办截止小徽标（沿用原逻辑） */}
                  {dueNodes.length > 0 && (
                    <span className="absolute bottom-0 right-0 mr-0.5 mb-0.5 rounded bg-primary/20 px-0.5 text-center text-[10px] font-semibold text-primary">
                      {dueNodes.length}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* 可拖拽分隔条：桌面端左右拖动以调整日历 / 详情面板宽度 */}
      <div
        onMouseDown={startResize}
        role="separator"
        aria-orientation="vertical"
        aria-label="调整日历与详情宽度"
        className="hidden w-1.5 shrink-0 cursor-col-resize items-stretch bg-border/40 transition-colors hover:bg-primary/50 lg:flex"
      >
        <div className="mx-auto my-auto h-10 w-0.5 rounded-full bg-border" />
      </div>

      <DayDetail
        dateKey={format(current, "yyyy-MM-dd")}
        dueNodes={dueMap[format(current, "yyyy-MM-dd")] ?? []}
        people={people}
        festivals={festivalsForDate(festivalDefs, current.getFullYear(), current.getMonth() + 1, current.getDate())}
        style={isDesktop ? { width: detailWidth } : undefined}
      />
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
  const calendar = useWorkspace((s) => s.calendar)
  const setDayNote = useWorkspace((s) => s.setDayNote)
  const addCalendarTodo = useWorkspace((s) => s.addCalendarTodo)
  const toggleCalendarTodo = useWorkspace((s) => s.toggleCalendarTodo)
  const removeCalendarTodo = useWorkspace((s) => s.removeCalendarTodo)
  const addCalendarEvent = useWorkspace((s) => s.addCalendarEvent)
  const removeCalendarEvent = useWorkspace((s) => s.removeCalendarEvent)
  const setActiveCategory = useWorkspace((s) => s.setActiveCategory)
  const setActiveItem = useWorkspace((s) => s.setActiveItem)

  const day = calendar[dateKey] ?? { note: "", todos: [], events: [] }
  const [todoInput, setTodoInput] = useState("")
  const [eventTime, setEventTime] = useState("")
  const [eventContent, setEventContent] = useState("")

  const dateObj = parse(dateKey, "yyyy-MM-dd", new Date())
  // 当天过生日的人 + 农历日期文本
  const bdays = birthdaysOn(people, dateObj.getFullYear(), dateObj.getMonth() + 1, dateObj.getDate())
  const lunarText = lunarTextForSolar(dateObj)

  return (
    <aside className="flex w-full flex-col lg:w-auto lg:shrink-0" style={style}>
      <div className="border-b px-4 py-3">
        <p className="text-base font-semibold">{format(dateObj, "M 月 d 日", { locale: zhCN })}</p>
        <p className="text-[14px] text-muted-foreground">{format(dateObj, "EEEE", { locale: zhCN })}</p>
        <p className="mt-0.5 text-[14px] text-muted-foreground/70">{lunarText}</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-5 p-4">
          {bdays.length > 0 && (
            <>
              <section className="flex flex-col gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  🎂 今日生日
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
                  🎉 今日节日
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
                          假
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
              今日笔记
            </h3>
            <ImageRichInput
              value={day.note}
              onChange={(v) => setDayNote(dateKey, v)}
              placeholder="记录今天的想法、总结…（可 Ctrl+V 粘贴图片）"
              minHeight="min-h-24"
            />
          </section>

          <Separator />

          {dueNodes.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-muted-foreground">截止任务（思维图）</h3>
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

          <Separator />

          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-medium text-muted-foreground">待办事项</h3>
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
              {day.todos.length === 0 && <p className="px-1 text-xs text-muted-foreground">暂无待办</p>}
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
                placeholder="添加待办…"
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
              事件安排
            </h3>
            <ul className="flex flex-col gap-1">
              {day.events.map((ev) => (
                <li key={ev.id} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
                  <span className="w-14 shrink-0 font-mono text-xs text-primary">{ev.time || "全天"}</span>
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
              {day.events.length === 0 && <p className="px-1 text-xs text-muted-foreground">暂无事件</p>}
            </ul>
            <div className="flex gap-2">
              <Input
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
                placeholder="时间"
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
                placeholder="事件内容…"
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
                    toast.success("已添加事件")
                  }
                }}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </section>
        </div>
      </ScrollArea>
    </aside>
  )
}

/**
 * 为签名事件构造标记 API（已弃用 / 注释停用）。
 * 原实现：把标记节点追加到日期块（不依赖 React 状态，脚本可直接改 DOM 装饰）。
 * 因日历标记脚本整体停用而注释；保留以备将来恢复。
 */
// function makeMarkerApi(cell: HTMLElement): DateMarkerApi {
//   function container(): HTMLElement {
//     let box = cell.querySelector<HTMLElement>("[data-markers]")
//     if (!box) {
//       box = document.createElement("span")
//       box.dataset.markers = "1"
//       box.className = "flex flex-wrap items-center gap-1"
//       cell.appendChild(box)
//     }
//     return box
//   }
//   return {
//     addMarker(kind?: string, text?: string) {
//       const el = document.createElement("span")
//       el.className =
//         "rounded bg-primary/20 px-1 text-[9px] font-medium leading-none text-foreground"
//       el.textContent = text ?? kind ?? "●"
//       container().appendChild(el)
//       return el
//     },
//     addBulk(kinds) {
//       container().innerHTML = ""
//       for (const k of kinds) this.addMarker(k)
//       void container()
//     },
//     addText(text) {
//       const el = document.createElement("span")
//       el.className = "block truncate text-[9px] leading-tight text-foreground"
//       el.textContent = text
//       container().appendChild(el)
//       return el
//     },
//   }
// }
