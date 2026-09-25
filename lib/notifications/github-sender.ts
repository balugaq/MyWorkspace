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
import { LEGACY_REPO_SCAN_SINCE } from "@/lib/types"

const API_BASE = "https://api.github.com"
const TITLE_MAX = 120
const BRIEF_MAX = 200

export interface GithubScanOptions {
  /** 每仓库独立配置：owner/name + 该仓库自己的扫描类型开关 */
  repos: NotificationRepoConfig[]
  token: string // PAT；空串 = 匿名
  /** 已入库的通知 id 集合：用于 issue/PR 状态变化事件的判定（如 reopen 需要「见过关闭」） */
  knownIds: Set<string>
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
  updated_at: string
  /** issue/PR 当前状态（列表 API 只给当前态，不给事件流） */
  state: "open" | "closed"
  /** 关闭时间（issue 与 PR 都有；重新打开后再次关闭会更新） */
  closed_at: string | null
  body?: string | null
  /** 有此字段即为 PR（列表 API 的 PR 复用 issue 条目）；merged_at 非空表示已合并 */
  pull_request?: { merged_at: string | null } | null
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

/**
 * commit 扫描：**不用** since 参数过滤——committer date 是「提交完成」的时间，
 * 不是「推送到 GitHub」的时间（先写好再 push 的 commit，committer date 会早于推送时刻，
 * 落在水线之前被 since 过滤漏掉）。改为拉最近 50 条 + sha 去重：
 *  - committer date > since 的（正常节奏：写完就推）→ 直接通知；
 *  - committer date ≤ since 但 sha 未见过 → 仅当该仓库此前已有 commit 入库记录时通知
 *    （晚推送的旧 commit）；首次扫描一个新仓库时不回溯历史，避免把旧 commit 全部当新通知刷屏。
 * 热力图入账仍用 committer date（落在写代码那天的格子里）。
 */
async function scanCommits(
  repo: string,
  sinceIso: string,
  token: string,
  state: { rateLimited: boolean },
  knownIds: Set<string>
): Promise<NotificationItem[]> {
  const [owner, name] = repo.split("/")
  const url = `${API_BASE}/repos/${owner}/${name}/commits?per_page=50`
  const data = await fetchJson(url, token, state)
  if (!Array.isArray(data)) return []
  const since = Date.parse(sinceIso)
  // 该仓库是否已有 commit 入库过（防首次扫描回溯刷屏）
  const commitPrefix = `gh:commit:${repo}:`
  let hasHistory = false
  for (const id of knownIds) {
    if (id.startsWith(commitPrefix)) {
      hasHistory = true
      break
    }
  }
  const items: NotificationItem[] = []
  for (const raw of data) {
    const c = raw as GhCommit
    // 注意：这里用的是 **commit date**（committer.date，即最终落到 GitHub 时间线上的时间），
    // 不是 author.date（原始撰写时间，rebase/amend 后会保留旧值）。
    const committer = c.commit?.committer
    const author = c.commit?.author
    const actor = committer?.name || author?.name || ""
    const createdAt = committer?.date || author?.date || ""
    const at = Date.parse(createdAt)
    if (!c.sha || !createdAt || !Number.isFinite(at)) continue
    const id = `gh:commit:${repo}:${c.sha}`
    const seen = knownIds.has(id)
    // 通知判定：新提交（committer date 在窗口内） 或 晚推送的未见 commit（该仓库有历史时）
    if (at <= since && (seen || !hasHistory)) continue
    const message = c.commit?.message ?? ""
    const lines = message.split("\n")
    const title = firstLine(lines[0], TITLE_MAX)
    // brief：次行；次行为空则回落首行
    const brief = firstLine(lines.slice(1).join("\n"), BRIEF_MAX) || firstLine(message, BRIEF_MAX)
    items.push({
      id,
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

/** issues 一个请求两类共用：有 pull_request 字段 → pr，否则 issue。since 按 updated 过滤。
 *
 * 事件判定（列表 API 只给「当前态」，不给事件流，因此按当前态 + 时间戳推断）：
 *  - created_at > since                       → open（新建）
 *  - closed_at > since（未合并）              → close（关闭；closed_at 稳定，id 不带时间戳 → 同次转换只通知一次）
 *  - PR 且 merged_at > since                  → merge（合并）
 *  - state=open 且曾关闭（closed_at 非空）且 knownIds 见过 :closed/:merged → reopen（重新打开；
 *    无此条件的话，普通评论也会让 updated_at 前进，会把没关过的老 issue 误判成 reopen）
 *
 * 已知限制：issue 的 closed→open→closed 二次循环时 :closed id 已存在，第二次关闭不再通知。
 */
async function scanIssuesAndPrs(
  repo: string,
  sinceIso: string,
  token: string,
  state: { rateLimited: boolean },
  knownIds: Set<string>
): Promise<NotificationItem[]> {
  const [owner, name] = repo.split("/")
  const url = `${API_BASE}/repos/${owner}/${name}/issues?since=${encodeURIComponent(sinceIso)}&state=all&per_page=50`
  const data = await fetchJson(url, token, state)
  if (!Array.isArray(data)) return []
  const since = Date.parse(sinceIso)
  const items: NotificationItem[] = []
  for (const raw of data) {
    const it = raw as GhIssue
    if (!it.number) continue
    const isPr = !!it.pull_request
    const kindBase = isPr ? "pr" : "issue"
    const createdAt = Date.parse(it.created_at ?? "")
    if (!Number.isFinite(createdAt)) continue
    const updatedAt = Date.parse(it.updated_at ?? "")
    const closedAt = it.closed_at ? Date.parse(it.closed_at) : NaN
    const mergedAt = it.pull_request?.merged_at ? Date.parse(it.pull_request.merged_at) : NaN

    // 新建：open 事件，id 与旧版一致（不带后缀）
    if (createdAt > since) {
      items.push({
        id: `gh:${kindBase}:${repo}:${it.number}`,
        senderId: "github",
        kind: isPr ? "pr" : "issue",
        event: "open",
        repo,
        title: firstLine(it.title, TITLE_MAX),
        brief: firstLine(it.body, BRIEF_MAX),
        url: it.html_url,
        actor: it.user?.login ?? "",
        createdAt: it.created_at,
      })
      continue
    }

    if (!Number.isFinite(updatedAt) || updatedAt <= since) continue
    const actor = it.user?.login ?? ""

    // PR 合并：merged_at 是每次合并的稳定时间戳（id 稳定 → 去重天然生效）
    if (isPr && Number.isFinite(mergedAt) && mergedAt > since) {
      items.push({
        id: `gh:pr:${repo}:${it.number}:merged`,
        senderId: "github",
        kind: "pr",
        event: "merge",
        repo,
        title: firstLine(it.title, TITLE_MAX),
        brief: `由 ${actor} 合并`,
        url: it.html_url,
        actor,
        createdAt: it.pull_request!.merged_at!,
      })
      continue
    }

    // 关闭：closed_at > since 才算本轮窗口内发生的关闭（老 issue 收到新评论不会误报）
    if (it.state === "closed" && Number.isFinite(closedAt) && closedAt > since) {
      items.push({
        id: `gh:${kindBase}:${repo}:${it.number}:closed`,
        senderId: "github",
        kind: isPr ? "pr" : "issue",
        event: "close",
        repo,
        title: firstLine(it.title, TITLE_MAX),
        brief: `由 ${actor} 关闭`,
        url: it.html_url,
        actor,
        createdAt: it.closed_at!,
      })
      continue
    }

    // 重新打开：当前 open、曾关闭过、且我们见过它的关闭（避免把普通评论误判为 reopen）
    if (
      it.state === "open" &&
      Number.isFinite(closedAt) &&
      (knownIds.has(`gh:${kindBase}:${repo}:${it.number}:closed`) ||
        knownIds.has(`gh:pr:${repo}:${it.number}:merged`))
    ) {
      items.push({
        id: `gh:${kindBase}:${repo}:${it.number}:open`,
        senderId: "github",
        kind: isPr ? "pr" : "issue",
        event: "reopen",
        repo,
        title: firstLine(it.title, TITLE_MAX),
        brief: `由 ${actor} 重新打开`,
        url: it.html_url,
        actor,
        createdAt: it.updated_at,
      })
    }
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
 * issue/PR/release 条目保证 createdAt > since；commit 可能包含「晚推送」的旧 commit
 * （committer date 早于 since 但 sha 未入库——补捞，见 scanCommits 注释）。
 */
export async function scanGithubNotifications(
  since: number,
  opts: GithubScanOptions
): Promise<GithubScanResult> {
  const state = { rateLimited: false }
  const items: NotificationItem[] = []

  outer: for (const repoCfg of opts.repos) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repoCfg.repo.trim())) continue
    const repoName = repoCfg.repo.trim()
    // 每仓库自己的扫描起点 = max(仓库配置的起点（添加/启用时刻，旧配置回落 LEGACY 值）, 全局水位)。
    // 取 max：正常轮次水位领先（只看新内容）；新启用 / 新添加的仓库从自己的起点开始，不回扫。
    const repoSince = Math.max(repoCfg.scanSince ?? LEGACY_REPO_SCAN_SINCE, since)
    const sinceIso = new Date(repoSince).toISOString()
    // 每仓库按自己的扫描类型开关构建任务
    const tasks: Array<() => Promise<NotificationItem[]>> = []
    if (repoCfg.scanTypes.commits)
      tasks.push(() => scanCommits(repoName, sinceIso, opts.token, state, opts.knownIds))
    if (repoCfg.scanTypes.issues || repoCfg.scanTypes.prs)
      tasks.push(() => scanIssuesAndPrs(repoName, sinceIso, opts.token, state, opts.knownIds))
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
