"use client"

// 通知中心工作区（TODO 20/23/44）：只读消息流，按 foundAt 降序渲染 store.notifications；
// sender 筛选 tab + 新闻卡片可展开富详情（TODO 23）+ 新闻包卡片与兜底渲染（TODO 44）。布局遵守 AGENTS.md §3。

import { Fragment, useMemo, useState } from "react"
import { toast } from "sonner"
import { useWorkspace } from "@/lib/store"
import { matchTextPinyin } from "@/lib/pinyin"
import type { NewsDetail, NotificationItem } from "@/lib/types"
import { senderDisplayNameLocalized } from "@/lib/notifications/senders"
import { useTranslation, getI18n } from "react-i18next"
import { triggerNewsManually } from "@/lib/notifications/news-sender"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Bell, ChevronDown, Link2, RefreshCw, Search, Settings as SettingsIcon } from "lucide-react"
import { Input } from "@/components/ui/input"

const KIND_META: Record<string, { label: string; className: string }> = {
  commit: { label: "notif.type.commit", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  issue: { label: "Issue", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  pr: { label: "PR", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  release: { label: "notif.type.release", className: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  news: { label: "notif.type.news", className: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
}

/** 相对时间：N 分钟前 / N 小时前 / N 天前；超 30 天回落绝对日期。 */
function relativeTimeMs(at: number): string {
  if (!Number.isFinite(at)) return ""
  const diff = Date.now() - at
  const minutes = Math.floor(diff / 60_000)
  const gt = (key: string, params?: Record<string, unknown>) => getI18n().t(key, params)
  if (minutes < 1) return gt("notif.justNow") as string
  if (minutes < 60) return gt("notif.minutesAgo", { n: minutes }) as string
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return gt("notif.hoursAgo", { n: hours }) as string
  const days = Math.floor(hours / 24)
  if (days <= 30) return gt("notif.daysAgo", { n: days }) as string
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** 详情行：左灰标签 + 右内容 */
function DetailRow({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="flex gap-2 text-xs leading-relaxed">
      <span className="w-16 shrink-0 text-muted-foreground/80">{label}</span>
      <span className="min-w-0 flex-1 break-words text-muted-foreground">{value}</span>
    </div>
  )
}

/** 新闻详情卡片（TODO 44，参照 ref.txt 视觉稿复刻）：深色主题优先还原稿内色值（#151517 等，Tailwind 任意值类），
 *  浅色主题回落主题 token。 */
function NewsDetailCard({ detail }: { detail: NewsDetail }) {
  const { t } = useTranslation()
  const rows: [string, string][] = [
    ["notif.detail.time", detail.time],
    ["notif.detail.place", detail.place],
    ["notif.detail.people", detail.individuals],
    ["notif.detail.throughout", detail.throughout],
    ["notif.detail.effect", detail.effect],
    ["notif.detail.spirit", detail.spirit],
  ]
  return (
    <article className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 pl-6 text-left dark:border-[#2a2a2d] dark:bg-[#151517] dark:text-[#e8e8e8]">
      {/* 左侧红色引导边（ref.txt .card::before） */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-[5px] bg-[#d93838]" />
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="shrink-0 rounded-md bg-[#e86c3a] px-2.5 py-1 text-xs font-semibold tracking-wide text-white">
            {detail.field || t("notif.type.newsShort")}
          </span>
          <h3 className="min-w-0 break-words text-base font-bold leading-snug dark:text-white">
            {detail.title || t("notif.untitled")}
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
                {t(label)}
              </span>
              <span className="min-w-0 break-words leading-relaxed text-foreground/90 dark:text-[#e8e8e8]">
                {v}
              </span>
            </Fragment>
          ))}
      </div>
      {detail.essayExample && (
        <div className="mt-5 rounded-lg border border-border bg-muted/60 p-4 dark:border-[#2e2e33] dark:bg-[#1c1c20]">
          <p className="text-xs font-semibold tracking-widest text-muted-foreground dark:text-[#88898c]">
            {t("notif.essayMaterial")}
          </p>
          <p className="mt-2 break-words text-left text-sm font-medium leading-relaxed text-foreground/90 dark:text-[#e8e8e8]">
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
              {t("notif.relatedLinks")} {detail.link.length > 1 ? i + 1 : ""}
            </a>
          ))}
        </div>
      )}
    </article>
  )
}

/** 新闻包卡片（TODO 44 / 57 改版）：一轮精选 1 条；点击「展开」在列表内直接铺开全部 ref.txt 样式小新闻卡（默认收起），不再弹 Dialog */
function NewsPackCard({ item }: { item: NotificationItem }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const pack = item.newsPack ?? []
  return (
    <div className="flex w-full min-w-0 flex-col gap-1 rounded-lg border bg-muted/40 px-4 py-3 text-left">
      <div className="flex items-center gap-2 text-xs">
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 font-medium",
            KIND_META.news.className,
          )}
        >
          {t("notif.newsPack")}
        </span>
        <span className="shrink-0 text-muted-foreground/80">{senderDisplayNameLocalized(item.senderId)}</span>
        <span className="min-w-0 truncate text-muted-foreground">{t("notif.packCount", { n: pack.length })}</span>
        <span className="ml-auto shrink-0 text-muted-foreground/70">
          {relativeTimeMs(item.foundAt ?? (Date.parse(item.createdAt) || 0))}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 shrink-0 gap-1 px-2 text-xs"
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} aria-hidden />
          {expanded ? t("common.collapse") : t("notif.expand", { n: pack.length })}
        </Button>
      </div>
      <p className="truncate text-sm font-medium text-foreground" title={item.title}>
        {item.title || t("notif.untitled")}
      </p>
      {item.brief && (
        <p className="truncate text-xs text-muted-foreground" title={item.brief}>
          {item.brief}
        </p>
      )}
      {expanded && pack.length > 0 && (
        <div className="mt-2 flex flex-col gap-4 border-t pt-3">
          {pack.map((d, i) => (
            <NewsDetailCard key={`${item.id}:${i}`} detail={d} />
          ))}
        </div>
      )}
    </div>
  )
}

/** 新闻精选卡片（TODO 23）：默认收起，点击展开。用 div + role="button" 而非 <button>——
 *  button 内部 flex 子项的 min-content 计算有浏览器怪癖，min-w-0 压不住 nowrap 长文（实测溢出），div 无此问题。 */
function NewsCard({ item }: { item: NotificationItem }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const d: NewsDetail | undefined = item.news
  const isDomestic = (d?.field ?? "").includes("国内") // 国内判定走数据原文，与语言无关
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setExpanded((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          setExpanded((v) => !v)
        }
      }}
      className={cn(
        "flex w-full min-w-0 cursor-pointer flex-col gap-1.5 rounded-lg border bg-muted/40 px-4 py-3 text-left transition-colors hover:bg-muted/70",
        expanded && "bg-muted/70",
      )}
    >
      <div className="flex items-center gap-2 text-xs">
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 font-medium",
            isDomestic
              ? "bg-red-500/10 text-red-600 dark:text-red-400"
              : "bg-sky-500/10 text-sky-600 dark:text-sky-400",
          )}
        >
          {d?.field || t("notif.type.newsShort")}
        </span>
        <span className="shrink-0 text-muted-foreground/80">{senderDisplayNameLocalized(item.senderId)}</span>
        {item.brief && (
          <span className="min-w-0 truncate text-muted-foreground" title={item.brief}>
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
      <p className="truncate text-sm font-medium text-foreground" title={item.title}>
        {item.title || t("notif.untitled")}
      </p>
      {expanded && d && (
        <div className="mt-1 flex flex-col gap-1.5 border-t pt-2">
          <DetailRow label={t("notif.detail.time")} value={d.time} />
          <DetailRow label={t("notif.detail.place")} value={d.place} />
          <DetailRow label={t("notif.detail.people")} value={d.individuals} />
          <DetailRow label={t("notif.detail.throughout")} value={d.throughout} />
          <DetailRow label={t("notif.detail.effect")} value={d.effect} />
          <DetailRow label={t("notif.detail.spirit")} value={d.spirit} />
          {d.essayExample && (
            <div className="mt-1 rounded-md border-l-2 border-l-primary/40 bg-background/60 px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                {t("notif.essayMaterial")}
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
                  {t("notif.relatedLinks")} {d.link.length > 1 ? i + 1 : ""}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** 失败通知等无富字段的 news 条目（TODO 44）：news / newsPack 均缺省时的兜底渲染 */
function PlainNewsCard({ item }: { item: NotificationItem }) {
  const { t } = useTranslation()
  return (
    <div className="flex w-full min-w-0 flex-col gap-1 rounded-lg border bg-muted/40 px-4 py-3 text-left">
      <div className="flex items-center gap-2 text-xs">
        <span className={cn("shrink-0 rounded px-1.5 py-0.5 font-medium", KIND_META.news.className)}>
          {t(KIND_META.news.label)}
        </span>
        <span className="shrink-0 text-muted-foreground/80">{senderDisplayNameLocalized(item.senderId)}</span>
        <span className="ml-auto shrink-0 text-muted-foreground/70">
          {relativeTimeMs(item.foundAt ?? (Date.parse(item.createdAt) || 0))}
        </span>
      </div>
      <p className="truncate text-sm font-medium text-foreground" title={item.title}>
        {item.title || t("notif.untitled")}
      </p>
      {item.brief && (
        <p className="truncate text-xs text-muted-foreground" title={item.brief}>
          {item.brief}
        </p>
      )}
    </div>
  )
}

/** GitHub sender 卡片：div + role="button"（button 内部 flex 子项 min-content 怪癖会让 truncate 失效，见 NewsCard 注释） */
function GithubCard({ item }: { item: NotificationItem }) {
  const { t } = useTranslation()
  const meta = KIND_META[item.kind]
  const open = () => window.open(item.url, "_blank", "noopener")
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          open()
        }
      }}
      className="flex w-full min-w-0 cursor-pointer flex-col gap-1 rounded-lg border bg-muted/40 px-4 py-3 text-left transition-colors hover:bg-muted/70"
    >
      <div className="flex items-center gap-2 text-xs">
        <span className={cn("shrink-0 rounded px-1.5 py-0.5 font-medium", meta.className)}>
          {item.number != null ? `${t(meta.label)} #${item.number}` : t(meta.label)}
          {(item.event ?? "open") !== "open" && ` · ${t(`push.event.${item.event ?? "open"}`)}`}
        </span>
        <span className="shrink-0 text-muted-foreground/80">{senderDisplayNameLocalized(item.senderId)}</span>
        <span className="min-w-0 truncate text-muted-foreground">{item.repo}</span>
        <span className="ml-auto shrink-0 text-muted-foreground/70">
          {relativeTimeMs(item.foundAt ?? (Date.parse(item.createdAt) || 0))}
        </span>
      </div>
      <p className="min-w-0 truncate text-sm font-medium text-foreground" title={item.title}>
        {item.title || t("notif.untitled")}
      </p>
      {item.brief && (
        <p className="min-w-0 truncate text-xs text-muted-foreground" title={item.brief}>
          {item.brief}
        </p>
      )}
    </div>
  )
}

type SenderFilter = "all" | "github" | "news"

/** 手动触发新闻精选（仅「新闻精选」tab 显示）：随时可点，仅受 newsEnabled 开关与防重入约束。 */
function TriggerNewsButton() {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const newsEnabled = useWorkspace((s) => s.settings.newsEnabled)
  const handle = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = await triggerNewsManually()
      if (r === "disabled") {
        toast.error(t("notif.newsDisabled"))
        return
      }
      if (r === "running") {
        toast.info(t("notif.newsBusy"))
        return
      }
      if (r.status === "no-ai") {
        toast.error(t("notif.noModel"))
        return
      }
      if (r.status === "no-entries") {
        toast.error(t("notif.hotFetchFail", { sources: r.failedSources.join("、") || t("notif.allPlatforms") }))
        return
      }
      if (r.status === "error") {
        toast.error(t("notif.newsFail"))
        return
      }
      if (r.picked > 0 && r.fresh > 0) {
        toast.success(t("notif.newsPicked", { n: r.picked }))
      } else if (r.picked === 0 && r.fresh > 0) {
        toast.warning(t("notif.roundFail"))
      } else {
        toast.info(t("notif.noNew"))
      }
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={busy || !newsEnabled}
        onClick={handle}
      >
        <RefreshCw className={cn("size-3.5", busy && "animate-spin")} aria-hidden />
        {busy ? t("notif.generating") : t("notif.manualTrigger")}
      </Button>
    </span>
  )
}

export function NotificationsWorkspace() {
  const { t } = useTranslation()
  const notifications = useWorkspace((s) => s.notifications)
  const goSettings = useWorkspace((s) => s.goSettings)
  const [senderFilter, setSenderFilter] = useState<SenderFilter>("all")
  // TODO 56：关键词搜索，与 sender 筛选叠加
  const [search, setSearch] = useState("")

  const filtered =
    senderFilter === "all" ? notifications : notifications.filter((n) => n.senderId === senderFilter)
  const sorted = [...filtered].sort(
    (a, b) =>
      (b.foundAt ?? (Date.parse(b.createdAt) || 0)) - (a.foundAt ?? (Date.parse(a.createdAt) || 0)),
  )
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sorted
    // 拼音增强：纯字母 query 追加全拼/首字母命中（标题多为中文，如 "xw" 命中新闻精选标题）
    return sorted.filter(
      (n) =>
        matchTextPinyin(n.title, q) ||
        matchTextPinyin(n.brief, q) ||
        (n.repo ?? "").toLowerCase().includes(q) ||
        matchTextPinyin(senderDisplayNameLocalized(n.senderId), q),
    )
  }, [sorted, search])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center px-8 py-6">
        <h1 className="text-2xl font-bold leading-tight text-foreground">{t("notif.title")}</h1>
      </header>

      <div className="native-scroll min-h-0 flex-1 overflow-auto px-8">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-8">
          {/* sender 筛选 tab（TODO 23）：登记在 SENDER_META 的 sender 各占一档 */}
          {notifications.length > 0 && (
            <div className="flex flex-col gap-2">
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
                    {f === "all" ? t("notif.allSenders") : senderDisplayNameLocalized(f)}
                  </button>
                ))}
                {senderFilter === "news" && (
                  <span className="ml-auto">
                    <TriggerNewsButton />
                  </span>
                )}
              </div>
              {/* TODO 56：关键词搜索（标题 / 摘要 / 仓库 / 来源） */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("notif.searchPlaceholder")}
                  className="pl-8"
                />
              </div>
            </div>
          )}

          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
              <Bell className="size-8 text-muted-foreground/60" />
              <p className="text-sm font-medium">{t("notif.empty")}</p>
              <p className="text-xs text-muted-foreground">
                {t("notif.emptyDesc")}
              </p>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={goSettings}>
                <SettingsIcon className="size-3.5" />
                {t("notif.goSettings")}
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
              <Bell className="size-8 text-muted-foreground/60" />
              <p className="text-sm font-medium">{search.trim() ? t("notif.noMatch") : t("notif.noneFromSender")}</p>
              <p className="text-xs text-muted-foreground">
                {search.trim()
                  ? t("notif.tryOtherKeyword")
                  : senderFilter === "news"
                    ? t("notif.newsOnceDaily")
                    : t("notif.repoHint")}
              </p>
              {!search.trim() && senderFilter === "news" && <TriggerNewsButton />}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {/* 按「发现时间」降序：晚推送的旧 commit createdAt 很早，按发生时间排会被压到深处 */}
              {visible.map((n) =>
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
