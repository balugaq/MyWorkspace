// CI 首步（npm ci 之前）跑 peer 依赖一致性检查：只读 package-lock.json，无 node_modules 依赖。
// 用法：npm run check:peer-deps
// 背景：2026-10-24 dependabot b9e9888 单包升 extension-table 导致 npm ci ERESOLVE，
// 且 PR 上无 CI 拦截。本脚本让坏 lock 在 PR 上秒级红灯。
import { readFileSync } from "node:fs"
import { checkPeerDeps } from "../lib/peer-deps-check.ts"

const lockPath = new URL("../package-lock.json", import.meta.url)
let lock: unknown
try {
  lock = JSON.parse(readFileSync(lockPath, "utf8"))
} catch (err) {
  console.error(`peer 依赖检查：package-lock.json 读取/解析失败: ${(err as Error).message}`)
  process.exit(1)
}

const errors = checkPeerDeps(lock as never)
if (errors.length > 0) {
  console.error(`peer 依赖一致性检查失败（${errors.length} 处）：`)
  for (const e of errors) console.error(`  - ${e}`)
  console.error("\n修复方式：保持同一家族包版本对齐（如 @tiptap/* 全家统一），或整体重装：")
  console.error("  rm package-lock.json && npm install")
  process.exit(1)
}
console.log("peer 依赖一致性检查通过。")
