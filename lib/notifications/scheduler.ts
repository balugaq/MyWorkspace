// 通知调度器（TODO 20 / TODO 18）：
// - 每 5 分钟调 scanNow() 扫描配置仓库的新动态（GitHub sender），去重入库；
// - 维护活跃心跳 lastActiveAt（启动 / 每 5 分钟 / pagehide 各更新一次），
//   pagehide 的更新 ≈「关机时间」，作为下轮扫描的兜底起算点（关机期间漏扫的补上）。
// 幂等：startNotificationScheduler 模块级 flag，重复调用直接 return。

import { useWorkspace } from "@/lib/store"
import type { ContributionType, NotificationLogEntry } from "@/lib/types"
import { GH_EVENT_LABEL } from "@/lib/types"
import { scanGithubNotifications } from "./github-sender"
import { maybeRunNewsCycle } from "./news-sender"
import { dispatchNotifications } from "./channels"
import { KIND_LABEL } from "./qq-channel"

const INTERVAL_MS = 5 * 60 * 1000

let started = false
let scanning = false

/** commit/issue/pr → 贡献类型（release 不计贡献） */
const KIND_TO_CONTRIB: Record<"commit" | "issue" | "pr", ContributionType> = {
  commit: "github-commit",
  issue: "github-issue",
  pr: "github-pr",
}

export function startNotificationScheduler(): void {
  if (started) return
  started = true

  // 1. 启动立即扫一轮
  void scanNow()
  // 1.5 新闻精选（TODO 23）：随轮询检查 18:00 周期，本周期未拉过则触发（内部自带条件判断与防重入）
  void maybeRunNewsCycle()

  // 2. 每 5 分钟扫一轮
  window.setInterval(() => void scanNow(), INTERVAL_MS)
  window.setInterval(() => void maybeRunNewsCycle(), INTERVAL_MS)

  // 3. 活跃心跳：启动 / 每 5 分钟 / pagehide（≈关机时间）各更新一次 lastActiveAt
  useWorkspace.getState().setLastActiveAt(Date.now())
  window.setInterval(() => {
    useWorkspace.getState().setLastActiveAt(Date.now())
  }, INTERVAL_MS)
  window.addEventListener("pagehide", () => {
    useWorkspace.getState().setLastActiveAt(Date.now())
  })
}

/** 扫一轮：GitHub sender 拉取 → 去重入库 → 更新 watermark → 新条目推 toast → 计贡献。 */
export async function scanNow(): Promise<void> {
  if (scanning) return // 上一轮未结束则跳过本轮，避免请求堆积
  scanning = true
  try {
    const s = useWorkspace.getState()
    const repos = s.settings.notificationRepos
    const token = s.settings.githubToken

    // 无论是否扫仓库，本轮都算「活跃」
    s.setLastActiveAt(Date.now())

    if (repos.length === 0) {
      // 未配置仓库：只推进水位与活跃时间，不发请求
      s.setNotificationWatermark(Date.now())
      return
    }

    // 起算时间：水位优先，没有数据（首次）用关机/活跃时间，再没有用当前时间
    const since = s.notificationWatermark ?? s.lastActiveAt ?? Date.now()

    const state = useWorkspace.getState()
    const existingIds = new Set(state.notifications.map((n) => n.id))

    const { items, rateLimited } = await scanGithubNotifications(since, {
      repos,
      token,
      knownIds: existingIds,
    })

    // 「仅监听」的仓库：commit 仍被扫描（计贡献用），但不入库通知、不弹弹窗
    const monitorOnlyRepos = new Set(
      repos.filter((r) => r.commitMonitorOnly).map((r) => r.repo.trim())
    )
    const notifyItems = items.filter(
      (n) => !(n.kind === "commit" && monitorOnlyRepos.has(n.repo))
    )
    const fresh = notifyItems.filter((n) => !existingIds.has(n.id))

    // foundAt = 本轮扫描发现时刻（epoch ms）：晚推送的 commit 等场景下，事件发生时间
    // （createdAt）可能远早于发现时刻，通知页按 foundAt 排序才能保证刚收到的在最上面
    const foundAt = Date.now()
    state.addNotifications(
      notifyItems.map((n) => (n.foundAt ? n : { ...n, foundAt }))
    )
    // 限流轮不推进水位：未扫到的仓库/时间窗下轮重扫（store 内按 id 去重，重扫无副作用）
    if (!rateLimited) {
      state.setNotificationWatermark(Date.now())
    }

    // 新条目按用户勾选的通知渠道分发（仅本轮新入库的，去重条目不重复投递）
    if (fresh.length > 0) dispatchNotifications(fresh, state.settings)

    // 日志存储（TODO 27）：记录本轮检查的仓库、发现的新内容，以及是否发送了通知提示。
    // scan 汇总条目 + 逐条 item 条目（含「仅监听」的 commit——检查过但按规则不通知）。
    const channelsEnabled =
      state.settings.notificationChannels.builtin || state.settings.notificationChannels.qq
    const scanAt = Date.now()
    const logs: NotificationLogEntry[] = []
    if (repos.length > 0) {
      logs.push({
        id: `scan:${scanAt}`,
        at: scanAt,
        kind: "scan",
        message: `已扫描 ${repos.length} 个仓库：新增通知 ${fresh.length} 条${
          rateLimited ? "（本轮触发限流，水位未推进）" : ""
        }`,
        notified: fresh.length > 0 && channelsEnabled,
      })
    }
    for (const n of items) {
      const monitorOnly = n.kind === "commit" && monitorOnlyRepos.has(n.repo)
      const ev = n.event ?? "open"
      // open = 新建（原文案）；其余状态变化用「已关闭/已合并/重新打开」文案
      const message =
        ev === "open"
          ? `发现 ${n.repo} 的新${KIND_LABEL[n.kind]}「${n.title}」`
          : `${n.repo} 的${KIND_LABEL[n.kind]}「${n.title}」${GH_EVENT_LABEL[ev]}`
      logs.push({
        id: `item:${n.id}`,
        at: scanAt,
        kind: "item",
        message: `${message}${monitorOnly ? "（仅监听，未通知）" : ""}`,
        notified: channelsEnabled && !monitorOnly,
      })
    }
    state.appendNotificationLogs(logs)

    // 贡献入账（按主人定的规则）：commit 全记；issue 仅 open；PR 仅 open / merge。
    // actor 与「账户与同步 → 名称」（settings.userName）一致（名称非空才比对）。
    // 注意：从**本轮扫到的全部条目**计算（而非仅 fresh）——「仅监听」的 commit 不入库通知，
    // 但贡献照记；贡献 id 是确定性的（github-{...}），appendContributions 内按 id 去重防重计。
    // 旧存档条目无 event 字段 → 视为 open（历史上入库的都是新建事件）。
    const gitName = state.settings.userName.trim()
    if (gitName) {
      const entries = items
        .filter((n) => {
          if (n.kind === "commit") return true
          if (n.kind === "issue") return (n.event ?? "open") === "open"
          if (n.kind === "pr") {
            const ev = n.event ?? "open"
            return ev === "open" || ev === "merge"
          }
          return false
        })
        .filter((n) => n.actor === gitName)
        .map((n) => ({
          id: `github-${n.id.slice("gh:".length)}`,
          type: KIND_TO_CONTRIB[n.kind as "commit" | "issue" | "pr"],
          at: Date.parse(n.createdAt),
          content: `${n.repo}: ${n.title}`,
        }))
      if (entries.length > 0) {
        // amount 由 store 的 appendContributions 按 CONTRIBUTION_AMOUNT 统一取值
        state.appendContributions(entries)
      }
    }
  } catch {
    // 整轮异常静默跳过，等下一轮
  } finally {
    scanning = false
  }
}
