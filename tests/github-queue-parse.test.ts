// lib/github-queue.ts 解析函数的纯逻辑测试（node:test，`npm test` 跑）。
// 覆盖 TODO 手动添加 Issue/PR 与设置页监听仓库的输入解析（无网络请求，纯函数）。
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { parseIssueRef, parseRepoInput } from "../lib/github-queue.ts"

describe("parseRepoInput", () => {
  it("裸 owner/repo 原样返回", () => {
    assert.equal(parseRepoInput("torvalds/linux"), "torvalds/linux")
    assert.equal(parseRepoInput("  torvalds/linux  "), "torvalds/linux")
  })

  it("完整 URL / .git / issues 后缀均归一为 owner/repo", () => {
    assert.equal(parseRepoInput("https://github.com/torvalds/linux"), "torvalds/linux")
    assert.equal(parseRepoInput("https://github.com/torvalds/linux.git"), "torvalds/linux")
    assert.equal(parseRepoInput("https://github.com/torvalds/linux/issues"), "torvalds/linux")
    assert.equal(parseRepoInput("https://github.com/torvalds/linux/pulls"), "torvalds/linux")
  })

  it("无法解析返回空串", () => {
    assert.equal(parseRepoInput("随便一句话"), "")
  })
})

describe("parseIssueRef", () => {
  it("解析 issue 完整链接（含 #anchor 与裸路径）", () => {
    assert.deepEqual(parseIssueRef("https://github.com/o/r/issues/123"), { repo: "o/r", number: 123 })
    assert.deepEqual(
      parseIssueRef("https://github.com/o/r/issues/123#issue-456"),
      { repo: "o/r", number: 123 },
    )
    assert.deepEqual(parseIssueRef("o/r/issues/123"), { repo: "o/r", number: 123 })
  })

  it("解析 pull 链接", () => {
    assert.deepEqual(parseIssueRef("https://github.com/o/r/pull/7"), { repo: "o/r", number: 7 })
  })

  it("解析 owner/repo#编号 简写", () => {
    assert.deepEqual(parseIssueRef("o/r#42"), { repo: "o/r", number: 42 })
  })

  it("无法识别返回 null", () => {
    assert.equal(parseIssueRef("https://github.com/o/r"), null)
    assert.equal(parseIssueRef("o/r"), null)
    assert.equal(parseIssueRef("随便一句话"), null)
  })
})
