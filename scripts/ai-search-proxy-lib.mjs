// ============================================================
// ai-search-proxy-lib.mjs — AI 联网搜索本地代理（零依赖，纯 Node）
//
// 为什么需要它：百度千帆 AI 搜索接口（qianfan.baidubce.com/v2/ai_search/
// chat/completions）不返回 Access-Control-Allow-Origin 头，浏览器直连会被
// CORS 拦截；且本项目为静态导出（output:"export"）无法使用 Next Route
// Handler，故与天气/新闻代理同一模式：本地 Node 进程转发，再回给前端。
//
// 与天气/新闻代理的区别：搜索 Key 存在前端设置里，随请求体带给本机代理，
// 由本机代持转发（Key 不落盘、不出本机）。
// ============================================================
import { createServer } from "node:http"

const AI_SEARCH_URL = "https://qianfan.baidubce.com/v2/ai_search/chat/completions"

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  })
  res.end(body)
}

/** 调用千帆 AI 搜索：返回 { answer, references }（均为可 JSON 序列化的纯数据） */
async function aiSearch(key, query, recency) {
  const body = {
    // 检索+整理模型由千帆侧默认；开关类参数保持默认以控制耗时与计费
    messages: [{ role: "user", content: query }],
    search_source: "baidu_search_v2",
  }
  if (recency) body.search_recency_filter = recency
  const resp = await fetch(AI_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // 两种鉴权头都带上：官方文档同时出现过 Authorization 与 X-Appbuilder-Authorization
      Authorization: `Bearer ${key}`,
      "X-Appbuilder-Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "")
    throw new Error(
      `千帆 AI 搜索返回 ${resp.status}${detail ? `：${detail.slice(0, 300)}` : ""}`
    )
  }
  const j = await resp.json()
  const answer = j?.choices?.[0]?.message?.content ?? ""
  const rawRefs = Array.isArray(j?.references) ? j.references : []
  const references = rawRefs.slice(0, 10).map((r) => ({
    id: r?.id,
    title: typeof r?.title === "string" ? r.title : "",
    url: typeof r?.url === "string" ? r.url : "",
    content: typeof r?.content === "string" ? r.content.slice(0, 500) : "",
    date: typeof r?.date === "string" ? r.date : "",
    website: typeof r?.website === "string" ? r.website : "",
  }))
  return { answer, references }
}

/** 处理 AI 搜索代理请求（POST /api/ai-search，body { key, query, recency? }）；返回 true 表示已处理 */
export async function handleAiSearchRequest(req, res, url) {
  if (url.pathname !== "/api/ai-search") return false
  try {
    let payload = ""
    for await (const chunk of req) payload += chunk
    const { key, query, recency } = JSON.parse(payload || "{}")
    if (!key?.trim()) {
      sendJson(res, 400, { error: "缺少 key（设置 → AI 助手 → 联网搜索 API Key）" })
      return true
    }
    if (!query?.trim()) {
      sendJson(res, 400, { error: "缺少 query" })
      return true
    }
    sendJson(res, 200, await aiSearch(key.trim(), query.trim(), recency))
  } catch (e) {
    sendJson(res, 502, { error: e instanceof Error ? e.message : String(e) })
  }
  return true
}

/** 启动 AI 搜索代理 HTTP 服务（独立端口），返回 server 实例 */
export function startAiSearchProxy(port = 3007) {
  const server = createServer(async (req, res) => {
    try {
      // CORS 预检：技能用 POST + application/json（非简单请求），浏览器会先发 OPTIONS。
      // 不正确应答预检（缺 Allow-Methods / Allow-Headers），浏览器会直接报
      // "Failed to fetch"，连真正的 POST 都不会发出。
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        })
        res.end()
        return
      }
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`)
      const handled = await handleAiSearchRequest(req, res, url)
      if (!handled) {
        res.writeHead(404)
        res.end("Not Found")
      }
    } catch (err) {
      res.writeHead(500)
      res.end("Internal Server Error")
      console.error("[ai-search-proxy] 处理失败:", err)
    }
  })
  server.listen(port, () => {
    console.log(`✔ AI 搜索代理已启动  http://127.0.0.1:${port}/api/ai-search`)
  })
  return server
}
