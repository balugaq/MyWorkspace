// lib/vocab-quiz.ts 的纯逻辑测试（node:test，`npm test` 跑）。
// 覆盖 TODO 64 批 2 出题抽样：数量截断 / 不重复 / 错词加权。
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { pickQuizEntries } from "../lib/vocab-quiz.ts"

function entry(id: string, wrongCount = 0) {
  return {
    id,
    word: id,
    definition: "d",
    createdAt: 0,
    review: { total: wrongCount, wrongCount },
  }
}

describe("pickQuizEntries", () => {
  it("抽词数量不超过题数与词库大小", () => {
    const pool = [entry("a"), entry("b"), entry("c")]
    assert.equal(pickQuizEntries(pool, 5).length, 3)
    assert.equal(pickQuizEntries(pool, 2).length, 2)
    assert.equal(pickQuizEntries([], 10).length, 0)
    assert.equal(pickQuizEntries(pool, 0).length, 0)
  })

  it("一轮内不重复抽词", () => {
    const pool = [entry("a"), entry("b"), entry("c"), entry("d"), entry("e")]
    const picked = pickQuizEntries(pool, 5)
    assert.equal(new Set(picked.map((e) => e.id)).size, 5)
  })

  it("错词加权：wrongCount 高的词显著更常被抽中", () => {
    const pool = [entry("a", 5), entry("b"), entry("c"), entry("d"), entry("e")]
    const N = 2000
    let aFirst = 0
    for (let i = 0; i < N; i++) {
      if (pickQuizEntries(pool, 1)[0].id === "a") aFirst++
    }
    // a 权重 11/21 ≈ 0.524；门槛放宽到 0.35（其余单词仅 ≈0.095），远离两侧避免偶发
    assert.ok(aFirst > N * 0.35, `加权词首抽率 ${aFirst}/${N}，加权疑似未生效`)
  })
})
