// lib/tts.ts 的纯逻辑测试（node:test，`npm test` 跑）。
// 覆盖 TODO 17 语音朗读的可读文本提取与切块（speechSynthesis 浏览器 API 不在 node 测试范围）。
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { chunkForSpeech, extractSpeakableText } from "../lib/tts.ts"

describe("extractSpeakableText", () => {
  it("剥离代码块、图片、URL，保留正文与链接标题", () => {
    const md = [
      "先看结论：",
      "",
      "```js",
      "const a = 1",
      "```",
      "",
      "详见[官方文档](https://example.com/docs)。",
      "![图](imgref:abc123)",
      "参考 https://example.com/a/very/long/url",
    ].join("\n")
    const out = extractSpeakableText(md)
    assert.ok(!out.includes("const a"))
    assert.ok(out.includes("（代码已省略）"))
    assert.ok(!out.includes("https://"))
    assert.ok(!out.includes("imgref"))
    assert.ok(out.includes("详见官方文档。"))
  })

  it("剥离格式色标签与内链标记，内链保留标题", () => {
    const md = "<blue>重要</blue>内容，见 [[mw:conv:m_123|旅行规划]]。"
    const out = extractSpeakableText(md)
    assert.equal(out, "重要内容，见 旅行规划。")
  })

  it("剥离标题 / 列表 / 引用 / 强调符号与表格竖线", () => {
    const md = ["## 结论", "- **第一点**", "> 引用一句 | a | b |"].join("\n")
    const out = extractSpeakableText(md)
    assert.ok(!out.includes("#"))
    assert.ok(!out.includes("- "))
    assert.ok(!out.includes(">"))
    assert.ok(!out.includes("**"))
    assert.ok(!out.includes("|"))
    assert.ok(out.includes("结论"))
    assert.ok(out.includes("第一点"))
  })

  it("空消息提取为空串", () => {
    assert.equal(extractSpeakableText(""), "")
    assert.equal(extractSpeakableText("```\n```").trim(), "（代码已省略）")
  })
})

describe("chunkForSpeech", () => {
  it("短文本单块", () => {
    assert.deepEqual(chunkForSpeech("你好。世界！"), ["你好。世界！"])
  })

  it("长文本按句切并合并到上限内", () => {
    const text = Array.from({ length: 20 }, (_, i) => `这是第${i}句话，内容比较长一些。`).join("")
    const chunks = chunkForSpeech(text, 60)
    assert.ok(chunks.length > 1)
    for (const c of chunks) assert.ok(c.length <= 60)
    // 内容不丢失（除空白外按序拼接还原）
    assert.equal(chunks.join(""), text)
  })

  it("无句读的超长单句被硬切", () => {
    const text = "a".repeat(250)
    const chunks = chunkForSpeech(text, 100)
    assert.equal(chunks.length, 3)
    assert.equal(chunks.join(""), text)
  })

  it("全空白文本产出空数组", () => {
    assert.deepEqual(chunkForSpeech("   \n  "), [])
  })
})
