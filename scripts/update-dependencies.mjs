// 构建/开发前尝试更新若干 npm 依赖，以便获取最新数据（例如中国法定节假日 / 调休）。
//
// 背景：本项目是 Next.js 静态导出（output: "export"），依赖携带的静态数据在构建时即被打包进
// 产物，浏览器运行时无法再 npm 更新。因此「自动更新」只能放在开发机 / 部署前的构建阶段，
// 由 predev / prebuild 钩子触发。
//
// 行为：
//  - 离线或更新失败时非致命（仅警告），使用已有版本，不影响后续 dev/build 启动。
//  - 设环境变量 SKIP_DEP_UPDATE=1 可整体跳过（开发时避免每次联网/延迟）。
//
// 扩展：未来若要纳入其它需要构建期更新的依赖，只需在下方 DEPS 清单追加一项。

import { execSync } from "node:child_process"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

/** 需要在构建前尝试更新的依赖清单（未来在此追加即可） */
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
    // 尊重 package.json 中的版本范围(^)，仅更新到该范围内最新，避免意外的大版本 breaking change
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
