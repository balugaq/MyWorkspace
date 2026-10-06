// lib/format-colors.ts 的纯逻辑测试（node:test，`npm test` 跑）。
// 覆盖 TODO 68 根因：FORMAT_COLOR_TAG_AT（全锚定）与 FORMAT_COLOR_TAG_PREFIX（前缀）
// 在滑动窗口匹配下的行为差异——前者会让文本中间的开标签永不命中、
// 末尾的闭标签脱离配对孤立命中（表现为 </blue> 被吞）。
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  FORMAT_COLOR_TAG_AT,
  FORMAT_COLOR_TAG_PREFIX,
  FORMAT_COLOR_TAG_RE,
} from "../lib/format-colors.ts"

const SAMPLE = "<blue>这是一段文字</blue>"

/** 模拟 TipTap 管线（richtext/format-color.ts）的 markdown-it inline 扫描：规则命中即产出 token */
function scanWith(re: RegExp): { pos: number; kind: "open" | "close"; tag: string }[] {
  const src = SAMPLE
  const hits: { pos: number; kind: "open" | "close"; tag: string }[] = []
  for (let pos = 0; pos < src.length; pos++) {
    if (src[pos] !== "<") continue
    const m = re.exec(src.slice(pos, pos + 32))
    if (m) hits.push({ pos, kind: m[1] ? "close" : "open", tag: m[2] as string })
  }
  return hits
}

describe("FORMAT_COLOR_TAG_AT（全锚定，marked 路径整串判断用）", () => {
  it("整串恰为一个标签时命中", () => {
    assert.ok(FORMAT_COLOR_TAG_AT.test("</blue>".trim()))
    assert.ok(FORMAT_COLOR_TAG_AT.test("<blue>"))
  })

  it("整串含其他文字时不误判", () => {
    assert.ok(!FORMAT_COLOR_TAG_AT.test(SAMPLE))
    assert.ok(!FORMAT_COLOR_TAG_AT.test("<blue>蓝色的字</blue>尾部"))
  })

  it("滑动窗口下仅字符串末尾的闭标签孤立命中（TODO 68 根因回归样本）", () => {
    const hits = scanWith(FORMAT_COLOR_TAG_AT)
    assert.deepEqual(hits, [{ pos: 12, kind: "close", tag: "blue" }])
  })
})

describe("FORMAT_COLOR_TAG_PREFIX（前缀匹配，TipTap 管线滑动窗口用）", () => {
  it("开闭标签按位置配对命中", () => {
    const hits = scanWith(FORMAT_COLOR_TAG_PREFIX)
    assert.deepEqual(hits, [
      { pos: 0, kind: "open", tag: "blue" },
      { pos: 12, kind: "close", tag: "blue" },
    ])
  })

  it("闭标签不在串尾时同样命中", () => {
    const m = FORMAT_COLOR_TAG_PREFIX.exec("</blue>后续文字")
    assert.ok(m && m[1] === "/" && m[2] === "blue")
  })

  it("不误匹配相似但非法的标签", () => {
    assert.ok(!FORMAT_COLOR_TAG_PREFIX.test("<blueberry>"))
    assert.ok(!FORMAT_COLOR_TAG_PREFIX.test("<bluish>"))
    assert.ok(!FORMAT_COLOR_TAG_PREFIX.test("<Blue>")) // 区分大小写
  })

  it("16 色各自可命中（含 dark_/light_ 前缀族）", () => {
    for (const tag of [
      "black", "dark_blue", "dark_green", "dark_aqua", "dark_red", "dark_purple",
      "gold", "gray", "dark_gray", "blue", "green", "aqua", "red", "light_purple",
      "yellow", "white",
    ]) {
      assert.ok(FORMAT_COLOR_TAG_PREFIX.test(`<${tag}>`), `<${tag}> 应命中`)
      assert.ok(FORMAT_COLOR_TAG_PREFIX.test(`</${tag}>`), `</${tag}> 应命中`)
    }
  })
})

describe("FORMAT_COLOR_TAG_RE（全局剥离）", () => {
  it("stripFormatColorTags 剥离全部色标签、保留正文", () => {
    const re = new RegExp(FORMAT_COLOR_TAG_RE.source, "g") // 独立实例，避免 lastIndex 交叉
    assert.equal("前<blue>中</blue>后".replace(re, ""), "前中后")
  })
})
