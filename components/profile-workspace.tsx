"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { CalendarDays, CalendarCheck, User, Feather, RefreshCw, ScanLine } from "lucide-react"
import { useWorkspace } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { WeatherWidget } from "@/components/weather-widget"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  aggregateByDay,
  buildHeatmapGrid,
  buildMonthLabels,
  contributionLevel,
  parseDayStartOffset,
  todayKey,
} from "@/lib/contributions"

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

const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""]

// 贡献值展示：四舍五入取整（todo.md 口径）。
// amount < 0.5 的日子（例如当天只新建 1 个节点 = 0.2）会显示 0 —— 主人明确要求照实显示，不做修饰。
function formatAmount(n: number): string {
  return String(Math.round(n))
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
  const today = todayKey(offsetMinutes)
  const grid = useMemo(() => buildHeatmapGrid(today, WEEKS), [today])
  const monthLabels = useMemo(() => buildMonthLabels(grid), [grid])
  const byDay = useMemo(
    () => aggregateByDay(contributions, offsetMinutes),
    [contributions, offsetMinutes],
  )

  // 日期 / 星期：实时计算（非占位）
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const weekday = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][now.getDay()]

  // 所在地区：用户可双击编辑（不可留空，空则回退上一值）；未设置时默认展示「中国」
  const updateSettings = useWorkspace((s) => s.updateSettings)
  const storedLocation = useWorkspace((s) => s.settings.location)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const displayLocation = storedLocation.trim() || "中国"

  const startEdit = () => {
    setDraft(displayLocation)
    setEditing(true)
  }
  // 提交：空值不保存（回退上一值并提示），否则写入
  const commitEdit = () => {
    const next = draft.trim()
    if (!next) {
      toast.error("所在地区不能为空")
      setEditing(false)
      return
    }
    updateSettings({ location: next })
    setEditing(false)
  }
  const cancelEdit = () => setEditing(false)

  // 用户名：同款双击编辑（不可留空，空则回退上一值）；未设置时默认展示「未命名用户」
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
    <div className="flex h-full min-h-0 flex-col">
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

            {/* 所在地区：双击编辑（不可留空，空则回退上一值） */}
            {editing ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    commitEdit()
                  } else if (e.key === "Escape") {
                    e.preventDefault()
                    cancelEdit()
                  }
                }}
                placeholder="所在地区"
                className="w-40 rounded border border-border bg-background px-1 text-sm text-muted-foreground outline-none focus:border-primary"
              />
            ) : (
              <span
                title="双击编辑所在地区"
                onDoubleClick={startEdit}
                className="flex w-fit cursor-text items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <span aria-hidden>📍</span>
                {displayLocation}
              </span>
            )}
          </div>

          {/* 签到功能（占位：按钮完整，逻辑待接） */}
          <div className="w-64 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <CalendarCheck className="size-4 text-primary" />
              每日签到
            </div>
            <p className="mt-1 text-xs text-muted-foreground">坚持就是胜利，保持活跃。</p>
            <Button
              className="mt-3 w-full"
              onClick={() => toast.info("签到功能开发中")}
            >
              签到
            </Button>
          </div>
        </div>

        {/* 右栏：天气 + 日期（上）；贡献图（下） */}
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* 今天天气（实时数据：本地天气代理 + 中国天气网） */}
            <WeatherWidget />

            {/* 今天日期 + 星期 */}
            <div className="rounded-xl border border-border bg-card p-4">
              {/* 日期数字（约 100×25 像素范围） */}
              <div className="flex h-[25px] w-[100px] items-center rounded bg-muted/60 px-2 text-sm font-semibold text-foreground">
                {month}月{day}日
              </div>
              <div className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
                <CalendarDays className="size-4" />
                {weekday}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">今日暂无待办事项</p>
            </div>
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
          </div>
        </div>
        </div>
      </ScrollArea>

      {/* 右下角：每日诗歌（API 接入，按日期缓存，可手动刷新） */}
      {poemVisible && (
        <footer className="flex items-end justify-end gap-2 px-8 pb-4 text-right text-xs text-muted-foreground">
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
