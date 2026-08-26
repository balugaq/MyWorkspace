"use client"

import { Lunar, LunarMonth } from "lunar-javascript"

/**
 * 农历工具：包装 lunar-javascript，提供中文农历文本与「农历月日 → 指定公历年的公历日期」。
 *
 * 注意：lunar-javascript 为 CommonJS，无内置类型；本项目的 TS 声明见仓库根 lunar-javascript.d.ts。
 * 所有函数均为纯函数。
 */

const NUM = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"]

/** 小写数字转中文（1-12，用于月） */
function cnMonth(n: number): string {
  if (n <= 10) return NUM[n]
  if (n === 11) return "十一"
  return "十二"
}

/**
 * 某公历日期的中文农历文本，如「农历五月十五」「农历闰六月廿三」。
 * 月份带「小/大」（农历月 29 天为小、30 天为大）。
 */
export function lunarTextForSolar(date: Date): string {
  const lunar = Lunar.fromDate(date)
  const y = lunar.getYear()
  const m = lunar.getMonth()

  const isLeap = m < 0
  const month = Math.abs(m)
  const monthCn = cnMonth(month)
  // 月大小：取该农历年该月天数
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
 * 求指定公历年 solarYear 里，「农历 lunarMonth 月 lunarDay 日」对应的公历日期。
 * 返回 { year, month, day }；若该农历日在公历年边界跨年，自动取落在 solarYear 内的那一个。
 * 找不到时返回 null。
 *
 * 实现：Lunar.fromYmd(农历年, 月, 日) → getSolar()。若得到的农历年不等于目标公历年，
 * 说明从 solarYear 的农历起点起算会跨到 solarYear+1，回退到 solarYear+1 再算一次。
 * 农历月用正数（非闰）；闰月处理不在本需求内（生日 schema 未启用闰月标记）。
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
 * 求「农历 lunarYear 年 lunarMonth 月 lunarDay 日」对应的公历日期。
 * 与 solarMatchForLunarMD 的区别：lunarYear 是**明确的农历年**（非借用公历年推算），
 * 结果唯一，用于精确农历日规则 `LYYYY-MM-DD`（如农历2026年八月十五只在该农历年命中一次）。
 * 找不到时返回 null。闰月用正数表示，闰月标记不在本需求内。
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
