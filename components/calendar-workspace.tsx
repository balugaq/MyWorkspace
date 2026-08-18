"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  format,
  parse,
  addMonths,
  addWeeks,
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
import { emitRenderDate, type DateMarkerApi, type CalendarDisplayType } from "@/lib/calendar-events"
import { ImageRichInput } from "@/components/image-rich-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

type CalView = "month" | "week" | "day"
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"]

export function CalendarWorkspace() {
  const selectedDate = useWorkspace((s) => s.selectedDate)
  const setSelectedDate = useWorkspace((s) => s.setSelectedDate)
  const calendar = useWorkspace((s) => s.calendar)
  const categories = useWorkspace((s) => s.categories)
  const [view, setView] = useState<CalView>("month")
  const gridRef = useRef<HTMLDivElement>(null)

  // 关系分类中绑定了截止日期的 Todo 节点，按日期分组
  const dueMap = useMemo(() => collectDueNodes(categories), [categories])
  const current = useMemo(() => parse(selectedDate, "yyyy-MM-dd", new Date()), [selectedDate])

  const days = useMemo(() => {
    if (view === "day") return [current]
    const start = view === "month" ? startOfWeek(startOfMonth(current)) : startOfWeek(current)
    const end = view === "month" ? endOfWeek(endOfMonth(current)) : endOfWeek(current)
    return eachDayOfInterval({ start, end })
  }, [current, view])

  // 单元格渲染后，对每个日期块触发 RenderDateEvent（供日历标记脚本订阅）
  useEffect(() => {
    if (view === "day") return // day 视图无网格单元格
    const container = gridRef.current
    if (!container) return
    const displayType: CalendarDisplayType = view === "month" ? "month" : "week"
    // 等一帧确保 DOM 已提交
    const raf = requestAnimationFrame(() => {
      const cells = container.querySelectorAll<HTMLElement>("[data-date]")
      for (const cell of cells) {
        const date = cell.getAttribute("data-date")
        if (!date) continue
        // 每次渲染重建标记容器，避免重复累积
        cell.querySelector("[data-markers]")?.remove()
        emitRenderDate({ displayType, date, element: cell, api: makeMarkerApi(cell) })
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [days, view])

  function shift(dir: 1 | -1) {
    const fn = view === "month" ? addMonths : view === "week" ? addWeeks : addDays
    setSelectedDate(format(fn(current, dir), "yyyy-MM-dd"))
  }

  const title =
    view === "day"
      ? format(current, "yyyy 年 M 月 d 日", { locale: zhCN })
      : format(current, "yyyy 年 M 月", { locale: zhCN })

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col border-b lg:border-b-0 lg:border-r">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <h1 className="font-serif text-lg font-semibold">{title}</h1>
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
          <div className="flex items-center rounded-lg border p-0.5">
            {(["month", "week", "day"] as CalView[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v === "month" ? "月" : v === "week" ? "周" : "日"}
              </button>
            ))}
          </div>
        </div>

        {view === "day" ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="text-center">
              <p className="font-serif text-5xl font-semibold text-primary">{format(current, "d")}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {format(current, "EEEE", { locale: zhCN })}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col p-3">
            <div className="grid grid-cols-7">
              {WEEKDAYS.map((d) => (
                <div key={d} className="pb-2 text-center text-xs font-medium text-muted-foreground">
                  {d}
                </div>
              ))}
            </div>
            <div
              ref={gridRef}
              className={cn(
                "grid flex-1 grid-cols-7 gap-1",
                view === "month" ? "auto-rows-fr" : "",
              )}
            >
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd")
                const data = calendar[key]
                const dueNodes = dueMap[key] ?? []
                const hasContent =
                  !!data && (data.note.trim() !== "" || data.todos.length > 0 || data.events.length > 0)
                const selected = isSameDay(day, current)
                const outside = view === "month" && !isSameMonth(day, current)
                const doneCount = data?.todos.filter((t) => t.done).length ?? 0
                return (
                  <button
                    key={key}
                    type="button"
                    data-date={key}
                    onClick={() => setSelectedDate(key)}
                    className={cn(
                      "flex min-h-16 flex-col items-start gap-1 rounded-lg border p-1.5 text-left transition-colors",
                      selected
                        ? "border-primary bg-accent"
                        : "border-transparent hover:border-border hover:bg-muted/50",
                      outside && "opacity-40",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full text-xs",
                        isToday(day) && "bg-primary font-semibold text-primary-foreground",
                        selected && !isToday(day) && "font-semibold text-primary",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      {hasContent && (
                        <>
                          {data!.note.trim() && <span className="size-1.5 rounded-full bg-primary" />}
                          {data!.todos.length > 0 && (
                            <span className="rounded bg-solution/15 px-1 text-[9px] text-solution">
                              {doneCount}/{data!.todos.length}
                            </span>
                          )}
                          {data!.events.length > 0 && (
                            <span className="rounded bg-chart-3/15 px-1 text-[9px] text-chart-3">
                              {data!.events.length} 事件
                            </span>
                          )}
                        </>
                      )}
                      {dueNodes.length > 0 && (
                        <span className="rounded bg-primary/15 px-1 text-[9px] font-medium text-foreground">
                          {dueNodes.length} 待办截止
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <DayDetail dateKey={format(current, "yyyy-MM-dd")} dueNodes={dueMap[format(current, "yyyy-MM-dd")] ?? []} />
    </div>
  )
}

function DayDetail({ dateKey, dueNodes }: { dateKey: string; dueNodes: DueEntry[] }) {
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

  return (
    <aside className="flex w-full flex-col lg:w-96 lg:shrink-0">
      <div className="border-b px-4 py-3">
        <p className="text-sm font-semibold">{format(dateObj, "M 月 d 日", { locale: zhCN })}</p>
        <p className="text-xs text-muted-foreground">{format(dateObj, "EEEE", { locale: zhCN })}</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-5 p-4">
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

/** 为签名事件构造标记 API：把标记节点追加到日期块（不依赖 React 状态，脚本可直接改 DOM 装饰） */
function makeMarkerApi(cell: HTMLElement): DateMarkerApi {
  function container(): HTMLElement {
    let box = cell.querySelector<HTMLElement>("[data-markers]")
    if (!box) {
      box = document.createElement("span")
      box.dataset.markers = "1"
      box.className = "flex flex-wrap items-center gap-1"
      cell.appendChild(box)
    }
    return box
  }
  return {
    addMarker(kind?: string, text?: string) {
      const el = document.createElement("span")
      el.className =
        "rounded bg-primary/20 px-1 text-[9px] font-medium leading-none text-foreground"
      el.textContent = text ?? kind ?? "●"
      container().appendChild(el)
      return el
    },
    addBulk(kinds) {
      container().innerHTML = ""
      for (const k of kinds) this.addMarker(k)
      void container()
    },
    addText(text) {
      const el = document.createElement("span")
      el.className = "block truncate text-[9px] leading-tight text-foreground"
      el.textContent = text
      container().appendChild(el)
      return el
    },
  }
}
