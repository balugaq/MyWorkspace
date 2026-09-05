#!/usr/bin/env node
/**
 * 开发流程启动器：同时拉起 `next dev` 与本地天气代理。
 *
 * 原因：本项目 output:"export" 静态导出，无法使用 Next Route Handler 提供
 * /api/weather；天气数据改由独立 Node 代理（scripts/weather-proxy-lib.mjs）
 * 在 :3005 提供，前端开发期直连 http://127.0.0.1:3005。
 *
 * 用法：npm run dev  （predev 会自动跑更新依赖脚本）
 * 单独启动代理：npm run dev:weather
 */
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"
import { startWeatherProxy } from "./weather-proxy-lib.mjs"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const WEATHER_PORT = Number(process.env.WEATHER_PROXY_PORT) || 3005
const NEXT_PORT = Number(process.env.PORT) || 3000

// 开发期 next dev 无法托管 /api/weather（静态导出禁用 Route Handler），
// 故天气走独立 :3005 代理；注入基址让前端（编译期读取 NEXT_PUBLIC_*）指向它。
// 生产静态托管（serve-static.mjs）已同源内置该接口，无需此变量。
process.env.NEXT_PUBLIC_WEATHER_PROXY =
  process.env.NEXT_PUBLIC_WEATHER_PROXY || `http://127.0.0.1:${WEATHER_PORT}`

// 1) 天气代理
const weatherServer = startWeatherProxy(WEATHER_PORT)
weatherServer.on("error", (e) => {
  console.error(`[天气代理] 启动失败:`, e.message)
})

// 2) next dev（直接调用 next 的 bin，避免依赖 npx 解析）
const nextBin = resolve(ROOT, "node_modules/next/dist/bin/next")
const next = spawn(process.execPath, [nextBin, "dev", "-p", String(NEXT_PORT)], {
  cwd: ROOT,
  stdio: "inherit",
})

function shutdown(code) {
  try {
    weatherServer.close()
  } catch {}
  try {
    next.kill()
  } catch {}
  process.exit(code ?? 0)
}
process.on("SIGINT", () => shutdown(0))
process.on("SIGTERM", () => shutdown(0))
next.on("exit", (code) => shutdown(typeof code === "number" ? code : 0))
