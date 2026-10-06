"use client"

import type { Person } from "./address-book"
// .ts 扩展名：node:test（--experimental-strip-types）直接跑本模块时需要显式扩展名
// （allowImportingTsExtensions 已开，Next/Turbopack 构建同样接受）
import { solarMatchForLunarMD } from "./lunar.ts"

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

// ---- 生日横幅（TODO 61）：临近生日倒推 ----

/** 解析 birthday 字符串 → { lunar, month, day }（忽略出生年份；非法返回 null） */
function parseBirthdayMD(birthday: string | undefined): { lunar: boolean; month: number; day: number } | null {
  if (!birthday) return null
  const s = birthday.trim()
  const lunar = s.startsWith("L")
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(lunar ? s.slice(1) : s)
  if (!m) return null
  return { lunar, month: Number(m[2]), day: Number(m[3]) }
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** 公历月日的「当年候选日期」；2/29 在非闰年回落 2/28，避免 Date 溢出进位到 3 月 */
function solarCandidate(year: number, month: number, day: number): Date {
  if (month === 2 && day === 29) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    if (!leap) return new Date(year, 1, 28)
  }
  return new Date(year, month - 1, day)
}

/**
 * 某人下一个生日（≥ today 当天）的公历日期与剩余天数；无合法生日返回 null。
 * 农历生日经 solarMatchForLunarMD 换算：当年换算结果若已早于今天，再换算次年。
 */
export function nextBirthdayIn(
  person: Person,
  today: Date
): { date: Date; daysUntil: number } | null {
  const md = parseBirthdayMD(person.birthday)
  if (!md) return null
  const todayZero = startOfDay(today)
  let cand: Date | null
  if (!md.lunar) {
    cand = solarCandidate(today.getFullYear(), md.month, md.day)
    if (cand.getTime() < todayZero) {
      cand = solarCandidate(today.getFullYear() + 1, md.month, md.day)
    }
  } else {
    const tryYear = (y: number) => {
      const s = solarMatchForLunarMD(y, md.month, md.day)
      return s ? new Date(s.year, s.month - 1, s.day) : null
    }
    cand = tryYear(today.getFullYear())
    if (!cand || cand.getTime() < todayZero) {
      cand = tryYear(today.getFullYear() + 1) ?? cand
    }
  }
  if (!cand) return null
  return { date: cand, daysUntil: Math.round((cand.getTime() - todayZero) / 86400000) }
}

export interface UpcomingBirthday {
  person: Person
  /** 剩余天数：0 = 今天 */
  daysUntil: number
  /** 生日日期的月 / 日（公历，农历生日已换算） */
  month: number
  day: number
  /** 是否农历生日 */
  lunar: boolean
}

/**
 * 汇总未来 daysAhead 天内（含今天，0 ≤ daysUntil ≤ daysAhead）过生日的联系人，
 * 按剩余天数升序、同天按姓名排序。birthday 缺失 / 非法 / 无姓名的联系人自动跳过。
 */
export function upcomingBirthdays(
  people: Person[],
  daysAhead: number,
  today: Date = new Date()
): UpcomingBirthday[] {
  const out: UpcomingBirthday[] = []
  for (const p of people ?? []) {
    if (!p.name) continue
    const md = parseBirthdayMD(p.birthday)
    if (!md) continue
    const next = nextBirthdayIn(p, today)
    if (!next || next.daysUntil < 0 || next.daysUntil > daysAhead) continue
    out.push({
      person: p,
      daysUntil: next.daysUntil,
      month: next.date.getMonth() + 1,
      day: next.date.getDate(),
      lunar: md.lunar,
    })
  }
  return out.sort(
    (a, b) =>
      a.daysUntil - b.daysUntil ||
      a.person.name.localeCompare(b.person.name ?? "", "zh-CN"),
  )
}
