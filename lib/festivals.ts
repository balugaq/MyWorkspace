"use client"

import { Lunar, HolidayUtil } from "lunar-javascript"
import { solarMatchForLunarMD } from "./lunar"

/**
 * 节日数据模型与匹配。
 *
 * public/custom_festivals.yml 的 schema：
 *   festivals:
 *     - name: "名称"
 *       festival_rule: "5-2-7" | "11-27" | "2026-07-09" | "L+月-日"(农历月日)
 *       color: "#FF0000"        # 默认 slateblue
 *       holiday_override: true  # 是否节假日（日格标"假"）
 *       workday_override: false # 是否工作日（日格标"班"）
 *
 * festival_rule 解析：
 *   - n1-n2：每年固定公历月-日  （如 11-27）
 *   - yyyy-mm-dd：仅该年该日（如 2026-07-09）
 *   - m-w-d：每年某月第 N 个星期几（如 5-2-7 = 5月第2个周日；第5个以每4周一档，超过取消）
 *   - Lm-d：农历月-日，每年换算成公历（如 L6-15 = 农历六月十五）
 */

/** 节日匹配规则类型 */
export type FestivalKind =
  | "monthDay"
  | "date"
  | "weekdayOfMonth"
  | "lunar"
  | "jieqi"
  | "holiday"

export interface Festival {
  name: string
  /** 节日的具体展示色 */
  color: string
  holiday: boolean
  workday: boolean
  // 内部：匹配所需的规则解析结果
  kind: FestivalKind
  mm?: number // monthDay / weekdayOfMonth / lunar
  dd?: number
  year?: number
  weekIndex?: number
  weekday?: number // 0=周日
}

/** 二十四节气配色（紫） */
export const JIEQI_COLOR = "#c084fc"
/** 法定放假日配色（红） */
export const HOLIDAY_COLOR = "#ef4444"
/** 调休补班工作日配色（蓝） */
export const WORKDAY_COLOR = "#3b82f6"

/**
 * 内置中国日历要素（纯离线，来自 lunar-javascript），按优先级返回：
 *   1) 法定节假日 / 调休：HolidayUtil.getHoliday() 命中时
 *        work:false → 法定放假日（holiday:true），work:true → 调休补班（workday:true）
 *   2) 二十四节气：Lunar.getJieQi() 返回非空即该日节气名
 * 当节气名与法定假日名**完全相同**时，仅保留法定假日条目；
 * 形如「清明」(节气) 与「清明节」(假日) 视为正常并存，不额外去重。
 *
 * ⚠️ 数据范围：HolidayUtil 仅覆盖约 2010–2026；2027+ 未来年及 2010 之前的年份
 * 没有内置数据，需由 public/custom_festivals.yml 的 holiday_override / workday_override 手动补充。
 */
export function builtinChinaFestivals(
  year: number,
  month: number,
  day: number
): Festival[] {
  const out: Festival[] = []
  let jq = ""
  try {
    jq = Lunar.fromDate(new Date(year, month - 1, day)).getJieQi()
  } catch {
    jq = ""
  }
  let h: { _p: { day: string; name?: string; work: boolean; target: string } } | null = null
  try {
    h = HolidayUtil.getHoliday(year, month, day)
  } catch {
    h = null
  }

  // 法定节假日 / 调休 优先
  if (h && h._p) {
    const work = !!h._p.work
    out.push({
      name: h._p.name ?? (work ? "班" : "假"),
      color: work ? WORKDAY_COLOR : HOLIDAY_COLOR,
      holiday: !work,
      workday: work,
      kind: "holiday",
    })
  }
  // 二十四节气：仅在该日节气名与法定假日名**完全相同**时才跳过（例如二者都是「清明」）。
  // 形如「清明」(节气) 与「清明节」(假日名) 视为正常并存，不做额外压制。
  if (jq && !(h && h._p && h._p.name === jq)) {
    out.push({ name: jq, color: JIEQI_COLOR, holiday: false, workday: false, kind: "jieqi" })
  }
  return out
}

export interface FestivalDef {
  name: string
  festival_rule?: string
  color?: string
  holiday_override?: boolean
  workday_override?: boolean
}

export interface FestivalsFile {
  festivals?: FestivalDef[]
}

/** 解析一条 festival_rule 为匹配规则；无法解析返回 null */
export function parseFestivalRule(rule: string | undefined): Omit<Festival, "name" | "color" | "holiday" | "workday"> | null {
  if (!rule) return null
  const s = rule.trim()
  if (!s) return null

  // 农历：L月-日
  if (s.startsWith("L")) {
    const m = /^(\d{1,2})-(\d{1,2})$/.exec(s.slice(1))
    if (m) {
      const mm = Number(m[1])
      const dd = Number(m[2])
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 30) return { kind: "lunar", mm, dd }
    }
    return null
  }

  const parts = s.split("-").map((x) => Number(x))
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null

  if (parts.length === 2) {
    const [mm, dd] = parts
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) return { kind: "monthDay", mm, dd }
    return null
  }
  if (parts.length === 3) {
    const [a, b, c] = parts
    // 年-月-日：首段四位及以上
    if (s.split("-")[0].length >= 4) {
      if (a >= 1900 && a <= 2100 && b >= 1 && b <= 12 && c >= 1 && c <= 31) {
        return { kind: "date", year: a, mm: b, dd: c }
      }
      return null
    }
    // 月-周-日：某月第几个星期几。星期编码 1-7 = 周一到周日（7 即周日），
    // 兼容 schema 示例 "5-2-7"(5月第二个星期天)。内部统一转成 JS 的 0-6。
    if (a >= 1 && a <= 12 && b >= 1 && b <= 5 && c >= 1 && c <= 7) {
      const jsWeekday = c % 7 // 7(周日)->0
      return { kind: "weekdayOfMonth", mm: a, weekIndex: b, weekday: jsWeekday }
    }
    return null
  }
  return null
}

/** 给定公历日期 y/m/d，判断是否命中某条节日 */
function matchDate(f: Festival, year: number, month: number, day: number): boolean {
  switch (f.kind) {
    case "monthDay":
      return f.mm === month && f.dd === day
    case "date":
      return f.year === year && f.mm === month && f.dd === day
    case "weekdayOfMonth": {
      if (f.mm !== month) return false
      const first = new Date(year, month - 1, 1)
      const firstWeekday = first.getDay()
      // 该月第 weekIndex 个 weekday
      const offset = (f.weekday! - firstWeekday + 7) % 7
      const targetDay = 1 + offset + (f.weekIndex! - 1) * 7
      return targetDay === day
    }
    case "lunar": {
      // 每年换算：由外部在 festivalsForDate 里用 solarMatchForLunarMD 处理，这里不直接匹配
      return false
    }
    default:
      return false
  }
}

/**
 * 查询某公历日期（year/month/day）命中的所有节日。
 * 返回按原顺序的命中列表（含 name / color / holiday / workday）。
 */
export function festivalsForDate(
  defs: FestivalDef[] | undefined,
  year: number,
  month: number,
  day: number
): Festival[] {
  const out: Festival[] = []
  for (const def of defs ?? []) {
    if (!def.name) continue
    const rule = parseFestivalRule(def.festival_rule)
    if (!rule) continue
    const f: Festival = {
      name: def.name,
      color: def.color || "slateblue",
      holiday: !!def.holiday_override,
      workday: !!def.workday_override,
      ...rule,
    }
    if (f.kind === "lunar") {
      const solar = solarMatchForLunarMD(year, f.mm!, f.dd!)
      if (solar && solar.year === year && solar.month === month && solar.day === day) {
        out.push(f)
      }
    } else if (matchDate(f, year, month, day)) {
      out.push(f)
    }
  }
  return out
}
