// lib/ai/title.ts 的测试（TODO 74）：AI 生成标题的清洗纯函数。
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { sanitizeGeneratedTitle } from "../lib/ai/title.ts"

describe("sanitizeGeneratedTitle（TODO 74 会话标题清洗）", () => {
  it("常规标题原样保留", () => {
    assert.equal(sanitizeGeneratedTitle("修复登录页面"), "修复登录页面")
    assert.equal(sanitizeGeneratedTitle("Explain closures"), "Explain cl")
  })

  it("去尾部句读（中英句号/问叹号/省略号）", () => {
    assert.equal(sanitizeGeneratedTitle("修复登录页面。"), "修复登录页面")
    assert.equal(sanitizeGeneratedTitle("What is a closure?"), "What is a")
    assert.equal(sanitizeGeneratedTitle("解析问题！"), "解析问题")
    assert.equal(sanitizeGeneratedTitle("边界情况…"), "边界情况")
  })

  it("去首尾引号（中英日）", () => {
    assert.equal(sanitizeGeneratedTitle("「修复登录页面」"), "修复登录页面")
    assert.equal(sanitizeGeneratedTitle('"Fix the login"'), "Fix the lo")
    assert.equal(sanitizeGeneratedTitle("『标题』"), "标题")
  })

  it("多行输出只取首行", () => {
    assert.equal(sanitizeGeneratedTitle("修复登录页面\n\n解释：这是……"), "修复登录页面")
  })

  it("超长截断到 10 字", () => {
    assert.equal(sanitizeGeneratedTitle("这是一个超过十个字的标题需要被截断处理"), "这是一个超过十个字的")
  })

  it("截断后不残留尾部句读", () => {
    // 第 10 字恰是句号：先截断再清尾，保证结尾无句读（主人口径「没有句号结尾」）
    const out = sanitizeGeneratedTitle("一二三四五六七八九。十")
    assert.equal(out, "一二三四五六七八九")
  })

  it("空/纯符号输出返回空串（调用方据此跳过改名）", () => {
    assert.equal(sanitizeGeneratedTitle(""), "")
    assert.equal(sanitizeGeneratedTitle("。"), "")
    assert.equal(sanitizeGeneratedTitle("「」"), "")
    assert.equal(sanitizeGeneratedTitle("   \n  "), "")
  })
})
