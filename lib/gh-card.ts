"use client"

/**
 * GitHub Issue / PR / Release 预览卡数据层。
 *
 * 设计（与需求「1+3 结合 + 缓存 + 定时刷新」一致）：
 *  - 缩略图：GitHub 的 Open Graph 图服务地址直接作为 <img> 热链，零 API、不受 CORS 限制。
 *    官方 og:image 路径：`https://opengraph.githubassets.com/<hash>/<owner>/<repo>/issues|pull|releases/<id>`
 *    （issue 复数、pull 单数——与 GitHub 页面自身的 og:image 一致）。
 *    <hash> 仅作缓存版本串，固定填 1 即可；需强制刷新改它。
 *  - 元数据：issue/PR 走 `api.github.com/repos/{o}/{r}/issues/{n}`（issues API 兼容 PR）；
 *    release 走 `releases/tags/{tag}` 或 `releases/{id}`。带用户设置里的 GitHub 令牌以提升限额。
 *  - 缓存：元数据与 OG 图 blob 都存 IndexedDB，缓存有效期 CACHE_MS，过期重新拉取（即「定时刷新、少访问」）。
 *
 * 注意：OG 图用 fetch 取 blob 缓存时可能命中 CORS（opengraph.githubassets.com 不一定返回 ACAO），
 * 因此失败时回退为直接热链（浏览器按 HTTP 缓存）。
 */

export interface GithubRef {
  owner: string
  repo: string
  type: "issue" | "pull" | "release"
  /** issue / PR 编号；release 为数字 id（tag 形式链接时缺省，由 API 解析回填） */
  num?: number
  /** release 按 tag 形式链接时的 tag 名 */
  tag?: string
}

// (issues|pull) 必须是捕获组：类型要从 m[3] 取、编号从 m[4] 取。
// 此前写成非捕获组导致 m[4] 为 undefined → num=NaN → API 404（卡片「未知」+ #NaN）+ OG 地址非法（回落仓库图）。
const GH_RE = /https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(issues|pull)\/(\d+)/i
// release 两种链接：/releases/tag/{tag} 与 /releases/{id}；tag/编号后必须跟 / ? # 或结尾，避免误截
const GH_RELEASE_RE =
  /https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/releases\/(?:tag\/([^/?#]+)|(\d+))(?=[/?#]|$)/i

export function parseGithubUrl(url: string): GithubRef | null {
  const u = url.trim()
  const m = GH_RE.exec(u)
  if (m) {
    return {
      owner: m[1],
      repo: m[2],
      type: m[3].toLowerCase() === "pull" ? "pull" : "issue",
      num: Number(m[4]),
    }
  }
  const r = GH_RELEASE_RE.exec(u)
  if (r) {
    return {
      owner: r[1],
      repo: r[2],
      type: "release",
      num: r[4] ? Number(r[4]) : undefined,
      tag: r[3],
    }
  }
  return null
}

export function isGithubIssueUrl(url: string): boolean {
  return parseGithubUrl(url) !== null
}

export interface GithubCardData {
  url: string
  title: string
  state: string // open | closed | release | unknown
  labels: { name: string; color: string }[]
  htmlUrl: string
  ogImage: string
}

/** OG 缩略图地址（GitHub 官方 og:image 同款路径）。release 无数字 id（tag 形式且 API 未解析）时回落仓库卡。 */
function ogImageUrl(ref: GithubRef): string {
  const base = `https://opengraph.githubassets.com/1/${ref.owner}/${ref.repo}`
  if (ref.type === "issue") return `${base}/issues/${ref.num}`
  if (ref.type === "pull") return `${base}/pull/${ref.num}`
  return ref.num ? `${base}/releases/${ref.num}` : base
}

const CACHE_MS = 6 * 60 * 60 * 1000
// 缓存键版本：v1 缓存里存着 num=NaN 时期的降级数据与非法 ogImage，直接作废不读
const CARD_KEY_PREFIX = "v2:"

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
    const r = tx.objectStore("cards").get(CARD_KEY_PREFIX + url)
    r.onsuccess = () => res((r.result as CachedCard) ?? null)
    r.onerror = () => rej(r.error)
  })
}

async function writeCard(rec: CachedCard): Promise<void> {
  const db = await openDB()
  return new Promise((res, rej) => {
    const tx = db.transaction("cards", "readwrite")
    tx.objectStore("cards").put({ ...rec, url: CARD_KEY_PREFIX + rec.url })
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
  if (!ref) throw new Error("不是 GitHub 链接")
  const cached = await readCard(url).catch(() => null)
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.data

  // API 端点按类型分派：issue/PR 共用 issues/{n}；release 用 tag 或 id 解析
  const api =
    ref.type === "issue" || ref.type === "pull"
      ? `https://api.github.com/repos/${ref.owner}/${ref.repo}/issues/${ref.num}`
      : ref.tag
        ? `https://api.github.com/repos/${ref.owner}/${ref.repo}/releases/tags/${encodeURIComponent(ref.tag)}`
        : `https://api.github.com/repos/${ref.owner}/${ref.repo}/releases/${ref.num}`
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" }
  if (token) headers["Authorization"] = `Bearer ${token}`

  let data: GithubCardData
  try {
    const resp = await fetch(api, { headers })
    if (!resp.ok) throw new Error("github api " + resp.status)
    const j = await resp.json()
    if (ref.type === "release") {
      // release：标题取 name（缺省 tag_name），tag 作为胶囊标签展示；
      // OG 图用数字 id 形式（releases/{id}），API 未给出 id 时回落仓库卡
      const id = typeof j.id === "number" ? j.id : undefined
      data = {
        url,
        title: (j.name || j.tag_name || "") as string,
        state: "release",
        labels: [{ name: (j.tag_name ?? ref.tag ?? "release") as string, color: "6366f1" }],
        htmlUrl: (j.html_url ?? url) as string,
        ogImage: id
          ? `https://opengraph.githubassets.com/1/${ref.owner}/${ref.repo}/releases/${id}`
          : ogImageUrl({ ...ref, num: undefined }),
      }
    } else {
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
        ogImage: ogImageUrl(ref),
      }
    }
  } catch {
    // 降级：仅图，无元数据
    data = {
      url,
      title:
        ref.type === "release"
          ? `${ref.owner}/${ref.repo} ${ref.tag ? `@ ${ref.tag}` : `release ${ref.num ?? ""}`}`.trim()
          : `${ref.owner}/${ref.repo} #${ref.num}`,
      state: "unknown",
      labels: [],
      htmlUrl: url,
      ogImage: ogImageUrl(ref),
    }
  }
  await writeCard({ url, data, ts: Date.now() }).catch(() => {})
  return data
}
