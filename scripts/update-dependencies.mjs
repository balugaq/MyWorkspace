// 构建/开发前尝试更新若干 npm 依赖，以获取最新数据（如中国法定节假日 / 调休）。
// 背景：Next.js 静态导出把依赖携带的静态数据在构建时打进产物，运行时无法再更新，
// 故「自动更新」挂在 predev / prebuild 钩子。行为：离线/失败非致命仅警告；
// 设 SKIP_DEP_UPDATE=1 可整体跳过。扩展：往下方 DEPS 清单追加一项即可。

import { execSync } from "node:child_process"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

const DEPS = [
  {
    name: "lunar-javascript",
    // 用途说明（仅日志提示）
    purpose: "中国农历 / 二十四节气 / 法定节假日调休数据",
  },
]

if (process.env.SKIP_DEP_UPDATE === "1") {
  console.log("[update-deps] skipped (SKIP_DEP_UPDATE=1)")
  process.exit(0)
}

for (const dep of DEPS) {
  try {
    const pkg = require(`${dep.name}/package.json`)
    console.log(`[update-deps] current ${dep.name}@${pkg.version}; checking for updates...`)
  } catch {
    // 尚未安装也无妨，install 会拉取
  }
  try {
    // 尊重 package.json 的 ^ 版本范围：仅更新到范围内最新，避免意外的大版本 breaking change
    execSync(`npm update ${dep.name} --no-audit --no-fund`, {
      stdio: "inherit",
      timeout: 90_000,
    })
    console.log(`[update-deps] ${dep.name} is up to date.`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(
      `[update-deps] ${dep.name} update skipped/failed (offline or error) — using existing version.\n  ${msg}`
    )
  }
}
