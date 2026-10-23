import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // 纯前端个人工作台（数据存 localStorage），无服务端需求：静态导出产出 out/，
  // 可被任意静态服务器托管（见 scripts/serve-static.mjs）；注意：不兼容 `next start`。
  output: "export",
  images: {
    unoptimized: process.env.NEXT_PUBLIC_UNOPTIMIZED_IMAGES === 'true',     // GitHub Pages 不支持 Next.js 图片优化
  },
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  assetPrefix: process.env.NEXT_PUBLIC_ASSET_PREFIX || '',
}

export default nextConfig

