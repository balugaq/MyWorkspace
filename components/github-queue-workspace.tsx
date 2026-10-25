"use client"

// GitHub Issue/PR 看板队列（TODO 36）：Urgent / Assigned / Completed / Backlog 四列。
// 「添加监听仓库」回扫一次存量，此后由通知调度器增量入队（自有全量、他人仅 @me，
// 见 lib/notifications/scheduler.ts）；AI 经内置技能 wb_get_github_queue 只读访问队列。

import { useState } from "react"
import { toast } from "sonner"
import {
  GitPullRequest,
  AlertCircle,
  Plus,
  ExternalLink,
  User as UserIcon,
  Search,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { useWorkspace } from "@/lib/store"
import { matchTextPinyin } from "@/lib/pinyin"
import {
  fetchCurrentLogin,
  fetchRepoIssues,
  fetchSingleIssue,
  parseIssueRef,
  parseRepoInput,
} from "@/lib/github-queue"
import type { IssueQueueColumn, IssueQueueItem } from "@/lib/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const COLUMNS: { id: IssueQueueColumn; label: string }[] = [
  { id: "urgent", label: "Urgent" },
  { id: "assigned", label: "Assigned" },
  { id: "completed", label: "Completed" },
  { id: "backlog", label: "Backlog" },
]

const PER_PAGE = 100

export function GithubQueueWorkspace() {
  const { t } = useTranslation()
  const issueQueue = useWorkspace((s) => s.issueQueue)
  const addToIssueQueue = useWorkspace((s) => s.addToIssueQueue)
  const moveIssueQueueItem = useWorkspace((s) => s.moveIssueQueueItem)
  const removeIssueQueueItem = useWorkspace((s) => s.removeIssueQueueItem)
  const githubToken = useWorkspace((s) => s.settings.githubToken)
  const notificationRepos = useWorkspace((s) => s.settings.notificationRepos)
  const updateSettings = useWorkspace((s) => s.updateSettings)

  const [addOpen, setAddOpen] = useState(false)
  const [repoInput, setRepoInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [addSingleOpen, setAddSingleOpen] = useState(false)
  const [issueInput, setIssueInput] = useState("")
  const [singleLoading, setSingleLoading] = useState(false)
  const [query, setQuery] = useState("")

  const q = query.trim().toLowerCase()
  const visible =
    q.length === 0
      ? issueQueue
      : issueQueue.filter((it) =>
          matchTextPinyin(
            `${it.title} ${it.bodySnippet} ${it.repo} ${it.actor} #${it.number}`,
            q,
          ),
        )

  // 添加监听仓库：先拉一次存量（同时校验存在，404 不予添加——2026-10-10 主人口径），
  // 通过才落监听配置并入队（自有全量、他人仅 @me）。
  async function handleAdd() {
    const repo = parseRepoInput(repoInput)
    if (!repo.includes("/")) {
      toast.error(t("queue.errRepoFormat"))
      return
    }
    if (notificationRepos.some((r) => r.repo === repo)) {
      toast.info(t("queue.repoExists"))
      return
    }
    setLoading(true)
    try {
      const login = await fetchCurrentLogin(githubToken)
      // 既是存在性校验也是存量回扫；失败（404/限流/网络）一律不落监听配置
      const res = await fetchRepoIssues(repo, {
        token: githubToken,
        currentLogin: login,
        perPage: PER_PAGE,
      })
      updateSettings({
        notificationRepos: [
          ...notificationRepos,
          {
            repo,
            scanTypes: { commits: false, issues: true, prs: true, releases: false },
            commitMonitorOnly: false,
            scanSince: Date.now(),
          },
        ],
      })
      if (!login) {
        toast.warning(
          t("queue.addedNoToken")
        )
        setAddOpen(false)
        setRepoInput("")
        return
      }
      const isMine = repo.split("/")[0] === login
      const items = isMine ? res.items : res.items.filter((it) => it.assigneeMe)
      if (items.length === 0) {
        toast.info(
          t("queue.addedNoBacklog", { repo, mine: isMine ? "" : t("queue.assignedToYou") })
        )
      } else {
        addToIssueQueue(items)
        toast.success(t("queue.addedBackscanned", { n: items.length }))
      }
      if (res.truncated) {
        toast.warning(t("queue.backlogTruncated", { n: PER_PAGE }))
      }
      setAddOpen(false)
      setRepoInput("")
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("queue.addFailed")
      if (msg === "RATE_LIMITED")
        toast.error(t("queue.rateLimitedAdd"))
      else if (msg.includes("404"))
        toast.error(t("queue.repoNotFound", { repo }))
      else toast.error(t("queue.addFailedWith", { msg }))
    } finally {
      setLoading(false)
    }
  }

  // 解析链接或 owner/repo#编号 → 拉取 → 入队（已在队列中则刷新状态）
  async function handleAddSingle() {
    const ref = parseIssueRef(issueInput)
    if (!ref || !ref.repo.includes("/") || !Number.isFinite(ref.number) || ref.number <= 0) {
      toast.error(t("queue.errUnrecognized"))
      return
    }
    setSingleLoading(true)
    try {
      const login = await fetchCurrentLogin(githubToken)
      const item = await fetchSingleIssue(ref.repo, ref.number, {
        token: githubToken,
        currentLogin: login,
      })
      const existed = issueQueue.some((it) => it.id === item.id)
      addToIssueQueue([item])
      toast.success(
        existed
          ? t("queue.duplicateRefreshed", { repo: item.repo, n: item.number })
          : t("queue.addedSingle", { repo: item.repo, n: item.number }),
      )
      setAddSingleOpen(false)
      setIssueInput("")
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("queue.addFailed")
      if (msg === "RATE_LIMITED") toast.error(t("queue.rateLimited"))
      else if (msg.includes("404")) toast.error(t("queue.notFound404"))
      else toast.error(t("queue.addFailedWith", { msg }))
    } finally {
      setSingleLoading(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <GitPullRequest className="size-5 text-primary" />
        <h1 className="text-base font-semibold">{t("queue.title")}</h1>
        <div className="ml-3 flex items-center gap-2">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("queue.searchPlaceholder")}
            className="h-8 w-64 text-sm"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setAddSingleOpen(true)}
          >
            <Plus className="size-4" />
            {t("queue.addIssue")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="size-4" />
            {t("queue.addRepo")}
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-4 gap-3 overflow-auto native-scroll p-4">
        {COLUMNS.map((col) => {
          const items = visible.filter((it) => it.column === col.id)
          // TODO 46：按入队时间倒序，旧存档无 queuedAt 沉底；visible.filter 返回新数组，可安全原地排序
          items.sort((a, b) => (b.queuedAt ?? 0) - (a.queuedAt ?? 0))
          return (
            <div key={col.id} className="flex min-h-0 flex-col rounded-lg border bg-muted/20">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-sm font-medium">{col.label}</span>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto native-scroll p-2">
                {items.length === 0 ? (
                  <p className="px-1 py-4 text-center text-xs text-muted-foreground">{t("queue.emptyColumn")}</p>
                ) : (
                  items.map((it) => (
                    <QueueCard
                      key={it.id}
                      item={it}
                      onMove={(c) => moveIssueQueueItem(it.id, c)}
                      onRemove={() => removeIssueQueueItem(it.id)}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      <Dialog
        open={addOpen}
        onOpenChange={(v) => {
          if (!v) {
            setAddOpen(false)
            setRepoInput("")
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("queue.addRepoTitle")}</DialogTitle>
            <DialogDescription>
              {t("queue.addRepoDesc", { n: PER_PAGE })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="repo">{t("queue.repo")}</Label>
              <Input
                id="repo"
                placeholder="owner/repo 或 https://github.com/owner/repo"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !loading) void handleAdd()
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAddOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={() => void handleAdd()} disabled={loading}>
                {loading ? t("queue.verifying") : t("common.add")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addSingleOpen}
        onOpenChange={(v) => {
          if (!v) {
            setAddSingleOpen(false)
            setIssueInput("")
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("queue.addIssueTitle")}</DialogTitle>
            <DialogDescription>
              {t("queue.addIssueDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="issue-ref">{t("queue.linkOrNumber")}</Label>
              <Input
                id="issue-ref"
                placeholder="https://github.com/owner/repo/issues/123 或 owner/repo#123"
                value={issueInput}
                onChange={(e) => setIssueInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !singleLoading) void handleAddSingle()
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAddSingleOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={() => void handleAddSingle()} disabled={singleLoading}>
                {singleLoading ? t("queue.fetching") : t("common.add")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function QueueCard({
  item,
  onMove,
  onRemove,
}: {
  item: IssueQueueItem
  onMove: (c: IssueQueueColumn) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const isPr = item.kind === "pr"
  return (
    <div className="rounded-md border bg-card p-2.5 text-sm shadow-sm">
      <div className="flex items-start gap-1.5">
        {isPr ? (
          <GitPullRequest className="mt-0.5 size-4 shrink-0 text-blue-500" />
        ) : (
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-500" />
        )}
        <a
          href={item.htmlUrl}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 flex-1 font-medium leading-snug hover:underline"
        >
          {item.title}
        </a>
      </div>
      {item.bodySnippet && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.bodySnippet}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <UserIcon className="size-3" />
          {item.actor || "—"}
        </span>
        <span className="rounded bg-muted px-1 py-0.5">
          {item.repo}#{item.number}
        </span>
        {item.merged && <span className="text-green-600">{t("queue.merged")}</span>}
        {item.state === "closed" && !item.merged && <span>{t("queue.closed")}</span>}
        {item.assigneeMe && <span className="text-emerald-600">@me</span>}
        <a
          href={item.htmlUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 hover:text-foreground"
        >
          <ExternalLink className="size-3" />
          {t("queue.open")}
        </a>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {COLUMNS.filter((c) => c.id !== item.column).map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onMove(c.id)}
            className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            → {c.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto rounded border px-1.5 py-0.5 text-[11px] text-destructive transition-colors hover:bg-destructive/10"
        >
          {t("common.delete")}
        </button>
      </div>
    </div>
  )
}
