import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // 本应用为纯前端个人工作台（数据存于浏览器 localStorage），无服务端数据需求，
  // 采用静态导出（output: "export"）：`next build` 直接产出 `out/` 静态站点，
  // 可被任意静态服务器托管，也便于本地一键部署（见 scripts/serve-static.mjs）。
  // 注意：启用 static export 后不兼容 `next start` 服务端运行。
  output: "export",
}

export default nextConfig

