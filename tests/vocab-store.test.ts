// lib/vocab-store.ts 的纯逻辑测试（node:test，`npm test` 跑）。
// 覆盖 TODO 64 批 1 可独立验证的纯函数：批量导入文本解析 parseVocabImport。
// IndexedDB 相关函数（缓存 / 去重入库 / 导入导出）依赖浏览器环境，不在 node 测试范围。
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { parseVocabImport } from "../lib/vocab-store.ts"

describe("parseVocabImport", () => {
  it("解析纯数组格式", () => {
    const r = parseVocabImport(
      '[{"word":"abandon","definition":"v. 放弃","source":"book1"},{"word":"beauty","definition":"n. 美"}]'
    )
    assert.equal(r.items.length, 2)
    assert.equal(r.invalid, 0)
    assert.deepEqual(r.items[0], { word: "abandon", definition: "v. 放弃", source: "book1" })
    assert.deepEqual(r.items[1], { word: "beauty", definition: "n. 美" })
  })

  it("解析 { items: [...] } 包裹格式（AI 输出常见变体）", () => {
    const r = parseVocabImport('{"items":[{"word":"cat","definition":"n. 猫"}]}')
    assert.equal(r.items.length, 1)
    assert.equal(r.items[0].word, "cat")
  })

  it("word / definition 缺失或空白计为 invalid", () => {
    const r = parseVocabImport(
      '[{"word":"","definition":"x"},{"word":"ok","definition":""},{"word":"  ","definition":"x"},{"word":"good","definition":" 释义 "},{},null]'
    )
    assert.deepEqual(
      r.items.map((i) => i.word),
      ["good"]
    )
    assert.equal(r.invalid, 5)
  })

  it("字段首尾空白被 trim；无 source 时不带该字段", () => {
    const r = parseVocabImport('[{"word":"  run  ","definition":" v. 跑 "}]')
    assert.equal(r.items[0].word, "run")
    assert.equal(r.items[0].definition, "v. 跑")
    assert.ok(!("source" in r.items[0]))
  })

  it("word 超过 100 字符（VOCAB_WORD_MAX）计为 invalid", () => {
    const long = "a".repeat(101)
    const ok = "a".repeat(100)
    const r = parseVocabImport(
      `[{"word":"${long}","definition":"x"},{"word":"${ok}","definition":"x"}]`
    )
    assert.equal(r.items.length, 1)
    assert.equal(r.items[0].word, ok)
    assert.equal(r.invalid, 1)
  })

  it("非法 JSON / 非数组 / 空文本返回空结果", () => {
    assert.equal(parseVocabImport("not json").items.length, 0)
    assert.equal(parseVocabImport('{"a":1}').items.length, 0)
    assert.equal(parseVocabImport("").items.length, 0)
    assert.equal(parseVocabImport("   ").invalid, 0)
  })

  it("AI 输出带代码围栏或前后缀说明时解析失败返回空（由调用方先剥离）", () => {
    assert.equal(parseVocabImport('好的，以下是词汇表：\n[{"word":"a","definition":"b"}]').items.length, 0)
  })
})
