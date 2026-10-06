// lib/contributions.ts 的纯逻辑测试（node:test，`npm test` 跑）。
// 覆盖「每天翻篇」口径（TODO 8）：dayKey 按 settings.dayStartOffset（默认 04:00）
// 把凌晨时刻归到前一天，以及 offset 非法值的回落行为。
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  DEFAULT_DAY_START_OFFSET,
  dayKey,
  normalizeDayStartOffset,
  parseDayStartOffset,
  todayKey,
} from "../lib/contributions.ts"

describe("parseDayStartOffset", () => {
  it("合法 HH:mm 转分钟数", () => {
    assert.equal(parseDayStartOffset("04:00"), 240)
    assert.equal(parseDayStartOffset("00:00"), 0)
    assert.equal(parseDayStartOffset("23:59"), 23 * 60 + 59)
    assert.equal(parseDayStartOffset("05:30"), 330)
  })

  it("非法 / 空值回落 240（04:00）", () => {
    assert.equal(parseDayStartOffset(""), 240)
    assert.equal(parseDayStartOffset("abc"), 240)
    assert.equal(parseDayStartOffset("25:00"), 240)
    assert.equal(parseDayStartOffset("4:00"), 240) // 必须两位 HH
  })
})

describe("normalizeDayStartOffset", () => {
  it("合法值原样保留", () => {
    assert.equal(normalizeDayStartOffset("04:00"), "04:00")
    assert.equal(normalizeDayStartOffset("05:30"), "05:30")
  })

  it("非法值回落默认", () => {
    assert.equal(normalizeDayStartOffset("xyz"), DEFAULT_DAY_START_OFFSET)
    assert.equal(normalizeDayStartOffset(""), DEFAULT_DAY_START_OFFSET)
  })
})

describe("dayKey（04:00 翻篇口径）", () => {
  const at = (y: number, mo: number, d: number, h: number, mi: number) =>
    new Date(y, mo - 1, d, h, mi).getTime()

  it("04:00 前的时刻归前一天（默认 offset=240）", () => {
    assert.equal(dayKey(at(2026, 10, 5, 3, 59), 240), "2026-10-04")
    assert.equal(dayKey(at(2026, 10, 5, 0, 0), 240), "2026-10-04")
  })

  it("04:00 起（含）归当天", () => {
    assert.equal(dayKey(at(2026, 10, 5, 4, 0), 240), "2026-10-05")
    assert.equal(dayKey(at(2026, 10, 5, 23, 59), 240), "2026-10-05")
  })

  it("跨月 / 跨年边界正确归前一天", () => {
    assert.equal(dayKey(at(2026, 10, 1, 2, 0), 240), "2026-09-30")
    assert.equal(dayKey(at(2027, 1, 1, 2, 0), 240), "2026-12-31")
  })

  it("offset=0 时零点即翻篇", () => {
    assert.equal(dayKey(at(2026, 10, 5, 0, 0), 0), "2026-10-05")
    assert.equal(dayKey(at(2026, 10, 4, 23, 59), 0), "2026-10-04")
  })
})

describe("todayKey", () => {
  it("与 dayKey(now, offset) 一致", () => {
    const now = new Date(2026, 9, 5, 12, 0).getTime()
    assert.equal(todayKey(240, now), "2026-10-05")
  })
})
