"use client"

import type { Person } from "./address-book"
import { solarMatchForLunarMD } from "./lunar"

/** 判断给定公历日期（year/month/day）是否命中某联系人生日。 */
export function isBirthdayOn(person: Person, year: number, month: number, day: number): boolean {
  const b = person.birthday
  if (!b) return false
  const lunar = b.trim().startsWith("L")
  const core = (lunar ? b.trim().slice(1) : b.trim())
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(core)
  if (!m) return false
  const bMonth = Number(m[2])
  const bDay = Number(m[3])

  if (!lunar) {
    // 公历：只比对月日
    return bMonth === month && bDay === day
  }
  // 农历：把该农历月日换算到本公历年的公历日期，比较
  const solar = solarMatchForLunarMD(year, bMonth, bDay)
  if (!solar) return false
  return solar.year === year && solar.month === month && solar.day === day
}

/** 给定公历日期，返回当天过生日的联系人列表。 */
export function birthdaysOn(
  people: Person[],
  year: number,
  month: number,
  day: number
): Person[] {
  return (people ?? []).filter((p) => p.name && isBirthdayOn(p, year, month, day))
}
