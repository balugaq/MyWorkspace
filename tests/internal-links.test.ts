// lib/internal-links.ts 的纯逻辑测试（node:test，`npm test` 跑）。
// 覆盖 TODO 28 内链标记：正则匹配 / 类型与 id 段校验 / 非法输入拒绝。
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { MW_LINK_RE, parseInternalLink } from "../lib/internal-links.ts"

describe("MW_LINK_RE", () => {
  it("匹配 conv 与 node 两种标记", () => {
    const text =
      "参考 [[mw:conv:m_1710000000_ab12|旅行规划对话]] 与 [[mw:node:fam_x_1:n_9|登录模块待办]]。"
    const matches = [...text.matchAll(MW_LINK_RE)].map((m) => m[0])
    assert.deepEqual(matches, [
      "[[mw:conv:m_1710000000_ab12|旅行规划对话]]",
      "[[mw:node:fam_x_1:n_9|登录模块待办]]",
    ])
  })

  it("标题内不允许 ] 与换行；uuid 形态 id 可匹配", () => {
    const text = "[[mw:conv:a1b2c3d4-e5f6-7890-abcd-ef1234567890|对话]] 后续"
    const m = MW_LINK_RE.exec(text)
    assert.ok(m)
    assert.equal(m[1], "conv")
    assert.equal(m[2], "a1b2c3d4-e5f6-7890-abcd-ef1234567890")
    assert.equal(m[3], "对话")
  })

  it("非法形状不匹配（段数校验在 parseInternalLink 层）", () => {
    // conv: 后必须有 id 段
    assert.equal("[[mw:conv:|无id]]".match(MW_LINK_RE), null)
    // 未知类型不匹配
    assert.equal("[[mw:unknown:abc|未知类型]]".match(MW_LINK_RE), null)
    // 单层括号不匹配
    assert.equal("[mw:conv:abc|单层括号]".match(MW_LINK_RE), null)
  })

  it("形状合法但段数不足的 node 标记在 RE 层匹配、由 parse 层拒绝", () => {
    const text = "[[mw:node:only-family|缺节点]]"
    assert.ok(text.match(MW_LINK_RE))
    assert.equal(parseInternalLink("node", "only-family", "缺节点", text), null)
  })
})

describe("parseInternalLink", () => {
  it("conv：单 id 段合法", () => {
    const p = parseInternalLink("conv", "m_123_abc", "标题", "[[mw:conv:m_123_abc|标题]]")
    assert.deepEqual(p, {
      type: "conv",
      ids: ["m_123_abc"],
      title: "标题",
      raw: "[[mw:conv:m_123_abc|标题]]",
    })
  })

  it("node：双 id 段合法（族 + 节点）", () => {
    const p = parseInternalLink("node", "fam_a:b_1", "待办", "[[mw:node:fam_a:b_1|待办]]")
    assert.deepEqual(p?.ids, ["fam_a", "b_1"])
  })

  it("段数不符 / 空段 / 未知类型返回 null", () => {
    assert.equal(parseInternalLink("conv", "a:b", "标题", "raw"), null)
    assert.equal(parseInternalLink("node", "only-one", "标题", "raw"), null)
    assert.equal(parseInternalLink("conv", "", "标题", "raw"), null)
    assert.equal(parseInternalLink("conv", "a", "", "raw"), null)
    assert.equal(parseInternalLink("unknown", "a", "标题", "raw"), null)
  })
})
