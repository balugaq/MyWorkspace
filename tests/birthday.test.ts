// lib/birthday.ts 的纯逻辑测试（node:test，`npm test` 跑）。
// 覆盖 TODO 61 生日横幅的倒推逻辑：下一个生日日期、剩余天数、公历 2/29 回落、
// 农历换算窗口、以及 upcomingBirthdays 的汇总与排序。
// 农历用例不硬编码换算值：用 solarMatchForLunarMD 自身产出构造「今天」，
// 只验证我们的窗口/回落逻辑，不重复验证换算库。
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { nextBirthdayIn, upcomingBirthdays } from "../lib/birthday.ts"
import { solarMatchForLunarMD } from "../lib/lunar.ts"
import type { Person } from "../lib/address-book.ts"

const person = (birthday: string, name = "张三"): Person => ({
  id: name,
  name,
  birthday,
})

const at = (y: number, mo: number, d: number) => new Date(y, mo - 1, d)

describe("nextBirthdayIn（公历）", () => {
  it("未来的生日返回今年日期与剩余天数", () => {
    const r = nextBirthdayIn(person("1995-10-10"), at(2026, 10, 7))
    assert.ok(r)
    assert.equal(r.daysUntil, 3)
    assert.equal(r.date.getFullYear(), 2026)
    assert.equal(r.date.getMonth() + 1, 10)
    assert.equal(r.date.getDate(), 10)
  })

  it("当天过生日 daysUntil = 0", () => {
    const r = nextBirthdayIn(person("1990-10-07"), at(2026, 10, 7))
    assert.ok(r)
    assert.equal(r.daysUntil, 0)
  })

  it("今年的生日已过 → 归到明年", () => {
    const r = nextBirthdayIn(person("1990-10-01"), at(2026, 10, 7))
    assert.ok(r)
    assert.equal(r.daysUntil, 359) // 2026-10-07 → 2027-10-01
    assert.equal(r.date.getFullYear(), 2027)
  })

  it("2/29 生日在非闰年回落 2/28（不因 Date 溢出跳到 3 月）", () => {
    const r = nextBirthdayIn(person("2000-02-29"), at(2027, 2, 26))
    assert.ok(r)
    assert.equal(r.daysUntil, 2)
    assert.equal(r.date.getMonth() + 1, 2)
    assert.equal(r.date.getDate(), 28)
  })

  it("2/29 生日在闰年保持 2/29", () => {
    const r = nextBirthdayIn(person("2000-02-29"), at(2028, 2, 26))
    assert.ok(r)
    assert.equal(r.date.getDate(), 29)
  })

  it("非法生日返回 null", () => {
    assert.equal(nextBirthdayIn(person("abc"), at(2026, 10, 7)), null)
    assert.equal(nextBirthdayIn({ id: "x", name: "x" }, at(2026, 10, 7)), null)
  })
})

describe("nextBirthdayIn（农历，动态构造换算日）", () => {
  const lunarMD = { month: 8, day: 15 } // 中秋月日，仅用其换算结果
  const thisYear = solarMatchForLunarMD(2026, lunarMD.month, lunarMD.day)
  const personLunar = person(`L1990-${String(lunarMD.month).padStart(2, "0")}-${String(lunarMD.day).padStart(2, "0")}`)

  it("换算到的公历当天 daysUntil = 0", () => {
    assert.ok(thisYear)
    const r = nextBirthdayIn(personLunar, at(thisYear!.year, thisYear!.month, thisYear!.day))
    assert.ok(r)
    assert.equal(r.daysUntil, 0)
  })

  it("换算日前一天 daysUntil = 1", () => {
    assert.ok(thisYear)
    const dayBefore = new Date(thisYear!.year, thisYear!.month - 1, thisYear!.day - 1)
    const r = nextBirthdayIn(personLunar, dayBefore)
    assert.ok(r)
    assert.equal(r.daysUntil, 1)
  })

  it("换算日已过 → 回落到次年换算结果（严格晚于今天）", () => {
    assert.ok(thisYear)
    const dayAfter = new Date(thisYear!.year, thisYear!.month - 1, thisYear!.day + 1)
    const r = nextBirthdayIn(personLunar, dayAfter)
    assert.ok(r)
    assert.ok(r.date.getTime() > dayAfter.getTime())
    assert.ok(r.daysUntil >= 300) // 次年同农历月日，应远在窗口外
  })
})

describe("upcomingBirthdays（汇总与排序）", () => {
  const today = at(2026, 10, 7)
  const people: Person[] = [
    person("1990-10-07", "今天星"),
    person("1990-10-09", "后天星"),
    person("1990-10-15", "窗口外"),
    person("1990-10-08", "明天星"),
    { id: "no-name", name: "", birthday: "1990-10-08" }, // 无姓名跳过
    { id: "no-bd", name: "无生日" }, // 无生日跳过
  ]

  it("过滤窗口外与非法数据，按剩余天数升序", () => {
    const list = upcomingBirthdays(people, 7, today)
    assert.deepEqual(
      list.map((b) => [b.person.name, b.daysUntil]),
      [
        ["今天星", 0],
        ["明天星", 1],
        ["后天星", 2],
      ],
    )
  })

  it("daysAhead=0 仅当天", () => {
    const list = upcomingBirthdays(people, 0, today)
    assert.deepEqual(list.map((b) => b.person.name), ["今天星"])
  })
})
