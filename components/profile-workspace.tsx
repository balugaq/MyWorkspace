"use client"

import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { toast } from "sonner"
import { format } from "date-fns"
import { CalendarCheck, User, Feather, RefreshCw, ScanLine, Timer, Clock, Sparkles } from "lucide-react"
import { useWorkspace } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { WeatherWidget } from "@/components/weather-widget"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  aggregateByDay,
  buildHeatmapGrid,
  buildMonthLabels,
  contributionLevel,
  firstContributionAt,
  formatUsageDuration,
  parseDayStartOffset,
  todayKey,
} from "@/lib/contributions"
import { type ContributionType, type ProfileWidgetId } from "@/lib/types"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { NativeScrollArea } from "@/components/ui/native-scroll-area"

// GitHub 风格贡献热力图：53 周 × 7 天，数据来自 store 的真实「贡献账本」
// （lib/contributions.ts 纯逻辑 + lib/store.ts 记账）。
// 颜色按「当日 amount 之和」走 0 / (0,1] / (1,3] / (3,6] / >6 共 5 级；
// 读取时按 settings.dayStartOffset 现算所属日（改翻篇时间历史会重新分桶）。
const WEEKS = 53
const LEVEL_COLORS = [
  "rgba(128,128,128,0.18)", // 0 级：无贡献
  "#0e4429",
  "#006d32",
  "#26a641",
  "#39d353",
]

// 贡献类型 → 徽章文案 / 配色（贡献详情列表用）
const CONTRIB_TYPE_META: Record<ContributionType, { label: string; badge: string }> = {
  "mindmap-node-created": { label: "新建节点", badge: "text-blue-400 bg-blue-400/10" },
  "mindmap-node-done": { label: "完成节点", badge: "text-green-500 bg-green-500/10" },
  "check-in": { label: "签到", badge: "text-primary bg-primary/10" },
  "focus": { label: "专注", badge: "text-amber-400 bg-amber-400/10" },
  "github-commit": { label: "GitHub 提交", badge: "text-sky-400 bg-sky-400/10" },
  "github-issue": { label: "GitHub Issue", badge: "text-orange-400 bg-orange-400/10" },
  "github-pr": { label: "GitHub PR", badge: "text-emerald-400 bg-emerald-400/10" },
}

const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""]

// TODO 52：各小组件外壳宽度——专注钟定宽（保证按钮排布），其余内容自适应、不撑满整行
const WIDGET_WRAP_CLASS: Record<ProfileWidgetId, string> = {
  weather: "w-fit max-w-xs",
  date: "w-fit",
  usage: "w-fit",
  focus: "w-64",
}

// TODO 39 日期牌（参考主人提供的日历牌图）：公历月中文 + 大小月，传统纸质日历牌写法
const CN_MONTHS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"]

// 公历月大小：31 天「大」、30 天「小」、2 月一律「平」（平闰同写，日历牌口径）
function solarMonthSize(year: number, month: number): string {
  if (month === 2) return "平"
  return new Date(year, month, 0).getDate() === 31 ? "大" : "小"
}

// 贡献值展示：四舍五入取整（todo.md 口径）。
// amount < 0.5 的日子（例如当天只新建 1 个节点 = 0.2）会显示 0 —— 主人明确要求照实显示，不做修饰。
function formatAmount(n: number): string {
  return String(Math.round(n))
}

// 贡献详情列表用：整数保留整数，小数显示 1 位（如 2 → "2"，0.2 → "0.2"）
function formatContribAmount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

// 每日诗歌：数据源接口（无「出处/集」字段，出处用 author.name + title 拼）
const POEM_API = "https://poetry.palemoky.com/api/poems/random"

interface PoemPayload {
  data: {
    title: string
    content: string[]
    author: { name: string }
    dynasty: { name: string }
    type: { name: string }
  }
  lang: string
}

interface PoemCache {
  line: string
  author: string
  title: string
  date: string
}

// 诗词缓存用的「今天」（纯日历日，不含贡献账本的 offset 语义）
function poemDateKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

// 从 content 数组随机抽一句：先过滤空串；若都空则回退 content[0]
function pickLine(content: string[]): string {
  const nonEmpty = content.filter((c) => c.trim().length > 0)
  const pool = nonEmpty.length > 0 ? nonEmpty : content
  if (pool.length === 0) return ""
  return pool[Math.floor(Math.random() * pool.length)]
}

// 请求一首诗并解析；非 200 / 解析失败 / 网络错误都会抛错（由调用方处理兜底）
async function fetchPoem(): Promise<{ line: string; author: string; title: string }> {
  const res = await fetch(POEM_API, { cache: "no-store" })
  if (!res.ok) throw new Error(`poem http ${res.status}`)
  const payload = (await res.json()) as PoemPayload
  const data = payload?.data
  if (!data) throw new Error("poem payload missing data")
  return {
    line: pickLine(data.content ?? []),
    author: data.author?.name ?? "",
    title: data.title ?? "",
  }
}

function writePoemCache(value: PoemCache): void {
  try {
    localStorage.setItem(`mw:poem:${value.date}`, JSON.stringify(value))
  } catch {
    // 隐私模式 / 配额超限：忽略写入失败，不影响展示
  }
}

function readPoemCache(): PoemCache | null {
  try {
    const raw = localStorage.getItem(`mw:poem:${poemDateKey()}`)
    if (!raw) return null
    return JSON.parse(raw) as PoemCache
  } catch {
    return null
  }
}

export function ProfileWorkspace() {
  const settings = useWorkspace((s) => s.settings)

  // 贡献账本 → 热力图：账本存「发生时间 at」，读取时按当前 settings.dayStartOffset 现算所属日
  const contributions = useWorkspace((s) => s.contributions)
  const scanLegacyContributions = useWorkspace((s) => s.scanLegacyContributions)
  const offsetMinutes = parseDayStartOffset(settings.dayStartOffset)
  const checkIn = useWorkspace((s) => s.checkIn)
  const today = todayKey(offsetMinutes)
  const signedToday = contributions.some((c) => c.id === `check-in:${today}`)
  const grid = useMemo(() => buildHeatmapGrid(today, WEEKS), [today])
  const monthLabels = useMemo(() => buildMonthLabels(grid), [grid])
  const byDay = useMemo(
    () => aggregateByDay(contributions, offsetMinutes),
    [contributions, offsetMinutes],
  )

  // 贡献详情列表：按 at 倒序（新在前），初始展示 5 条，可「展开更多」递进 5 条
  const [visible, setVisible] = useState(5)
  const sorted = useMemo(
    () => [...contributions].sort((a, b) => b.at - a.at),
    [contributions],
  )

  // ---- 专注钟（TODO 10）----
  // 本地计时状态 + 刷新恢复（localStorage 键 mw:focus-timer）。
  // persisted: { mode, running, startedAt, accumulatedPausedMs, durationMs?, seconds? }
  const addFocusContribution = useWorkspace((s) => s.addFocusContribution)
  const FOCUS_KEY = "mw:focus-timer"
  type FocusPersist = {
    mode: "up" | "down"
    running: boolean
    startedAt: number
    accumulatedPausedMs: number
    durationMs?: number
    seconds?: number
  }
  const loadFocus = (): FocusPersist | null => {
    if (typeof window === "undefined") return null
    try {
      const raw = localStorage.getItem(FOCUS_KEY)
      if (!raw) return null
      return JSON.parse(raw) as FocusPersist
    } catch {
      return null
    }
  }
  const [initialFocus] = useState(loadFocus)
  const [focusMode, setFocusMode] = useState<"up" | "down">(initialFocus?.mode ?? "up")
  const [durationMin, setDurationMin] = useState(
    initialFocus?.mode === "down" && typeof initialFocus.durationMs === "number"
      ? Math.max(1, Math.round(initialFocus.durationMs / 60_000))
      : 25,
  )
  const [running, setRunning] = useState(initialFocus?.running ?? false)
  const [startTs, setStartTs] = useState<number | null>(initialFocus?.startedAt ?? null)
  const [accumulatedPausedMs, setAccumulatedPausedMs] = useState(initialFocus?.accumulatedPausedMs ?? 0)
  const [focusSeconds, setFocusSeconds] = useState(initialFocus?.seconds ?? 0)
  const [focusHint, setFocusHint] = useState("")
  // 结束弹窗（TODO 10 细化）：≥10 分钟时填 content 后再入账
  const [focusDialogOpen, setFocusDialogOpen] = useState(false)
  const [pendingFocusMinutes, setPendingFocusMinutes] = useState(0)
  const [focusContentInput, setFocusContentInput] = useState("")
  // 暂停起点（仅内存，不持久化）；重载后若处于暂停态，挂载时记为「此刻」以便继续时把刷新间隙计入暂停
  const pauseStartRef = useRef<number | null>(
    initialFocus && !initialFocus.running && initialFocus.startedAt != null ? Date.now() : null,
  )

  // TODO 53：控制按钮状态切换动画——旧按钮缓慢下移出，新按钮自下向上浮出。
  // running 变化时先让当前按钮组播退场动画（leaving），500ms 后切换到新按钮组并以进场动画浮现。
  const [shownRunning, setShownRunning] = useState(initialFocus?.running ?? false)
  const [leaving, setLeaving] = useState(false)
  const prevRunningRef = useRef(running)
  useEffect(() => {
    if (prevRunningRef.current === running) return
    prevRunningRef.current = running
    setLeaving(true)
    const t = window.setTimeout(() => {
      setShownRunning(running)
      setLeaving(false)
    }, 500)
    return () => window.clearTimeout(t)
  }, [running])

  const endFocus = useCallback(() => {
    if (startTs == null) return
    const elapsedMs = Date.now() - startTs - accumulatedPausedMs
    const totalSec = Math.max(0, Math.floor(elapsedMs / 1000))
    const minutes = totalSec / 60
    const amount = Math.floor(minutes / 10)
    // 结束即停表（两条路径都先清空计时状态；持久化 effect 会因 startTs 置空移除 localStorage 键）
    setRunning(false)
    setStartTs(null)
    setAccumulatedPausedMs(0)
    setFocusSeconds(0)
    pauseStartRef.current = null
    if (amount < 1) {
      // 不足 10 分钟：不弹窗、不入账，仅提示
      setFocusHint("专注不足 10 分钟，不计入贡献")
      return
    }
    // ≥10 分钟：弹窗让用户填写 content，确认/取消后才入账（各写一次）
    setPendingFocusMinutes(minutes)
    setFocusContentInput(`专注 ${Math.round(minutes)} 分钟`)
    setFocusDialogOpen(true)
  }, [startTs, accumulatedPausedMs])

  const endFocusRef = useRef(endFocus)
  useEffect(() => {
    endFocusRef.current = endFocus
  }, [endFocus])

  // tick：计时中每秒刷新显示；倒计时归零自动结束并记账
  useEffect(() => {
    if (!running || startTs == null) return
    const compute = () => {
      const elapsedMs = Date.now() - startTs - accumulatedPausedMs
      if (focusMode === "up") {
        const s = Math.max(0, Math.floor(elapsedMs / 1000))
        setFocusSeconds(s)
        return s
      }
      const remain = Math.max(0, Math.floor((durationMin * 60_000 - elapsedMs) / 1000))
      setFocusSeconds(remain)
      if (remain <= 0) endFocusRef.current()
      return remain
    }
    compute()
    const iv = setInterval(compute, 1000)
    return () => clearInterval(iv)
  }, [running, startTs, accumulatedPausedMs, focusMode, durationMin])

  // 持久化进行中的计时（结束/清空时 startTs 置空 → 移除键）
  useEffect(() => {
    if (typeof window === "undefined") return
    if (startTs == null) {
      localStorage.removeItem(FOCUS_KEY)
      return
    }
    const persist: FocusPersist = {
      mode: focusMode,
      running,
      startedAt: startTs,
      accumulatedPausedMs,
      durationMs: focusMode === "down" ? durationMin * 60_000 : undefined,
      seconds: focusSeconds,
    }
    localStorage.setItem(FOCUS_KEY, JSON.stringify(persist))
  }, [focusMode, running, startTs, accumulatedPausedMs, durationMin, focusSeconds])

  const startOrResumeFocus = () => {
    setFocusHint("")
    if (startTs == null) {
      setStartTs(Date.now())
      setAccumulatedPausedMs(0)
      setFocusSeconds(focusMode === "down" ? durationMin * 60 : 0)
    } else if (pauseStartRef.current != null) {
      const paused = Date.now() - pauseStartRef.current
      pauseStartRef.current = null
      setAccumulatedPausedMs((a) => a + paused)
    }
    setRunning(true)
  }

  const pauseFocus = () => {
    if (startTs == null) return
    pauseStartRef.current = Date.now()
    setRunning(false)
  }

  const switchFocusMode = (m: "up" | "down") => {
    if (running || startTs != null) return
    setFocusMode(m)
    setFocusSeconds(m === "down" ? durationMin * 60 : 0)
    setFocusHint("")
  }

  // 结束弹窗：确认 → 用用户填写的 content 入账；取消 → 不传 content，用默认自动文案入账（保证已得贡献不丢失）。两条路径都只写一次。
  const handleFocusConfirm = useCallback(() => {
    const written = addFocusContribution(pendingFocusMinutes, focusContentInput)
    if (written >= 1) toast.success(`专注完成，+${written} 贡献`)
    setFocusDialogOpen(false)
    setPendingFocusMinutes(0)
    setFocusContentInput("")
  }, [addFocusContribution, pendingFocusMinutes, focusContentInput])

  const handleFocusCancel = useCallback(() => {
    const written = addFocusContribution(pendingFocusMinutes)
    if (written >= 1) toast.success(`专注完成，+${written} 贡献`)
    setFocusDialogOpen(false)
    setPendingFocusMinutes(0)
    setFocusContentInput("")
  }, [addFocusContribution, pendingFocusMinutes])

  // 外部关闭(点遮罩 / 按 Esc)不应静默丢弃已得贡献：统一走「取消」语义(用默认自动文案入账)。
  // 点遮罩由 Dialog 的 disablePointerDismissal 直接拦截;这里兜底 Esc 等外部 reason。
  const handleFocusDialogOpenChange = useCallback(
    (open: boolean, details?: { reason?: string }) => {
      const reason = details?.reason
      if (!open && (reason === "escape-key" || reason === "outside-press")) {
        handleFocusCancel()
        return
      }
      setFocusDialogOpen(open)
    },
    [handleFocusCancel],
  )

  const focusMm = String(Math.floor(focusSeconds / 60)).padStart(2, "0")
  const focusSs = String(focusSeconds % 60).padStart(2, "0")

  // 日期 / 星期：实时计算（非占位）
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const weekday = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][now.getDay()]

  // TODO 39：「问 AI 今日待办」——引导 AI 综合各只读技能可访问的本地数据，汇总今日待办清单。
  // 走 store.askAiAbout 链路：新建会话 → 切到 AI 对话 → 自动发送。
  const askAiAbout = useWorkspace((s) => s.askAiAbout)
  const askAiToday = () => {
    const prompt =
      `今天是 ${now.getFullYear()} 年 ${month} 月 ${day} 日（${weekday}）。请综合你可访问的本地数据，给我一份今日待办清单：` +
      `用 wb_get_mindmap_graph 查思维图节点与截止/长期任务，` +
      `用 wb_get_day_calendar_data 与 wb_get_day_note 查今天的日程和笔记（必要时用 wb_get_dates_with_notes 回看近期），` +
      `用 wb_get_github_queue 查 GitHub 队列，用 wb_get_recent_notifications 查最近通知，` +
      `用 wb_get_categories 查分类概览。` +
      `请按优先级排序输出，每项标注依据来源（思维图/日历/队列/通知等）；数据中没有支撑的建议项请单独列出并说明。`
    askAiAbout(prompt)
  }

  // 软件使用时长：从首个贡献到现在的日历差值（实时刷新，每 30s 重算）。
  // 纯派生值：只依赖 contributions，不落存储字段，因此导入/导出备份时不会随数据流动，
  // 天然避免把别的设备/安装的时间线带进来污染本机数据。
  const [usageNow, setUsageNow] = useState(() => Date.now())
  useEffect(() => {
    const iv = setInterval(() => setUsageNow(Date.now()), 30_000)
    return () => clearInterval(iv)
  }, [])
  const firstAt = useMemo(() => firstContributionAt(contributions), [contributions])
  const usageMs = firstAt == null ? null : usageNow - firstAt
  const usageText = usageMs == null ? null : formatUsageDuration(usageMs, usageNow)

  // 所在地区：仅展示（编辑入口统一收口到「设置 → 账户与同步」）；未设置时默认展示「中国」
  const displayLocation = settings.location.trim() || "中国"

  // 用户名：同款双击编辑（不可留空，空则回退上一值）；未设置时默认展示「未命名用户」
  const updateSettings = useWorkspace((s) => s.updateSettings)

  // TODO 52：Profile 小组件顺序（settings.profileWidgetOrder 持久化）+ 拖拽调序
  const widgetOrder = settings.profileWidgetOrder
  const moveWidget = useCallback(
    (from: number, to: number) => {
      const order = [...widgetOrder]
      const [moved] = order.splice(from, 1)
      if (!moved) return
      order.splice(to, 0, moved)
      updateSettings({ profileWidgetOrder: order })
    },
    [widgetOrder, updateSettings],
  )
  const storedName = useWorkspace((s) => s.settings.userName)
  const [nameEditing, setNameEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState("")
  const displayName = storedName.trim() || "未命名用户"

  const startNameEdit = () => {
    setNameDraft(displayName)
    setNameEditing(true)
  }
  const commitNameEdit = () => {
    const next = nameDraft.trim()
    if (!next) {
      toast.error("用户名不能为空")
      setNameEditing(false)
      return
    }
    updateSettings({ userName: next })
    setNameEditing(false)
  }
  const cancelNameEdit = () => setNameEditing(false)

  // 每日诗歌（接真实 API：每天按日期缓存一次，跨天再换）
  const [poemLine, setPoemLine] = useState("")
  const [poemAuthor, setPoemAuthor] = useState("")
  const [poemTitle, setPoemTitle] = useState("")
  const [poemVisible, setPoemVisible] = useState(true)
  const [poemLoading, setPoemLoading] = useState(true)
  const [poemRefreshing, setPoemRefreshing] = useState(false)

  useEffect(() => {
    let cancelled = false
    const cached = readPoemCache()
    // 命中当日缓存：直接展示，不重复请求、不跳变
    if (cached && cached.date === poemDateKey()) {
      setPoemLine(cached.line)
      setPoemAuthor(cached.author)
      setPoemTitle(cached.title)
      setPoemLoading(false)
      return
    }
    fetchPoem()
      .then((p) => {
        if (cancelled) return
        const date = poemDateKey()
        writePoemCache({ line: p.line, author: p.author, title: p.title, date })
        setPoemLine(p.line)
        setPoemAuthor(p.author)
        setPoemTitle(p.title)
        setPoemLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        // 初始/挂载 fetch 失败（网络/非 200/CORS）：整块隐藏
        setPoemVisible(false)
        setPoemLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const refreshPoem = () => {
    if (poemRefreshing) return
    setPoemRefreshing(true)
    fetchPoem()
      .then((p) => {
        const date = poemDateKey()
        writePoemCache({ line: p.line, author: p.author, title: p.title, date })
        setPoemLine(p.line)
        setPoemAuthor(p.author)
        setPoemTitle(p.title)
      })
      .catch(() => {
        // 手动刷新失败：保留当前诗句 + toast 提示，不隐藏整块
        toast.error("诗词刷新失败，请稍后再试")
      })
      .finally(() => {
        setPoemRefreshing(false)
      })
  }

  // ─────────────────────────────────────────────────────────────
  // 临时功能：存量贡献「补算历史」（幂等）。
  // 主人用完会要求删除 —— 摘除时删掉本 handleScan + 热力图卡片头部的「补算历史」按钮即可。
  const handleScan = () => {
    const added = scanLegacyContributions()
    if (added > 0) toast.success(`已补算 ${added} 条历史贡献`)
    else toast.info("没有需要补算的历史贡献")
  }
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* 顶栏：固定左上角 title（350×80） */}
      <header className="flex items-center px-8 py-6">
        <h1 className="text-2xl font-bold leading-tight text-foreground">Profile Dashboard</h1>
      </header>

      {/* 主体双栏：用 ScrollArea 滚动（细滚动条，与 sidebar 风格一致） */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid grid-cols-1 gap-6 px-8 pb-4 lg:grid-cols-[auto_1fr]">
        {/* 左栏：头像 + 昵称/地区 + 签到 */}
        <div className="flex flex-col gap-4">
          {/* 用户头像 256×256 圆角 */}
          <div className="size-64 overflow-hidden rounded-2xl border border-border bg-card">
            {settings.aiUserAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.aiUserAvatar}
                alt="用户头像"
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-muted text-muted-foreground">
                <User className="size-20" />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            {/* 用户名：双击编辑（不可留空，空则回退上一值） */}
            {nameEditing ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitNameEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    commitNameEdit()
                  } else if (e.key === "Escape") {
                    e.preventDefault()
                    cancelNameEdit()
                  }
                }}
                placeholder="用户名"
                className="w-40 rounded border border-border bg-background px-1 text-lg font-semibold text-foreground outline-none focus:border-primary"
              />
            ) : (
              <span
                title="双击编辑用户名"
                onDoubleClick={startNameEdit}
                className="w-fit cursor-text text-lg font-semibold text-foreground hover:opacity-80"
              >
                {displayName}
              </span>
            )}

            {/* 所在地区：仅展示，编辑入口在「设置 → 账户与同步」 */}
            <span className="flex w-fit items-center gap-1 text-sm text-muted-foreground">
              <span aria-hidden>📍</span>
              {displayLocation}
            </span>
          </div>

          {/* 签到功能：点击 toast 成功 + 写 check-in 贡献（进热力图）+ 当天禁用 / 暗色图层仅覆盖按钮 */}
          <div className="w-64 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <CalendarCheck className="size-4 text-primary" />
              每日签到
            </div>
            <p className="mt-1 text-xs text-muted-foreground">坚持就是胜利，保持活跃。</p>
            <div className="relative mt-3 w-full">
              <Button
                className="w-full"
                disabled={signedToday}
                onClick={() => {
                  checkIn()
                  toast.success("签到成功")
                }}
              >
                {signedToday ? "√ 已签到" : "签到"}
              </Button>
              {signedToday && (
                <div className="pointer-events-none absolute inset-0 rounded-md bg-black/40" />
              )}
            </div>
          </div>
        </div>

        {/* 右栏：天气 + 日期（上）；贡献图（下） */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* TODO 52：小组件区改为 flex-wrap 内容自适应宽度（不再两列等宽铺满），
              支持拖拽调序（顺序持久化 settings.profileWidgetOrder，拖法与 sidebar 分类一致） */}
          <div className="flex flex-wrap items-start gap-4">
            {widgetOrder.map((id, i) => (
              <div
                key={id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", id)
                  e.dataTransfer.effectAllowed = "move"
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const dragId = e.dataTransfer.getData("text/plain")
                  if (!dragId) return
                  const from = widgetOrder.indexOf(dragId as ProfileWidgetId)
                  if (from === -1) return
                  // 落点在目标卡左半 → 插到它前面；右半 → 插到它后面
                  const rect = e.currentTarget.getBoundingClientRect()
                  const before = e.clientX < rect.left + rect.width / 2
                  const to = before ? i : i + 1
                  if (to !== from && to !== from + 1) moveWidget(from, to)
                }}
                className={`cursor-grab active:cursor-grabbing ${WIDGET_WRAP_CLASS[id]}`}
              >
            {id === "weather" && (
            <WeatherWidget />
            )}

            {id === "date" && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex h-[92px] items-center justify-center gap-4 rounded-lg bg-[#f2f0e8] px-4 dark:bg-[#0b0d0b]">
                <span className="text-xs font-medium text-[#55714e] [writing-mode:vertical-rl] dark:text-[#8fae8b]">
                  {CN_MONTHS[month]}月{solarMonthSize(now.getFullYear(), month)}
                </span>
                <span className="text-[56px] font-bold leading-none tabular-nums text-[#55714e] dark:text-[#8fae8b]">
                  {String(day).padStart(2, "0")}
                </span>
                <span className="text-xs font-medium text-[#55714e] [writing-mode:vertical-rl] dark:text-[#8fae8b]">
                  {weekday}
                </span>
              </div>
              {/* AI 入口（TODO 39）：替换原「今日暂无待办事项」死文案 */}
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-fit gap-1.5"
                onClick={askAiToday}
              >
                <Sparkles className="size-3.5" />
                问 AI 今日待办
              </Button>
            </div>
            )}

            {id === "usage" && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Clock className="size-4 text-sky-400" />
                软件使用时长
              </div>
              {usageText ? (
                <>
                  <div className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                    {usageText}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    自 {format(new Date(firstAt!), "yyyy-MM-dd")} 首次贡献起
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">暂无贡献记录</p>
              )}
            </div>
            )}

            {/* 专注钟（TODO 10） */}
            {id === "focus" && (
            <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Timer className="size-4 text-amber-400" />
              ⏱ 专注钟
            </div>

            {/* 模式切换（分段） */}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => switchFocusMode("up")}
                className={`rounded-md border px-3 py-1 text-xs ${
                  focusMode === "up"
                    ? "border-amber-400/40 bg-amber-400/10 text-amber-400"
                    : "border-border text-muted-foreground"
                }`}
              >
                正计时
              </button>
              <button
                type="button"
                onClick={() => switchFocusMode("down")}
                className={`rounded-md border px-3 py-1 text-xs ${
                  focusMode === "down"
                    ? "border-amber-400/40 bg-amber-400/10 text-amber-400"
                    : "border-border text-muted-foreground"
                }`}
              >
                倒计时
              </button>
            </div>

            {/* 倒计时专注时长输入（仅倒计时模式可编辑） */}
            {focusMode === "down" && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span>专注时长</span>
                <input
                  type="number"
                  min={1}
                  value={durationMin}
                  disabled={running}
                  onChange={(e) => {
                    const v = Math.max(1, Math.floor(Number(e.target.value) || 1))
                    setDurationMin(v)
                    if (!running && startTs == null) setFocusSeconds(v * 60)
                  }}
                  className="w-16 rounded-md border border-border bg-background px-2 py-1 text-foreground"
                />
                <span>分钟</span>
              </div>
            )}

            {/* 计时显示 MM:SS */}
            <div className="mt-3 text-center text-3xl font-semibold tabular-nums text-foreground">
              {focusMm}:{focusSs}
            </div>

            {/* 提示文案 */}
            {focusHint && (
              <p className="mt-2 text-center text-xs text-muted-foreground">{focusHint}</p>
            )}

            {/* 控制按钮（TODO 53：状态切换时旧按钮缓慢下移出，新按钮自下向上浮出） */}
            <div className="relative mt-3">
              <div
                key={leaving ? "out" : `in-${shownRunning}`}
                className={`flex gap-2 ${
                  leaving
                    ? "pointer-events-none animate-out fade-out slide-out-to-bottom-4 fill-mode-forwards duration-500"
                    : "animate-in fade-in slide-in-from-bottom-4 duration-500"
                }`}
              >
                {shownRunning ? (
                  <>
                    <Button className="flex-1" variant="outline" onClick={pauseFocus}>
                      暂停
                    </Button>
                    <Button className="flex-1" variant="outline" onClick={endFocus}>
                      结束
                    </Button>
                  </>
                ) : (
                  <Button className="w-full" onClick={startOrResumeFocus}>
                    {startTs == null ? "开始" : "继续"}
                  </Button>
                )}
              </div>
            </div>

            {/* 结束弹窗：≥10 分钟时填写 content 后入账。showCloseButton=false 去掉右上角 X；disablePointerDismissal 禁点遮罩关闭；Esc 由 onOpenChange 拦截走「取消」语义入账，三路均不丢贡献 */}
            <Dialog open={focusDialogOpen} onOpenChange={handleFocusDialogOpenChange} disablePointerDismissal>
              <DialogContent showCloseButton={false}>
                <DialogHeader>
                  <DialogTitle>填写专注记录</DialogTitle>
                  <DialogDescription>
                    本次专注已满 10 分钟，可补充这条 Contribution 的内容。
                  </DialogDescription>
                </DialogHeader>
                <NativeScrollArea>
                  <Textarea
                    value={focusContentInput}
                    onChange={(e) => setFocusContentInput(e.target.value)}
                    placeholder="专注 25 分钟"
                    className="min-h-20"
                  />
                </NativeScrollArea>
                <DialogFooter>
                  <DialogClose
                    render={
                      <Button variant="outline" onClick={handleFocusCancel}>
                        取消
                      </Button>
                    }
                  >
                    取消
                  </DialogClose>
                  <Button onClick={handleFocusConfirm}>确认</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            </div>
            )}
            </div>
            ))}
          </div>

          {/* GitHub 式横向贡献热力图 */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                📊 Activity &amp; Contributions
              </span>
              <div className="flex items-center gap-2">
                {/* 临时功能：一次性补算存量贡献（主人用完会要求删除）；与 handleScan 一并摘除 */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                  onClick={handleScan}
                  title="为热力图上线前已存在的节点补算历史贡献（幂等）"
                >
                  <ScanLine className="size-3.5" />
                  补算历史
                </Button>
                <span className="text-xs text-muted-foreground">{contributions.length} 条</span>
              </div>
            </div>

            <ScrollArea horizontal className="w-full overflow-hidden">
              <div className="flex gap-2 pb-2">
              {/* 周几标签列 */}
              <div className="flex shrink-0 flex-col gap-1 pt-4">
                {WEEKDAY_LABELS.map((label, i) => (
                  <span
                    key={i}
                    className="h-[10px] text-[9px] leading-[10px] text-muted-foreground"
                  >
                    {label}
                  </span>
                ))}
              </div>

              <div>
                {/* 月份标签行（动态：仅在月份变化的那列打标签） */}
                <div className="mb-1 flex gap-1">
                  {monthLabels.map((label, i) => (
                    <span
                      key={i}
                      className="w-[10px] text-[9px] text-muted-foreground"
                    >
                      {label}
                    </span>
                  ))}
                </div>

                {/* 热力格子：53 列 × 7 行（真实数据；晚于今天的格子透明且无 tooltip） */}
                <div className="flex gap-1">
                  {grid.map((col, w) => (
                    <div key={w} className="flex flex-col gap-1">
                      {col.map((cell, d) => {
                        if (!cell.inRange || !cell.dayKey) {
                          return (
                            <span key={d} className="size-[10px] rounded-[2px] bg-transparent" />
                          )
                        }
                        const stat = byDay.get(cell.dayKey)
                        const level = contributionLevel(stat?.amount ?? 0)
                        const titleText =
                          stat && stat.count > 0
                            ? `${cell.dayKey} · ${stat.count} 条 · ${formatAmount(stat.amount)} 贡献值`
                            : `${cell.dayKey} · 无记录`
                        return (
                          <span
                            key={d}
                            title={titleText}
                            className="size-[10px] rounded-[2px]"
                            style={{ backgroundColor: LEVEL_COLORS[level] }}
                          />
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
              </div>
            </ScrollArea>

            {/* 图例 */}
            <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
              少
              {LEVEL_COLORS.map((c, i) => (
                <span
                  key={i}
                  className="size-[10px] rounded-[2px]"
                  style={{ backgroundColor: c }}
                />
              ))}
              多
            </div>

            {/* 贡献详情列表 */}
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-xs font-medium text-muted-foreground">贡献详情</p>
              {sorted.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">暂无活动记录</p>
              ) : (
                <>
                  <div className="mt-2 space-y-2">
                    {sorted.slice(0, visible).map((c) => {
                      const meta = CONTRIB_TYPE_META[c.type]
                      return (
                        <div key={c.id} className="rounded-lg border border-border border-l-2 border-l-[#FF7F50] bg-card p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.badge}`}
                            >
                              {meta.label}
                            </span>
                            <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
                              {format(new Date(c.at), "MM-dd-HH-mm")}
                            </span>
                          </div>
                          <p className="mt-2 truncate text-sm text-foreground">{c.content}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            贡献值 {formatContribAmount(c.amount)}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                  {visible < sorted.length ? (
                    <div className="mt-3 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-sm text-muted-foreground"
                        onClick={() => setVisible((v) => v + 5)}
                      >
                        查看更多活动记录
                      </Button>
                    </div>
                  ) : sorted.length > 5 ? (
                    <p className="py-2 text-center text-xs text-muted-foreground">无更多活动记录</p>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
        </div>
      </ScrollArea>

      {/* 右下角：每日诗歌（API 接入，按日期缓存，可手动刷新）——悬空文字：绝对定位浮在页面右下角，无背景底色，不占布局 */}
      {poemVisible && (
        <footer className="pointer-events-none absolute right-8 bottom-4 z-10 flex items-end justify-end gap-2 text-right text-xs text-muted-foreground">
          <div className="flex flex-col items-end gap-0.5">
            {poemLoading ? (
              <span>诗词加载中…</span>
            ) : (
              <>
                <span className="inline-flex items-center gap-1">
                  <Feather className="size-3" />
                  「{poemLine}」
                </span>
                {poemAuthor && poemTitle && (
                  <span className="text-[10px] opacity-80">
                    ——{poemAuthor}《{poemTitle}》
                  </span>
                )}
              </>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            className="pointer-events-auto"
            onClick={refreshPoem}
            disabled={poemRefreshing || poemLoading}
            title="换一首诗"
            aria-label="换一首诗"
          >
            <RefreshCw className={poemRefreshing ? "size-3 animate-spin" : "size-3"} />
          </Button>
        </footer>
      )}
    </div>
  )
}
