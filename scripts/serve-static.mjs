#!/usr/bin/env node
/**
 * 本地静态服务器 —— 托管 `next build`（output: "export"）产出的 `out/` 目录。
 *
 * 零依赖实现（仅用 Node.js 内置 http/fs/path），跨平台可用。
 * 用法：
 *   node scripts/serve-static.mjs            # 默认端口 3000，目录 ./out
 *   node scripts/serve-static.mjs 8080       # 指定端口
 *   node scripts/serve-static.mjs 8080 dist  # 指定端口与目录
 *
 * 输入 `Ctrl+C` 停止。
 */

import { createServer } from "node:http"
import { readFile, stat } from "node:fs/promises"
import { extname, join, normalize, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const root = ROOT // 项目根目录

function parseArgs(argv) {
  const portArg = Number(argv[2])
  const port = Number.isInteger(portArg) && portArg > 0 ? portArg : 3000
  const dirArg = argv[3]
  const publicDir = dirArg ? resolve(root, dirArg) : join(ROOT, "out")
  return { port, publicDir }
}

const { port, publicDir } = parseArgs(process.argv)

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
}

function contentType(path) {
  return MIME[extname(path).toLowerCase()] ?? "application/octet-stream"
}

// 简单路径穿越防护：规范化后必须仍位于 publicDir 内
function safePath(urlPathname, baseDir) {
  const decoded = decodeURIComponent(urlPathname.split("?")[0])
  const candidate = normalize(join(baseDir, decoded))
  if (!candidate.startsWith(baseDir)) return null
  return candidate
}

const server = createServer(async (req, res) => {
  try {
    const reqPath = (req.url ?? "/").split("?")[0]
    // 目录内真实文件；若不存在则回退到 index.html（支持 SPA 直链）
    let file = safePath(reqPath, publicDir)
    if (!file) {
      res.writeHead(403)
      res.end("Forbidden")
      return
    }

    let found = false
    let pathToServe = file
    try {
      const s = await stat(pathToServe)
      if (s.isDirectory()) {
        pathToServe = join(pathToServe, "index.html")
      }
    } catch {
      // 文件不存在，走 SPA fallback
    }

    try {
      const s = await stat(pathToServe)
      found = s.isFile()
    } catch {
      found = false
    }

    if (!found) {
      // SPA fallback：一律回退到根 index.html
      const fallback = join(publicDir, "index.html")
      const s = await stat(fallback).catch(() => null)
      if (!s) {
        res.writeHead(404)
        res.end("Not Found")
        return
      }
      pathToServe = fallback
    }

    const body = await readFile(pathToServe)
    res.writeHead(200, {
      "Content-Type": contentType(pathToServe),
      "Content-Length": body.length,
      "Cache-Control": pathToServe.endsWith(".html") ? "no-cache" : "public, max-age=3600",
    })
    res.end(body)
  } catch (err) {
    res.writeHead(500)
    res.end("Internal Server Error")
    console.error(err)
  }
})

server.listen(port, () => {
  console.log(`✔ 已启动本地静态服务器`)
  console.log(`  地址:  http://127.0.0.1:${port}`)
  console.log(`  目录:  ${publicDir}`)
  console.log(`  停止:  请按 Ctrl+C`)
})
