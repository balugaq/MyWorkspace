// 在 `next build` 产出 `out/` 后，为所有 HTML 注入严格 CSP（postbuild 自动执行）。
//
// 为什么用脚本注入而非写死在 layout.tsx：
// Next.js App Router 静态导出会在 <body> 注入框架自带的行内脚本（主题脚本 + RSC 流式
// `self.__next_f.push(...)`），这些是 hydration 必需的。若 `script-src` 直接设为 'self'
// 会把这些也拦掉、页面卡在「正在加载」。改用 hash 白名单——精确放行这些固定行内脚本，
// 任意其他行内脚本（含 XSS 注入）一律拒绝。而行内脚本内容每次构建都会变，故需按产物现算 hash。

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { createHash } from "node:crypto"

const OUT_DIR = "out"

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...walk(p))
    else if (name.endsWith(".html")) out.push(p)
  }
  return out
}

function sha256Base64(s) {
  return (
    "sha256-" +
    createHash("sha256").update(s, "utf8").digest("base64")
  )
}

// 匹配「无 src 属性的行内 <script>」并捕获其内容
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi
// 匹配 CSP meta 标签（占位或已注入）
const CSP_META =
  /<meta\s+http-equiv=["']?Content-Security-Policy["']?\s+content=["']([^"']*)["']\s*\/?>/i

function buildPolicy(inlineScripts) {
  const hashes = [...new Set(inlineScripts.map(sha256Base64))].join(" ")
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ")
}

let count = 0
for (const file of walk(OUT_DIR)) {
  const html = readFileSync(file, "utf8")
  if (!CSP_META.test(html)) continue
  const inlineScripts = []
  let m
  INLINE_SCRIPT.lastIndex = 0
  while ((m = INLINE_SCRIPT.exec(html)) !== null) {
    if (m[1].trim()) inlineScripts.push(m[1])
  }
  const policy = buildPolicy(inlineScripts)
  const next = html.replace(
    CSP_META,
    `<meta http-equiv="Content-Security-Policy" content="${policy}" />`,
  )
  writeFileSync(file, next, "utf8")
  count++
  console.log(
    `[inject-csp] ${file}: 放行 ${inlineScripts.length} 个行内脚本，策略已写入`,
  )
}

console.log(`[inject-csp] 完成，共处理 ${count} 个 HTML 文件`)
