"use client"

import { Lunar, LunarMonth } from "lunar-javascript"

// 农历工具：包装 lunar-javascript（CommonJS、无内置类型，TS 声明见仓库根 lunar-javascript.d.ts），提供中文农历文本与「农历月日 → 公历日期」换算，均为纯函数。

const NUM = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"]

/** 小写数字转中文（1-12，用于月） */
function cnMonth(n: number): string {
  if (n <= 10) return NUM[n]
  if (n === 11) return "十一"
  return "十二"
}

/** 某公历日期的中文农历文本，如「农历五月十五」「农历闰六月廿三」；月份带「小/大」（29 天小、30 天大）。 */
export function lunarTextForSolar(date: Date): string {
  const lunar = Lunar.fromDate(date)
  const y = lunar.getYear()
  const m = lunar.getMonth()

  const isLeap = m < 0
  const month = Math.abs(m)
  const monthCn = cnMonth(month)
  let size = ""
  try {
    const days = LunarMonth.fromYm(y, month).getDayCount()
    size = days === 29 ? "小" : "大"
  } catch {
    size = ""
  }
  const dayCn = lunar.getDayInChinese()

  const leapMark = isLeap ? "闰" : ""
  return `农历${leapMark}${monthCn}月${size}${dayCn}`
}

/**
 * 「农历 M 月 D 日 → 公历 solarYear 年内的日期」，找不到返回 null。
 * 跨年时自动回退 solarYear+1 再算一次（农历起点起算可能落到次年）；闰月不在需求内（生日 schema 未启用），月传正数。
 */
export function solarMatchForLunarMD(
  solarYear: number,
  lunarMonth: number,
  lunarDay: number
): { year: number; month: number; day: number } | null {
  try {
    let lunar = Lunar.fromYmd(solarYear, lunarMonth, lunarDay)
    if (lunar.getYear() !== solarYear) {
      lunar = Lunar.fromYmd(solarYear + 1, lunarMonth, lunarDay)
    }
    const s = lunar.getSolar()
    return { year: s.getYear(), month: s.getMonth(), day: s.getDay() }
  } catch {
    return null
  }
}

/**
 * 农历 lunarYear（明确农历年，非借用公历年推算）→ 公历日期，结果唯一，用于精确规则 `LYYYY-MM-DD`（如农历2026年八月十五只在该农历年命中一次）。
 * 找不到返回 null；与 solarMatchForLunarMD 不同，闰月传正数（闰月标记不在需求内）。
 */
export function solarForLunarYMD(
  lunarYear: number,
  lunarMonth: number,
  lunarDay: number
): { year: number; month: number; day: number } | null {
  try {
    const lunar = Lunar.fromYmd(lunarYear, lunarMonth, lunarDay)
    const s = lunar.getSolar()
    return { year: s.getYear(), month: s.getMonth(), day: s.getDay() }
  } catch {
    return null
  }
}
