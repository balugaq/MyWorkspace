// lib/peer-deps-check.ts 纯逻辑测试（node:test，`npm test` 跑）。
// 回归背景（2026-10-24 坑）：dependabot b9e9888 只单独升 @tiptap/extension-table
// 到 3.32.0，peer 精确要求 core@3.32.0，而 core 实装 3.30.5，npm ci ERESOLVE。
// 用例覆盖 semverSatisfies 各形态与 checkPeerDeps 的冲突/缺失/optional 语义。
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  checkPeerDeps,
  semverSatisfies,
  type Lockfile,
} from "../lib/peer-deps-check.ts"

describe("semverSatisfies", () => {
  it("精确版本：相等满足，不等不满足（本次事故形态）", () => {
    assert.equal(semverSatisfies("3.32.0", "3.32.0"), true)
    assert.equal(semverSatisfies("3.30.5", "3.32.0"), false)
    assert.equal(semverSatisfies("3.33.0", "3.32.0"), false)
  })

  it("^ 范围：同 major 满足，跨 major / 降级不满足", () => {
    assert.equal(semverSatisfies("3.32.0", "^3.0.1"), true)
    assert.equal(semverSatisfies("3.0.1", "^3.0.1"), true)
    assert.equal(semverSatisfies("4.0.0", "^3.0.1"), false)
    assert.equal(semverSatisfies("2.9.9", "^3.0.1"), false)
    // 0.x 特殊语义：^0.2.3 → [0.2.3, 0.3.0)
    assert.equal(semverSatisfies("0.2.9", "^0.2.3"), true)
    assert.equal(semverSatisfies("0.3.0", "^0.2.3"), false)
    // ^0.0.3 → 仅 0.0.3
    assert.equal(semverSatisfies("0.0.3", "^0.0.3"), true)
    assert.equal(semverSatisfies("0.0.4", "^0.0.3"), false)
  })

  it("~ 范围：同 minor 满足，跨 minor 不满足", () => {
    assert.equal(semverSatisfies("1.2.9", "~1.2.3"), true)
    assert.equal(semverSatisfies("1.3.0", "~1.2.3"), false)
    // ~0.1.2 → [0.1.2, 0.2.0)
    assert.equal(semverSatisfies("0.1.9", "~0.1.2"), true)
    assert.equal(semverSatisfies("0.2.0", "~0.1.2"), false)
  })

  it("比较运算符与组合 / 通配 / OR", () => {
    assert.equal(semverSatisfies("2.0.0", ">=1.2.3"), true)
    assert.equal(semverSatisfies("1.0.0", ">=1.2.3"), false)
    assert.equal(semverSatisfies("1.9.9", ">=1.2.3 <2.0.0"), true)
    assert.equal(semverSatisfies("2.0.0", ">=1.2.3 <2.0.0"), false)
    assert.equal(semverSatisfies("3.5.0", "*"), true)
    assert.equal(semverSatisfies("3.5.0", ""), true)
    assert.equal(semverSatisfies("1.9.0", "^1.0.0 || ^2.0.0"), true)
    assert.equal(semverSatisfies("3.0.0", "^1.0.0 || ^2.0.0"), false)
  })

  it("真实生态 range 形态：空格黏合 / hyphen / x-range / 部分版本", () => {
    // 操作符与版本号之间有空格（react-i18next / express-rate-limit 的 peer）
    assert.equal(semverSatisfies("26.4.7", ">= 26.2.0"), true)
    assert.equal(semverSatisfies("19.2.4", ">= 16.8.0"), true)
    assert.equal(semverSatisfies("4.11.5", ">= 4.11"), true)
    assert.equal(semverSatisfies("4.10.0", ">= 4.11"), false)
    // hyphen range（d3-transition 的 peer "2 - 3"）
    assert.equal(semverSatisfies("3.0.0", "2 - 3"), true)
    assert.equal(semverSatisfies("2.9.9", "2 - 3"), true)
    assert.equal(semverSatisfies("1.5.0", "2 - 3"), false)
    assert.equal(semverSatisfies("3.1.0", "2 - 3"), false)
    // x-range（styled-jsx 的 peer "17.x.x"）
    assert.equal(semverSatisfies("17.5.2", "17.x.x"), true)
    assert.equal(semverSatisfies("18.0.0", "17.x.x"), false)
    assert.equal(semverSatisfies("1.5.0", "1.x"), true)
    assert.equal(semverSatisfies("2.0.0", "1.x"), false)
    // 部分版本 ^ / ~（^18 → [18.0.0, 19.0.0)）
    assert.equal(semverSatisfies("18.9.0", "^18"), true)
    assert.equal(semverSatisfies("19.0.0", "^18"), false)
    assert.equal(semverSatisfies("0.5.0", "~0"), true) // ~0 → [0, 1.0.0)
    assert.equal(semverSatisfies("1.0.0", "~0"), false)
  })

  it("prerelease 小于同版正式版（npm 严格语义）", () => {
    assert.equal(semverSatisfies("3.32.0-beta.1", "3.32.0"), false)
    // npm semver：range 无同元组 prerelease 比较器时不匹配 prerelease 版本
    assert.equal(semverSatisfies("3.32.0-beta.1", "^3.32.0"), false)
  })

  it("不认识的语法直接抛错（宁可红不可漏检）", () => {
    assert.throws(() => semverSatisfies("1.0.0", "latest"))
    assert.throws(() => semverSatisfies("1.0.0", "abc-1.2.3"))
  })
})

describe("checkPeerDeps", () => {
  it("本次事故形态：单包升级导致精确 peer 不匹配，必须报错", () => {
    const lock: Lockfile = {
      packages: {
        "node_modules/@tiptap/core": { version: "3.30.5" },
        "node_modules/@tiptap/extension-table": {
          version: "3.32.0",
          peerDependencies: { "@tiptap/core": "3.32.0" },
        },
      },
    }
    const errors = checkPeerDeps(lock)
    assert.equal(errors.length, 1)
    assert.match(errors[0], /@tiptap\/extension-table/)
    assert.match(errors[0], /3\.30\.5/)
  })

  it("全家对齐后零错误", () => {
    const lock: Lockfile = {
      packages: {
        "node_modules/@tiptap/core": { version: "3.32.0" },
        "node_modules/@tiptap/extension-table": {
          version: "3.32.0",
          peerDependencies: { "@tiptap/core": "3.32.0" },
        },
        "node_modules/tiptap-markdown": {
          version: "0.9.0",
          peerDependencies: { "@tiptap/core": "^3.0.1" },
        },
      },
    }
    assert.deepEqual(checkPeerDeps(lock), [])
  })

  it("optional peer 缺失跳过，存在则仍校验；非 optional 缺失报错", () => {
    const base = (peerRange: string): Lockfile => ({
      packages: {
        "node_modules/a": {
          version: "1.0.0",
          peerDependencies: { b: peerRange, c: "2.0.0" },
          peerDependenciesMeta: { c: { optional: true } },
        },
      },
    })
    // c（optional）未安装 → 跳过；b（必选）未安装 → 报错
    assert.equal(checkPeerDeps(base("^1.0.0")).length, 1)
    // b 满足、c 存在但不匹配 → 报错
    const lock = base("^1.0.0")
    lock.packages!["node_modules/b"] = { version: "1.5.0" }
    lock.packages!["node_modules/c"] = { version: "1.0.0" }
    const errors = checkPeerDeps(lock)
    assert.equal(errors.length, 1)
    assert.match(errors[0], /c@"2\.0\.0"/)
  })

  it("无关路径的嵌套副本不充当满足来源，根条目跳过", () => {
    const lock: Lockfile = {
      packages: {
        "": { version: "", peerDependencies: { a: "1.0.0" } } as never, // 根项目条目
        "node_modules/other/node_modules/a": { version: "1.0.0" },
        "node_modules/parent": {
          version: "1.0.0",
          peerDependencies: { a: "1.0.0" },
        },
      },
    }
    // parent 的兄弟位置与顶层都无 a → 报缺失；other 下的嵌套副本不参与
    const errors = checkPeerDeps(lock)
    assert.equal(errors.length, 1)
    assert.match(errors[0], /找不到该包/)
  })

  it("兄弟嵌套副本满足 range 时通过（ajv-formats / ajv 实况）", () => {
    const lock: Lockfile = {
      packages: {
        // 顶层 ajv 为 dev 旧版，不满足 ajv-formats 的 peer
        "node_modules/ajv": { version: "6.15.0", dev: true },
        "node_modules/ajv-formats": {
          version: "3.0.1",
          peerDependencies: { ajv: "^8.0.0" },
          peerDependenciesMeta: { ajv: { optional: true } },
        },
        // 兄弟嵌套副本满足 → Node 实际解析用它，不算冲突
        "node_modules/ajv-formats/node_modules/ajv": { version: "8.20.0" },
      },
    }
    assert.deepEqual(checkPeerDeps(lock), [])
  })

  it("兄弟嵌套与顶层均不满足才报错，报错指向最近副本", () => {
    const lock: Lockfile = {
      packages: {
        "node_modules/consumer": {
          version: "1.0.0",
          peerDependencies: { peer: "^2.0.0" },
        },
        "node_modules/consumer/node_modules/peer": { version: "1.0.0" },
        "node_modules/peer": { version: "1.9.0" },
      },
    }
    const errors = checkPeerDeps(lock)
    assert.equal(errors.length, 1)
    assert.match(errors[0], /consumer\/node_modules\/peer/)
  })

  it("真实 package-lock.json（当前仓库）应零错误", async () => {
    const { readFileSync } = await import("node:fs")
    const lock = JSON.parse(
      readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
    ) as Lockfile
    assert.deepEqual(checkPeerDeps(lock), [])
  })
})
