#!/usr/bin/env node
/**
 * 开发流程启动器：同时拉起 `next dev` 与 AI 联网搜索代理。
 *
 * 天气数据（TODO 34 起）由前端直连 uapis.cn 官方接口，无需本地代理。
 * AI 搜索代理：百度千帆 AI 搜索源站无 CORS 头，独立 :3007 转发。
 *
 * 用法：npm run dev  （predev 会自动跑更新依赖脚本）
 */
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"
import { startAiSearchProxy } from "./ai-search-proxy-lib.mjs"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const AI_SEARCH_PORT = Number(process.env.AI_SEARCH_PROXY_PORT) || 3007
const NEXT_PORT = Number(process.env.PORT) || 3000

// 1) AI 联网搜索代理（百度千帆 AI 搜索）：源站无 CORS 头，独立 :3007 转发
process.env.NEXT_PUBLIC_AI_SEARCH_PROXY =
  process.env.NEXT_PUBLIC_AI_SEARCH_PROXY || `http://127.0.0.1:${AI_SEARCH_PORT}`
const aiSearchServer = startAiSearchProxy(AI_SEARCH_PORT)
aiSearchServer.on("error", (e) => {
  console.error(`[AI 搜索代理] 启动失败:`, e.message)
})

// 2) next dev（直接调用 next 的 bin，避免依赖 npx 解析）
const nextBin = resolve(ROOT, "node_modules/next/dist/bin/next")
const next = spawn(process.execPath, [nextBin, "dev", "-p", String(NEXT_PORT)], {
  cwd: ROOT,
  stdio: "inherit",
})

function shutdown(code) {
  try {
    aiSearchServer.close()
  } catch {}
  try {
    next.kill()
  } catch {}
  process.exit(code ?? 0)
}
process.on("SIGINT", () => shutdown(0))
process.on("SIGTERM", () => shutdown(0))
next.on("exit", (code) => shutdown(typeof code === "number" ? code : 0))
