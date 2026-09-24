// GitHub sender（TODO 18）：扫描配置仓库的 commit / issue / PR / release，
// 产 NotificationItem 供通知中心入库。纯 fetch，无第三方依赖。
//
// 令牌：复用 settings.githubToken（见 lib/types.ts / lib/gh-card.ts 的 Bearer 用法）；
// 未填则匿名。撞 403/429 且 x-ratelimit-remaining === "0" 时视为限流：
// 置 rateLimited=true 并立即中止剩余请求（已拿到的部分照常返回），下轮再试。
//
// 幂等去重键（NotificationItem.id）：
//   gh:commit:{owner}/{repo}:{sha} | gh:issue:{owner}/{repo}:{number}
//   gh:pr:{owner}/{repo}:{number}  | gh:release:{owner}/{repo}:{id}

import type { NotificationItem, NotificationRepoConfig } from "@/lib/types"

const API_BASE = "https://api.github.com"
const TITLE_MAX = 120
const BRIEF_MAX = 200

export interface GithubScanOptions {
  /** 每仓库独立配置：owner/name + 该仓库自己的扫描类型开关 */
  repos: NotificationRepoConfig[]
  token: string // PAT；空串 = 匿名
}

export interface GithubScanResult {
  items: NotificationItem[]
  rateLimited: boolean
}

// ---- GitHub REST 响应的最小类型面（只取用到的字段） ----

interface GhCommit {
  sha: string
  html_url: string
  commit: {
    message: string
    author: { name: string; date: string } | null
    committer: { name: string; date: string } | null
  }
}

interface GhIssue {
  number: number
  title: string
  html_url: string
  user: { login: string } | null
  created_at: string
  body?: string | null
  pull_request?: Record<string, unknown>
}

interface GhRelease {
  id: number
  name: string | null
  tag_name: string
  html_url: string
  body?: string | null
  author: { login: string } | null
  published_at: string | null
  created_at: string
}

// ---- 工具函数 ----

function ghHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" }
  const t = token.trim()
  if (t) headers.Authorization = `Bearer ${t}`
  return headers
}

/** 首行截断：取第一行非空文本，trim 后按 max 截断。 */
function firstLine(text: string | null | undefined, max: number): string {
  if (!text) return ""
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  if (!line) return ""
  return line.length > max ? line.slice(0, max) + "…" : line
}

/**
 * 单请求取 JSON：网络错误 / 非 2xx 抛错（调用方 catch 跳过该请求）；
 * 403/429 且限流额度耗尽时置 state.rateLimited 并抛错。
 */
async function fetchJson(
  url: string,
  token: string,
  state: { rateLimited: boolean }
): Promise<unknown> {
  const res = await fetch(url, { headers: ghHeaders(token) })
  if (res.status === 403 || res.status === 429) {
    if (res.headers.get("x-ratelimit-remaining") === "0") {
      state.rateLimited = true
    }
    throw new Error(`GitHub API HTTP ${res.status}`)
  }
  if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`)
  return (await res.json()) as unknown
}

// ---- 各类型扫描 ----

async function scanCommits(
  repo: string,
  sinceIso: string,
  token: string,
  state: { rateLimited: boolean }
): Promise<NotificationItem[]> {
  const [owner, name] = repo.split("/")
  const url = `${API_BASE}/repos/${owner}/${name}/commits?since=${encodeURIComponent(sinceIso)}&per_page=50`
  const data = await fetchJson(url, token, state)
  if (!Array.isArray(data)) return []
  const since = Date.parse(sinceIso)
  const items: NotificationItem[] = []
  for (const raw of data) {
    const c = raw as GhCommit
    const committer = c.commit?.committer
    const author = c.commit?.author
    const actor = committer?.name || author?.name || ""
    const createdAt = committer?.date || author?.date || ""
    const at = Date.parse(createdAt)
    if (!c.sha || !createdAt || !Number.isFinite(at) || at <= since) continue
    const message = c.commit?.message ?? ""
    const lines = message.split("\n")
    const title = firstLine(lines[0], TITLE_MAX)
    // brief：次行；次行为空则回落首行
    const brief = firstLine(lines.slice(1).join("\n"), BRIEF_MAX) || firstLine(message, BRIEF_MAX)
    items.push({
      id: `gh:commit:${repo}:${c.sha}`,
      senderId: "github",
      kind: "commit",
      repo,
      title,
      brief,
      url: c.html_url,
      actor,
      createdAt,
    })
  }
  return items
}

/** issues 一个请求两类共用：有 pull_request 字段 → pr，否则 issue。since 按 updated 过滤，
 *  但「新」以 created_at > since 为准（必须再过滤一次）。 */
async function scanIssuesAndPrs(
  repo: string,
  sinceIso: string,
  token: string,
  state: { rateLimited: boolean }
): Promise<NotificationItem[]> {
  const [owner, name] = repo.split("/")
  const url = `${API_BASE}/repos/${owner}/${name}/issues?since=${encodeURIComponent(sinceIso)}&state=all&per_page=50`
  const data = await fetchJson(url, token, state)
  if (!Array.isArray(data)) return []
  const since = Date.parse(sinceIso)
  const items: NotificationItem[] = []
  for (const raw of data) {
    const it = raw as GhIssue
    const at = Date.parse(it.created_at ?? "")
    if (!it.number || !it.created_at || !Number.isFinite(at) || at <= since) continue
    const isPr = !!it.pull_request
    items.push({
      id: `gh:${isPr ? "pr" : "issue"}:${repo}:${it.number}`,
      senderId: "github",
      kind: isPr ? "pr" : "issue",
      repo,
      title: firstLine(it.title, TITLE_MAX),
      brief: firstLine(it.body, BRIEF_MAX),
      url: it.html_url,
      actor: it.user?.login ?? "",
      createdAt: it.created_at,
    })
  }
  return items
}

async function scanReleases(
  repo: string,
  sinceIso: string,
  token: string,
  state: { rateLimited: boolean }
): Promise<NotificationItem[]> {
  const [owner, name] = repo.split("/")
  const url = `${API_BASE}/repos/${owner}/${name}/releases?per_page=20`
  const data = await fetchJson(url, token, state)
  if (!Array.isArray(data)) return []
  const since = Date.parse(sinceIso)
  const items: NotificationItem[] = []
  for (const raw of data) {
    const r = raw as GhRelease
    const created = r.published_at || r.created_at || ""
    const at = Date.parse(created)
    if (!r.id || !created || !Number.isFinite(at) || at <= since) continue
    items.push({
      id: `gh:release:${repo}:${r.id}`,
      senderId: "github",
      kind: "release",
      repo,
      title: firstLine(r.name || r.tag_name, TITLE_MAX),
      brief: firstLine(r.body, BRIEF_MAX),
      url: r.html_url,
      actor: r.author?.login ?? "",
      createdAt: created,
    })
  }
  return items
}

// ---- 入口 ----

/**
 * 扫描所有配置仓库的所有启用类型。单仓库/单请求网络错误或解析异常：
 * catch 住跳过该请求继续扫其余，不让整轮失败。
 * 限流（403/429 且 remaining=0）：立即中止剩余请求，已拿到的部分照常返回。
 * 所有条目保证 createdAt > since。
 */
export async function scanGithubNotifications(
  since: number,
  opts: GithubScanOptions
): Promise<GithubScanResult> {
  const state = { rateLimited: false }
  const sinceIso = new Date(since).toISOString()
  const items: NotificationItem[] = []

  outer: for (const repoCfg of opts.repos) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repoCfg.repo.trim())) continue
    const repoName = repoCfg.repo.trim()
    // 每仓库按自己的扫描类型开关构建任务
    const tasks: Array<() => Promise<NotificationItem[]>> = []
    if (repoCfg.scanTypes.commits) tasks.push(() => scanCommits(repoName, sinceIso, opts.token, state))
    if (repoCfg.scanTypes.issues || repoCfg.scanTypes.prs)
      tasks.push(() => scanIssuesAndPrs(repoName, sinceIso, opts.token, state))
    if (repoCfg.scanTypes.releases) tasks.push(() => scanReleases(repoName, sinceIso, opts.token, state))

    for (const task of tasks) {
      if (state.rateLimited) break outer
      try {
        const found = await task()
        // 过滤 issue/pr 开关：一个请求两类共用，关闭其中一类时丢弃对应条目
        const filtered = found.filter((n) => {
          if (n.kind === "issue") return repoCfg.scanTypes.issues
          if (n.kind === "pr") return repoCfg.scanTypes.prs
          return true
        })
        items.push(...filtered)
      } catch {
        // 单请求失败：跳过继续（限流已由 state 标记）
      }
    }
  }

  return { items, rateLimited: state.rateLimited }
}
