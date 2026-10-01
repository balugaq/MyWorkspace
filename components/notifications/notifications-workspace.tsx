"use client"

// 通知中心工作区（TODO 20 / TODO 23 / TODO 44）：只读消息流，按 foundAt 降序渲染 store.notifications。
// TODO 23：sender 筛选 tab（全部 / GitHub / 新闻精选）+ 新闻卡片的可展开富详情。
// TODO 44：新闻包卡片（一轮精选 1 条 newsPack 通知，点击弹 Dialog 逐条查看）+
//          失败通知（无富字段的 news 条目）兜底渲染 + 手动按钮受周期门槛约束。
// 布局遵守 AGENTS.md §3：flex 列 + min-h-0 + flex-1 + overflow-auto。

import { Fragment, useState } from "react"
import { toast } from "sonner"
import { useWorkspace } from "@/lib/store"
import type { NewsDetail, NotificationItem } from "@/lib/types"
import { GH_EVENT_LABEL } from "@/lib/types"
import { SENDER_META, senderDisplayName } from "@/lib/notifications/senders"
import { newsCycleStart, triggerNewsManually } from "@/lib/notifications/news-sender"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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

/**
 * 新闻详情卡片（TODO 44，参照 ref.txt 视觉稿复刻）：深色卡片 + 左侧红色引导边 +
 * 橙色领域标签 + 主标题 + 时间胶囊 + label/value 信息网格 + 作文素材框 + 相关链接按钮。
 * 深色主题优先还原稿内色值（#151517 / #d93838 / #e86c3a / #88898c 等，Tailwind 任意值类），
 * 浅色主题回落主题 token（bg-card / muted / border）给合理对应。
 */
function NewsDetailCard({ detail }: { detail: NewsDetail }) {
  const rows: [string, string][] = [
    ["时间", detail.time],
    ["地点", detail.place],
    ["人物", detail.individuals],
    ["经过", detail.throughout],
    ["影响", detail.effect],
    ["精神", detail.spirit],
  ]
  return (
    <article className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 pl-6 text-left dark:border-[#2a2a2d] dark:bg-[#151517] dark:text-[#e8e8e8]">
      {/* 左侧红色引导边（ref.txt .card::before） */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-[5px] bg-[#d93838]" />
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="shrink-0 rounded-md bg-[#e86c3a] px-2.5 py-1 text-xs font-semibold tracking-wide text-white">
            {detail.field || "新闻"}
          </span>
          <h3 className="min-w-0 text-base font-bold leading-snug dark:text-white">
            {detail.title || "（无标题）"}
          </h3>
        </div>
        {detail.time && (
          <span className="shrink-0 whitespace-nowrap rounded-full border border-border bg-muted px-3.5 py-1.5 text-xs text-muted-foreground dark:border-[#26262a] dark:bg-[#1c1c1f] dark:text-[#88898c]">
            {detail.time}
          </span>
        )}
      </div>
      <div className="mt-5 grid grid-cols-[64px_1fr] gap-x-6 gap-y-3.5 text-left text-sm">
        {rows
          .filter(([, v]) => v)
          .map(([label, v]) => (
            <Fragment key={label}>
              <span className="pt-0.5 text-[13px] tracking-widest text-muted-foreground dark:text-[#88898c]">
                {label}
              </span>
              <span className="min-w-0 leading-relaxed text-foreground/90 dark:text-[#e8e8e8]">
                {v}
              </span>
            </Fragment>
          ))}
      </div>
      {detail.essayExample && (
        <div className="mt-5 rounded-lg border border-border bg-muted/60 p-4 dark:border-[#2e2e33] dark:bg-[#1c1c20]">
          <p className="text-xs font-semibold tracking-widest text-muted-foreground dark:text-[#88898c]">
            作文素材
          </p>
          <p className="mt-2 text-left text-sm font-medium leading-relaxed text-foreground/90 dark:text-[#e8e8e8]">
            {detail.essayExample}
          </p>
        </div>
      )}
      {detail.link.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-3 border-t border-border pt-4 dark:border-[#2a2a2d]">
          {detail.link.map((u, i) => (
            <a
              key={`${u}-${i}`}
              href={u}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-3.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground dark:border-[#2a2a2d] dark:bg-[#1e1e22] dark:text-[#88898c] dark:hover:bg-[#2a2a30] dark:hover:text-[#e8e8e8]"
            >
              <Link2 className="size-3.5" aria-hidden />
              相关链接 {detail.link.length > 1 ? i + 1 : ""}
            </a>
          ))}
        </div>
      )}
    </article>
  )
}

/** 新闻包卡片（TODO 44）：一轮精选 1 条（title「新闻精选 · N 条」），点击弹 Dialog 逐条查看 */
function NewsPackCard({ item }: { item: NotificationItem }) {
  const [open, setOpen] = useState(false)
  const pack = item.newsPack ?? []
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full flex-col gap-1 rounded-lg border bg-muted/40 px-4 py-3 text-left transition-colors hover:bg-muted/70"
      >
        <div className="flex items-center gap-2 text-xs">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 font-medium",
              KIND_META.news.className,
            )}
          >
            新闻包
          </span>
          <span className="shrink-0 text-muted-foreground/80">{senderDisplayName(item.senderId)}</span>
          <span className="truncate text-muted-foreground">共 {pack.length} 条精选</span>
          <span className="ml-auto shrink-0 text-muted-foreground/70">
            {relativeTimeMs(item.foundAt ?? (Date.parse(item.createdAt) || 0))}
          </span>
        </div>
        <p className="text-sm font-medium text-foreground">{item.title || "（无标题）"}</p>
        {item.brief && (
          <p className="truncate text-xs text-muted-foreground" title={item.brief}>
            {item.brief}
          </p>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{item.title || "新闻精选"}</DialogTitle>
            <DialogDescription>共 {pack.length} 条精选新闻，点「相关链接」可查看原文</DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[70vh] min-h-0 flex-col gap-4 overflow-auto pr-1">
            {pack.map((d, i) => (
              <NewsDetailCard key={`${item.id}:${i}`} detail={d} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** 新闻精选卡片（TODO 23，旧版单条富详情形态，保持不变）：默认收起，点击展开 */
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

/** 失败通知等无富字段的 news 条目（TODO 44）：news / newsPack 均缺省时的兜底渲染 */
function PlainNewsCard({ item }: { item: NotificationItem }) {
  return (
    <div className="flex w-full flex-col gap-1 rounded-lg border bg-muted/40 px-4 py-3 text-left">
      <div className="flex items-center gap-2 text-xs">
        <span className={cn("rounded px-1.5 py-0.5 font-medium", KIND_META.news.className)}>
          {KIND_META.news.label}
        </span>
        <span className="shrink-0 text-muted-foreground/80">{senderDisplayName(item.senderId)}</span>
        <span className="ml-auto shrink-0 text-muted-foreground/70">
          {relativeTimeMs(item.foundAt ?? (Date.parse(item.createdAt) || 0))}
        </span>
      </div>
      <p className="text-sm font-medium text-foreground">{item.title || "（无标题）"}</p>
      {item.brief && (
        <p className="text-xs leading-relaxed text-muted-foreground">{item.brief}</p>
      )}
    </div>
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

/**
 * 手动触发新闻精选（仅「新闻精选」tab 显示）：受 18:00 周期「每天一次」门槛约束
 * （本周期已拉取 → 置灰 + 提示），newsEnabled 关闭时同样禁用。
 */
function TriggerNewsButton() {
  const [busy, setBusy] = useState(false)
  const newsEnabled = useWorkspace((s) => s.settings.newsEnabled)
  const lastFetchedAt = useWorkspace((s) => s.newsLastFetchedAt)
  const fetchedThisCycle = lastFetchedAt != null && lastFetchedAt >= newsCycleStart()
  const blocked = !newsEnabled || fetchedThisCycle
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
      if (r === "fetched") {
        toast.info("本周期已拉取（18:00 为一天分界），下一周期可再次触发")
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
      if (r.picked > 0 && r.fresh > 0) {
        toast.success(`已精选 ${r.picked} 条新闻，生成新闻包通知`)
      } else if (r.picked === 0 && r.fresh > 0) {
        toast.warning("本轮运行失败，已发失败通知（详见通知中心）")
      } else {
        toast.info("本轮结果已在通知中心，无新增")
      }
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="inline-flex items-center gap-2">
      {fetchedThisCycle && (
        <span className="text-xs text-muted-foreground">本周期已拉取</span>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={busy || blocked}
        onClick={handle}
      >
        <RefreshCw className={cn("size-3.5", busy && "animate-spin")} aria-hidden />
        {busy ? "生成中…" : "手动触发"}
      </Button>
    </span>
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
                  ? "新闻精选每天最多触发一次（18:00 为一天分界），可手动触发本轮。"
                  : "在设置页配置要扫描的仓库后，commit、Issue、PR 与 Release 动态会出现在这里。"}
              </p>
              {senderFilter === "news" && <TriggerNewsButton />}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {/* 按「发现时间」降序：晚推送的旧 commit createdAt 很早，按发生时间排会被压到深处 */}
              {sorted.map((n) =>
                n.kind === "news" && n.newsPack && n.newsPack.length > 0 ? (
                  <NewsPackCard key={n.id} item={n} />
                ) : n.kind === "news" && n.news ? (
                  <NewsCard key={n.id} item={n} />
                ) : n.kind === "news" ? (
                  <PlainNewsCard key={n.id} item={n} />
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
