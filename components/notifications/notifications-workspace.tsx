"use client"

// 通知中心工作区（TODO 20 / TODO 23）：只读消息流，按 foundAt 降序渲染 store.notifications。
// TODO 23：sender 筛选 tab（全部 / GitHub / 新闻精选）+ 新闻卡片的可展开富详情。
// 布局遵守 AGENTS.md §3：flex 列 + min-h-0 + flex-1 + overflow-auto。

import { useState } from "react"
import { toast } from "sonner"
import { useWorkspace } from "@/lib/store"
import type { NewsDetail, NotificationItem } from "@/lib/types"
import { GH_EVENT_LABEL } from "@/lib/types"
import { SENDER_META, senderDisplayName } from "@/lib/notifications/senders"
import { triggerNewsManually } from "@/lib/notifications/news-sender"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Bell, ChevronDown, Link2, RefreshCw, Settings as SettingsIcon } from "lucide-react"

const KIND_META: Record<string, { label: string; className: string }> = {
  commit: { label: "提交", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  issue: { label: "Issue", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  pr: { label: "PR", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  release: { label: "发布", className: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  news: { label: "新闻", className: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
}

/** 相对时间：N 分钟前 / N 小时前 / N 天前；超 30 天回落绝对日期。 */
function relativeTimeMs(at: number): string {
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

/** 详情行：左灰标签 + 右内容 */
function DetailRow({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="flex gap-2 text-xs leading-relaxed">
      <span className="w-16 shrink-0 text-muted-foreground/80">{label}</span>
      <span className="min-w-0 flex-1 text-muted-foreground">{value}</span>
    </div>
  )
}

/** 新闻精选卡片（TODO 23）：默认收起（领域 pill + 标题 + 时间/地点），点击展开富详情 */
function NewsCard({ item }: { item: NotificationItem }) {
  const [expanded, setExpanded] = useState(false)
  const d: NewsDetail | undefined = item.news
  const isDomestic = (d?.field ?? "").includes("国内")
  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className={cn(
        "flex w-full flex-col gap-1.5 rounded-lg border bg-muted/40 px-4 py-3 text-left transition-colors hover:bg-muted/70",
        expanded && "bg-muted/70",
      )}
    >
      <div className="flex items-center gap-2 text-xs">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 font-medium",
            isDomestic
              ? "bg-red-500/10 text-red-600 dark:text-red-400"
              : "bg-sky-500/10 text-sky-600 dark:text-sky-400",
          )}
        >
          {d?.field || "新闻"}
        </span>
        <span className="shrink-0 text-muted-foreground/80">{senderDisplayName(item.senderId)}</span>
        {item.brief && (
          <span className="truncate text-muted-foreground" title={item.brief}>
            {item.brief}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1 text-muted-foreground/70">
          {relativeTimeMs(item.foundAt ?? (Date.parse(item.createdAt) || 0))}
          <ChevronDown
            className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
            aria-hidden
          />
        </span>
      </div>
      <p className="text-sm font-medium text-foreground">{item.title || "（无标题）"}</p>
      {expanded && d && (
        <div className="mt-1 flex flex-col gap-1.5 border-t pt-2">
          <DetailRow label="时间" value={d.time} />
          <DetailRow label="地点" value={d.place} />
          <DetailRow label="人物" value={d.individuals} />
          <DetailRow label="经过" value={d.throughout} />
          <DetailRow label="影响" value={d.effect} />
          <DetailRow label="精神" value={d.spirit} />
          {d.essayExample && (
            <div className="mt-1 rounded-md border-l-2 border-l-primary/40 bg-background/60 px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                作文素材
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-foreground/90">{d.essayExample}</p>
            </div>
          )}
          {d.link.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {d.link.map((u, i) => (
                <a
                  key={`${u}-${i}`}
                  href={u}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 rounded border bg-background px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Link2 className="size-3" aria-hidden />
                  相关链接 {d.link.length > 1 ? i + 1 : ""}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </button>
  )
}

/** GitHub sender 卡片（原有形态） */
function GithubCard({ item }: { item: NotificationItem }) {
  const meta = KIND_META[item.kind]
  return (
    <button
      type="button"
      onClick={() => window.open(item.url, "_blank", "noopener")}
      className="flex w-full flex-col gap-1 rounded-lg border bg-muted/40 px-4 py-3 text-left transition-colors hover:bg-muted/70"
    >
      <div className="flex items-center gap-2 text-xs">
        <span className={cn("rounded px-1.5 py-0.5 font-medium", meta.className)}>
          {(item.event ?? "open") === "open"
            ? meta.label
            : `${meta.label} · ${GH_EVENT_LABEL[item.event ?? "open"]}`}
        </span>
        <span className="shrink-0 text-muted-foreground/80">{senderDisplayName(item.senderId)}</span>
        <span className="truncate text-muted-foreground">{item.repo}</span>
        <span className="ml-auto shrink-0 text-muted-foreground/70">
          {relativeTimeMs(item.foundAt ?? (Date.parse(item.createdAt) || 0))}
        </span>
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

type SenderFilter = "all" | "github" | "news"

/** 手动触发新闻精选（仅「新闻精选」tab 显示）：绕过每周期一次的门槛，投递链路同自动触发 */
function TriggerNewsButton() {
  const [busy, setBusy] = useState(false)
  const handle = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = await triggerNewsManually()
      if (r === "disabled") {
        toast.error("新闻精选未开启，请先到「设置 → 新闻精选」开启")
        return
      }
      if (r === "running") {
        toast.info("上一轮新闻精选仍在生成中，请稍候")
        return
      }
      if (r.status === "no-ai") {
        toast.error("未配置可用的 AI 模型，请先在 AI 助手设置中配置")
        return
      }
      if (r.status === "no-entries") {
        toast.error(`热榜拉取失败（${r.failedSources.join("、") || "全部平台"}），本轮未触发`)
        return
      }
      if (r.status === "error") {
        toast.error("新闻精选执行失败，请稍后重试")
        return
      }
      if (r.fresh > 0) {
        toast.success(`已精选 ${r.picked} 条新闻，新增通知 ${r.fresh} 条`)
      } else if (r.parseFailed) {
        toast.warning("AI 输出解析失败，本轮未生成通知（可在 AI 助手对应会话查看原始输出）")
      } else {
        toast.info("本轮精选条目已在通知中心，无新增")
      }
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5"
      disabled={busy}
      onClick={handle}
    >
      <RefreshCw className={cn("size-3.5", busy && "animate-spin")} aria-hidden />
      {busy ? "生成中…" : "手动触发"}
    </Button>
  )
}

export function NotificationsWorkspace() {
  const notifications = useWorkspace((s) => s.notifications)
  const goSettings = useWorkspace((s) => s.goSettings)
  const [senderFilter, setSenderFilter] = useState<SenderFilter>("all")

  const filtered =
    senderFilter === "all" ? notifications : notifications.filter((n) => n.senderId === senderFilter)
  const sorted = [...filtered].sort(
    (a, b) =>
      (b.foundAt ?? (Date.parse(b.createdAt) || 0)) - (a.foundAt ?? (Date.parse(a.createdAt) || 0)),
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center px-8 py-6">
        <h1 className="text-2xl font-bold leading-tight text-foreground">通知</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-8">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-8">
          {/* sender 筛选 tab（TODO 23）：登记在 SENDER_META 的 sender 各占一档 */}
          {notifications.length > 0 && (
            <div className="flex items-center gap-1.5">
              {(["all", "github", "news"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setSenderFilter(f)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs transition-colors",
                    senderFilter === f
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/60 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f === "all" ? "全部" : (SENDER_META[f]?.name ?? f)}
                </button>
              ))}
              {senderFilter === "news" && (
                <span className="ml-auto">
                  <TriggerNewsButton />
                </span>
              )}
            </div>
          )}

          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
              <Bell className="size-8 text-muted-foreground/60" />
              <p className="text-sm font-medium">暂无通知</p>
              <p className="text-xs text-muted-foreground">
                GitHub 动态与新闻精选出现后都会聚合到这里；可在设置中配置扫描仓库或开启新闻精选。
              </p>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={goSettings}>
                <SettingsIcon className="size-3.5" />
                去设置
              </Button>
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
              <Bell className="size-8 text-muted-foreground/60" />
              <p className="text-sm font-medium">该来源暂无通知</p>
              <p className="text-xs text-muted-foreground">
                {senderFilter === "news"
                  ? "新闻精选每天最多触发一次（18:00 为一天分界），也可立即手动触发一轮。"
                  : "在设置页配置要扫描的仓库后，commit、Issue、PR 与 Release 动态会出现在这里。"}
              </p>
              {senderFilter === "news" && <TriggerNewsButton />}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {/* 按「发现时间」降序：晚推送的旧 commit createdAt 很早，按发生时间排会被压到深处 */}
              {sorted.map((n) =>
                n.kind === "news" && n.news ? (
                  <NewsCard key={n.id} item={n} />
                ) : (
                  <GithubCard key={n.id} item={n} />
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
