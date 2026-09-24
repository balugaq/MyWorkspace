"use client"

// 通知中心工作区（TODO 20）：只读消息流，按 createdAt 降序渲染 store.notifications。
// 布局遵守 AGENTS.md §3：flex 列 + min-h-0 + flex-1 + overflow-auto。
// 点击卡片打开对应 GitHub 页面；未配置仓库时给引导文案 + 「去设置」。

import { useWorkspace } from "@/lib/store"
import type { NotificationKind, NotificationItem } from "@/lib/types"
import { senderDisplayName } from "@/lib/notifications/senders"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Bell, Settings as SettingsIcon } from "lucide-react"

const KIND_META: Record<NotificationKind, { label: string; className: string }> = {
  commit: { label: "提交", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  issue: { label: "Issue", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  pr: { label: "PR", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  release: { label: "发布", className: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
}

/** 相对时间：N 分钟前 / N 小时前 / N 天前；超 30 天回落绝对日期。 */
function relativeTime(iso: string): string {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return ""
  const diff = Date.now() - at
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "刚刚"
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days <= 30) return `${days} 天前`
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function NotificationCard({ item }: { item: NotificationItem }) {
  const meta = KIND_META[item.kind]
  return (
    <button
      type="button"
      onClick={() => window.open(item.url, "_blank", "noopener")}
      className="flex w-full flex-col gap-1 rounded-lg border bg-muted/40 px-4 py-3 text-left transition-colors hover:bg-muted/70"
    >
      <div className="flex items-center gap-2 text-xs">
        <span className={cn("rounded px-1.5 py-0.5 font-medium", meta.className)}>{meta.label}</span>
        <span className="shrink-0 text-muted-foreground/80">{senderDisplayName(item.senderId)}</span>
        <span className="truncate text-muted-foreground">{item.repo}</span>
        <span className="ml-auto shrink-0 text-muted-foreground/70">{relativeTime(item.createdAt)}</span>
      </div>
      <p className="truncate text-sm font-medium text-foreground" title={item.title}>
        {item.title || "（无标题）"}
      </p>
      {item.brief && (
        <p className="truncate text-xs text-muted-foreground" title={item.brief}>
          {item.brief}
        </p>
      )}
    </button>
  )
}

export function NotificationsWorkspace() {
  const notifications = useWorkspace((s) => s.notifications)
  const repos = useWorkspace((s) => s.settings.notificationRepos)
  const goSettings = useWorkspace((s) => s.goSettings)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center px-8 py-6">
        <h1 className="text-2xl font-bold leading-tight text-foreground">通知</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-8">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-8">
          {/* 状态行（sender 未来会更多样，文案不绑定 GitHub） */}
          <p className="text-xs text-muted-foreground">
            已配置 {repos.length} 个仓库 · 每 5 分钟自动扫描一次新动态
            {repos.length > 0 && `（${repos.map((r) => r.repo).join("、")}）`}
          </p>

          {repos.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
              <Bell className="size-8 text-muted-foreground/60" />
              <p className="text-sm font-medium">还没有配置要扫描的仓库</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                在设置页的「通知」分区添加 GitHub 仓库（owner/name）后，这里会自动聚合它们的 commit、Issue、PR 与 Release 动态。
              </p>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={goSettings}>
                <SettingsIcon className="size-3.5" />
                去设置
              </Button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
              <Bell className="size-8 text-muted-foreground/60" />
              <p className="text-sm font-medium">暂无通知</p>
              <p className="text-xs text-muted-foreground">
                扫描器每 5 分钟运行一次，新的动态会出现在这里。
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {notifications.map((n) => (
                <NotificationCard key={n.id} item={n} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
