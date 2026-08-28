"use client"

/**
 * GitHub Issue / PR 预览卡数据层。
 *
 * 设计（与需求「1+3 结合 + 缓存 + 定时刷新」一致）：
 *  - 缩略图：GitHub 的 Open Graph 图服务地址直接作为 <img> 热链，零 API、不受 CORS 限制。
 *    `https://opengraph.githubassets.com/<hash>/<owner>/<repo>/<issues|pull>/<n>`
 *    <hash> 仅作缓存版本串，固定填 1 即可；需强制刷新改它。
 *  - 元数据（标题/状态/标签）：走 `api.github.com/repos/{o}/{r}/issues/{n}`，
 *    带用户设置里的 GitHub 令牌（Authorization: Bearer）以提升限额；未填则匿名（60 次/小时/IP）。
 *  - 缓存：元数据与 OG 图 blob 都存 IndexedDB，缓存有效期 CACHE_MS，过期重新拉取（即「定时刷新、少访问」）。
 *
 * 注意：OG 图用 fetch 取 blob 缓存时可能命中 CORS（opengraph.githubassets.com 不一定返回 ACAO），
 * 因此失败时回退为直接热链（浏览器按 HTTP 缓存）。
 */

export interface GithubRef {
  owner: string
  repo: string
  type: "issue" | "pull"
  num: number
}

const GH_RE = /https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(?:issues|pull)\/(\d+)/i

export function parseGithubUrl(url: string): GithubRef | null {
  const m = GH_RE.exec(url.trim())
  if (!m) return null
  return {
    owner: m[1],
    repo: m[2],
    type: m[3].toLowerCase() === "pull" ? "pull" : "issue",
    num: Number(m[4]),
  }
}

export function isGithubIssueUrl(url: string): boolean {
  return parseGithubUrl(url) !== null
}

export interface GithubCardData {
  url: string
  title: string
  state: string // open | closed | unknown
  labels: { name: string; color: string }[]
  htmlUrl: string
  ogImage: string
}

const CACHE_MS = 6 * 60 * 60 * 1000

let dbp: Promise<IDBDatabase> | null = null
function openDB(): Promise<IDBDatabase> {
  if (dbp) return dbp
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open("workspace-gh", 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains("cards")) db.createObjectStore("cards", { keyPath: "url" })
      if (!db.objectStoreNames.contains("imgs")) db.createObjectStore("imgs", { keyPath: "url" })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbp
}

interface CachedCard {
  url: string
  data: GithubCardData
  ts: number
}
interface CachedImg {
  url: string
  blob: Blob
  ts: number
}

async function readCard(url: string): Promise<CachedCard | null> {
  const db = await openDB()
  return new Promise((res, rej) => {
    const tx = db.transaction("cards", "readonly")
    const r = tx.objectStore("cards").get(url)
    r.onsuccess = () => res((r.result as CachedCard) ?? null)
    r.onerror = () => rej(r.error)
  })
}

async function writeCard(rec: CachedCard): Promise<void> {
  const db = await openDB()
  return new Promise((res, rej) => {
    const tx = db.transaction("cards", "readwrite")
    tx.objectStore("cards").put(rec)
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
}

async function readImg(url: string): Promise<CachedImg | null> {
  const db = await openDB()
  return new Promise((res, rej) => {
    const tx = db.transaction("imgs", "readonly")
    const r = tx.objectStore("imgs").get(url)
    r.onsuccess = () => res((r.result as CachedImg) ?? null)
    r.onerror = () => rej(r.error)
  })
}

async function writeImg(rec: CachedImg): Promise<void> {
  const db = await openDB()
  return new Promise((res, rej) => {
    const tx = db.transaction("imgs", "readwrite")
    tx.objectStore("imgs").put(rec)
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
}

/** 取 OG 缩略图的展示 src：优先用缓存 blob，否则直接热链（并后台尝试缓存） */
export async function getOgImageSrc(ogUrl: string): Promise<string> {
  const cached = await readImg(ogUrl).catch(() => null)
  if (cached && Date.now() - cached.ts < CACHE_MS) {
    return URL.createObjectURL(cached.blob)
  }
  // 后台尝试缓存 blob（CORS 失败则忽略，继续使用直链）
  fetch(ogUrl)
    .then((r) => (r.ok ? r.blob() : null))
    .then((blob) => {
      if (blob) writeImg({ url: ogUrl, blob, ts: Date.now() }).catch(() => {})
    })
    .catch(() => {})
  return ogUrl
}

/** 拉取预览卡数据：先读缓存，过期或缺失再请求 GitHub API */
export async function fetchGithubCard(url: string, token?: string): Promise<GithubCardData> {
  const ref = parseGithubUrl(url)
  if (!ref) throw new Error("不是 GitHub Issue/PR 链接")
  const ogImage = `https://opengraph.githubassets.com/1/${ref.owner}/${ref.repo}/${ref.type}/${ref.num}`
  const cached = await readCard(url).catch(() => null)
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.data

  const api = `https://api.github.com/repos/${ref.owner}/${ref.repo}/issues/${ref.num}`
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" }
  if (token) headers["Authorization"] = `Bearer ${token}`

  let data: GithubCardData
  try {
    const resp = await fetch(api, { headers })
    if (!resp.ok) throw new Error("github api " + resp.status)
    const j = await resp.json()
    data = {
      url,
      title: j.title ?? "",
      state: j.state ?? "open",
      labels: Array.isArray(j.labels)
        ? j.labels.map((l: { name?: string; color?: string }) => ({
            name: l.name ?? "",
            color: l.color ?? "888888",
          }))
        : [],
      htmlUrl: j.html_url ?? url,
      ogImage,
    }
  } catch {
    // 降级：仅图，无元数据
    data = {
      url,
      title: `${ref.owner}/${ref.repo} #${ref.num}`,
      state: "unknown",
      labels: [],
      htmlUrl: url,
      ogImage,
    }
  }
  await writeCard({ url, data, ts: Date.now() }).catch(() => {})
  return data
}
