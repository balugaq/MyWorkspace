// GitHub Issue/PR 拉取（TODO 36）：复用 github-sender 的「Bearer + 限流判定」思路，
// 但独立成模块，不改动既有通知扫描链路（github-sender.ts）。仅用原生 fetch，无第三方依赖。
//
// 幂等去重键（IssueQueueItem.id）：`iq:{repo}:{kind}:{number}`（issue 与 PR 可能同 number，故拼 kind）。

import type { IssueQueueColumn, IssueQueueItem } from "./types"

const API_BASE = "https://api.github.com"

interface GhAssignee {
  login: string
}

interface GhIssueRaw {
  number: number
  title: string
  html_url: string
  user: GhAssignee | null
  body?: string | null
  state: "open" | "closed"
  assignee?: GhAssignee | null
  assignees?: GhAssignee[] | null
  /** 有此字段即为 PR（issues API 复用 issue 条目） */
  pull_request?: { merged_at: string | null } | null
  created_at: string
  updated_at: string
}

export interface FetchIssuesResult {
  /** 已转成看板卡片，含默认归属列 */
  items: IssueQueueItem[]
  /** 达到 perPage 上限，可能还有更多未拉取（前端弹提示） */
  truncated: boolean
  rateLimited: boolean
}

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

class RateLimitError extends Error {}

async function ghFetch(
  url: string,
  token: string,
  state: { rateLimited: boolean },
): Promise<unknown> {
  const res = await fetch(url, { headers: ghHeaders(token) })
  if (res.status === 403 || res.status === 429) {
    if (res.headers.get("x-ratelimit-remaining") === "0") state.rateLimited = true
    throw new RateLimitError(`GitHub API HTTP ${res.status}`)
  }
  if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`)
  return (await res.json()) as unknown
}

/** 取当前登录用户名（用于判断 issue 是否 assign 给自己）；匿名 / 失败返回 null。 */
export async function fetchCurrentLogin(token: string): Promise<string | null> {
  const t = token.trim()
  if (!t) return null
  try {
    const data = (await ghFetch(`${API_BASE}/user`, t, { rateLimited: false })) as {
      login?: string
    }
    return data.login ?? null
  } catch {
    return null
  }
}

/** 原始 issue/PR → 看板卡片（含默认归属列推断）。 */
function toQueueItem(
  raw: GhIssueRaw,
  repo: string,
  currentLogin: string | null,
  onlyMine: boolean,
): IssueQueueItem {
  const isPr = !!raw.pull_request
  const merged = isPr && !!raw.pull_request?.merged_at
  const assigneeMe = currentLogin
    ? raw.assignee?.login === currentLogin ||
      (raw.assignees ?? []).some((a) => a.login === currentLogin)
    : onlyMine // 仅 Mine 模式拉到的都是 assign 给自己的
  let column: IssueQueueColumn = "backlog"
  if (raw.state === "closed" || merged) column = "completed"
  else if (assigneeMe) column = "assigned"
  return {
    id: `iq:${repo}:${isPr ? "pr" : "issue"}:${raw.number}`,
    kind: isPr ? "pr" : "issue",
    repo,
    number: raw.number,
    title: raw.title,
    bodySnippet: firstLine(raw.body, 200),
    actor: raw.user?.login ?? "",
    htmlUrl: raw.html_url,
    state: raw.state,
    merged,
    assigneeMe,
    column,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

/**
 * 拉取某仓库的 issue/PR（issues API 同时返回 PR，以 `pull_request` 字段区分）。
 * @param perPage 单次上限（默认 100，也是 API 上限）。达到上限视为 truncated。
 * @param onlyMine 仅拉 assign 给当前用户的（API `assignee=@me`，需已填 token 否则 401）。
 */
export async function fetchRepoIssues(
  repo: string,
  opts: { onlyMine?: boolean; token: string; perPage?: number; currentLogin?: string | null },
): Promise<FetchIssuesResult> {
  const [owner, name] = repo.split("/")
  if (!owner || !name) throw new Error("仓库格式应为 owner/name")
  const perPage = opts.perPage ?? 100
  let url = `${API_BASE}/repos/${owner}/${name}/issues?state=all&per_page=${perPage}`
  if (opts.onlyMine) url += "&assignee=@me"
  const state = { rateLimited: false }
  try {
    const data = await ghFetch(url, opts.token, state)
    const arr = Array.isArray(data) ? (data as GhIssueRaw[]) : []
    const items = arr.map((r) =>
      toQueueItem(r, repo, opts.currentLogin ?? null, !!opts.onlyMine),
    )
    return { items, truncated: arr.length >= perPage, rateLimited: state.rateLimited }
  } catch (e) {
    if (e instanceof RateLimitError) throw new Error("RATE_LIMITED")
    throw e
  }
}
