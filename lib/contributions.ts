import type { Contribution } from "./types"

/**
 * 贡献账本（Profile 热力图数据源）的纯逻辑。
 *
 * 设计要点（详见 `docs/entry-points.md` §8.16）：
 * - 账本存「发生时间 `at`（epoch ms）」，**读取时**按当前 `dayStartOffset` 现算 dayKey；
 *   因此用户改「每天翻篇时间」后，历史记录会跟着重新分桶（语义自洽）。
 * - `dayStartOffset` 语义：某日 `offset` 之前的时刻归到**前一天**（默认 04:00）。
 */

/** 每天「翻篇」时刻默认值（HH:mm，用户本地时区）：04:00 之前仍算前一天 */
export const DEFAULT_DAY_START_OFFSET = "04:00"

/** 非法 / 缺省 offset 的回落分钟数（= 04:00 → 240） */
const FALLBACK_OFFSET_MINUTES = 240

/** HH:mm（00:00–23:59）；允许单位数小时（如 "4:00"）以兼容手改 */
const HHMM_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/

/** "HH:mm" → 距当日 00:00 的分钟数；非法 / 空值回退 240（04:00）。 */
export function parseDayStartOffset(value: string): number {
  if (typeof value !== "string") return FALLBACK_OFFSET_MINUTES
  const m = HHMM_RE.exec(value.trim())
  if (!m) return FALLBACK_OFFSET_MINUTES
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * 规范化 offset 字符串：合法则原样（去首尾空格），否则回落默认 "04:00"。
 * 用于读写设置时的兜底（settings 可能被手改坏），保证不落坏值。
 */
export function normalizeDayStartOffset(value: unknown): string {
  if (typeof value === "string") {
    const v = value.trim()
    if (HHMM_RE.test(v)) return v
  }
  return DEFAULT_DAY_START_OFFSET
}

/** 本地时间减去 offset 分钟后取 yyyy-MM-dd。offset=240 时，04:00 前的时刻归前一天。 */
export function dayKey(at: number, offsetMinutes: number): string {
  const d = new Date(at - offsetMinutes * 60_000)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${mo}-${day}`
}

/** 当前所属日键（按 offset 分桶） */
export function todayKey(offsetMinutes: number, now: number = Date.now()): string {
  return dayKey(now, offsetMinutes)
}

/** 贡献强度分级：0 / (0,1] / (1,3] / (3,6] / >6 → 0..4（对应 5 级配色） */
export function contributionLevel(amountSum: number): 0 | 1 | 2 | 3 | 4 {
  if (!(amountSum > 0)) return 0
  if (amountSum <= 1) return 1
  if (amountSum <= 3) return 2
  if (amountSum <= 6) return 3
  return 4
}

/** 按日聚合：dayKey → { amount(贡献值之和), count(条数) } */
export function aggregateByDay(
  items: Contribution[],
  offsetMinutes: number,
): Map<string, { amount: number; count: number }> {
  const map = new Map<string, { amount: number; count: number }>()
  for (const c of items) {
    const key = dayKey(c.at, offsetMinutes)
    const cur = map.get(key)
    if (cur) {
      cur.amount += c.amount
      cur.count += 1
    } else {
      map.set(key, { amount: c.amount, count: 1 })
    }
  }
  return map
}

/** 热力图单格 */
export interface HeatmapCell {
  /** 该格日期键 yyyy-MM-dd；晚于今天时（inRange=false）为 null */
  dayKey: string | null
  /** 该格对应的本地日期（本地 00:00） */
  date: Date
  /** 是否在有效范围内（不晚于今天） */
  inRange: boolean
}

/** 英文月份缩写（与既有热力图 "Jun/Jul/Aug/Sep" 风格一致） */
const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

/** 本地日期 → yyyy-MM-dd */
function fmtLocal(date: Date): string {
  const y = date.getFullYear()
  const mo = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${mo}-${d}`
}

/**
 * 生成热力图网格：`weeks` 列 × 7 行。
 * - 列按**周日起始**（与 `WEEKDAY_LABELS` 的约定一致）；
 * - 末列 = 今天所在周，首列 = 该周周日往前推 (weeks-1) 周；
 * - **晚于今天的格子 `inRange=false`、`dayKey=null`**（不渲染背景色）。
 *
 * @param todayKeyStr 今天日键（应来自 `todayKey(offsetMinutes)`，已含 offset 语义）
 */
export function buildHeatmapGrid(todayKeyStr: string, weeks = 53): HeatmapCell[][] {
  const [y, mo, d] = todayKeyStr.split("-").map(Number)
  const today = new Date(y, (mo || 1) - 1, d || 1)
  const startSunday = new Date(today)
  startSunday.setDate(startSunday.getDate() - today.getDay()) // 回到本周周日
  startSunday.setDate(startSunday.getDate() - (weeks - 1) * 7) // 再往前 (weeks-1) 周

  const grid: HeatmapCell[][] = []
  for (let w = 0; w < weeks; w++) {
    const col: HeatmapCell[] = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(startSunday)
      date.setDate(startSunday.getDate() + w * 7 + i)
      const inRange = date.getTime() <= today.getTime()
      col.push({ dayKey: inRange ? fmtLocal(date) : null, date, inRange })
    }
    grid.push(col)
  }
  return grid
}

/**
 * 月份标签：为每列算出「该列首日（周日）」所在月份，仅在月份发生变化的那列打标签。
 * 返回长度 = 列数的数组，元素为 3 字母缩写或 ""。
 */
export function buildMonthLabels(grid: HeatmapCell[][]): string[] {
  const labels: string[] = []
  let last = -1
  for (const col of grid) {
    const m = col[0] ? col[0].date.getMonth() : -1
    if (m !== last && m >= 0) {
      labels.push(MONTH_ABBR[m])
      last = m
    } else {
      labels.push("")
    }
  }
  return labels
}
