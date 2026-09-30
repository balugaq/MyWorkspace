"use client"

// GitHub Issue/PR 看板队列（TODO 36）。
// 四列：Urgent / Assigned / Completed / Backlog。卡片由用户从仓库拉取，或「从监听同步」导入。
// 拉取走 lib/github-queue.ts（复用 github-sender 的认证/限流思路，独立模块）。
// 注意：AI 读取队列内容的能力（skill）本题不做，留待后续 TODO。

import { useState } from "react"
import { toast } from "sonner"
import {
  GitPullRequest,
  AlertCircle,
  Trash2,
  Plus,
  RefreshCw,
  ExternalLink,
  User as UserIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useWorkspace } from "@/lib/store"
import { fetchCurrentLogin, fetchRepoIssues } from "@/lib/github-queue"
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

/** 解析 owner/repo：支持完整 URL / 带 .git / 带 issues 后缀 */
function parseRepo(input: string): string {
  let s = input.trim()
  s = s.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "")
  s = s.replace(/\/(issues?|pulls?)\b.*$/, "").replace(/\/$/, "")
  return s
}

export function GithubQueueWorkspace() {
  const issueQueue = useWorkspace((s) => s.issueQueue)
  const addToIssueQueue = useWorkspace((s) => s.addToIssueQueue)
  const moveIssueQueueItem = useWorkspace((s) => s.moveIssueQueueItem)
  const removeIssueQueueItem = useWorkspace((s) => s.removeIssueQueueItem)
  const clearIssueQueue = useWorkspace((s) => s.clearIssueQueue)
  const githubToken = useWorkspace((s) => s.settings.githubToken)
  const notificationRepos = useWorkspace((s) => s.settings.notificationRepos)

  const [addOpen, setAddOpen] = useState(false)
  const [repoInput, setRepoInput] = useState("")
  const [onlyMine, setOnlyMine] = useState(false)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  async function handleAdd() {
    const repo = parseRepo(repoInput)
    if (!repo.includes("/")) {
      toast.error("仓库格式应为 owner/name")
      return
    }
    if (onlyMine && !githubToken.trim()) {
      toast.error("仅拉取「分配给我的」需要填写 GitHub Token（设置 → 账户与同步）")
      return
    }
    setLoading(true)
    try {
      const login = onlyMine ? await fetchCurrentLogin(githubToken) : null
      const res = await fetchRepoIssues(repo, {
        onlyMine,
        token: githubToken,
        currentLogin: login,
        perPage: PER_PAGE,
      })
      if (res.items.length === 0) {
        toast.info("该仓库没有匹配的 issue / PR")
      } else {
        addToIssueQueue(res.items)
        toast.success(`已添加 ${res.items.length} 条（${repo}）`)
      }
      if (res.truncated) {
        toast.warning(`该仓库 issue/PR 超过 ${PER_PAGE} 条，仅导入前 ${PER_PAGE} 条；如需更多请缩小范围。`)
      }
      setAddOpen(false)
      setRepoInput("")
      setOnlyMine(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "拉取失败"
      if (msg === "RATE_LIMITED") toast.error("GitHub API 限流（403/429），请稍后再试")
      else toast.error(`拉取失败：${msg}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleSync() {
    if (!githubToken.trim()) {
      toast.error("同步监听仓库需要填写 GitHub Token（设置 → 账户与同步）")
      return
    }
    if (notificationRepos.length === 0) {
      toast.info("尚未配置监听仓库（设置 → GitHub 集成 → 通知仓库）")
      return
    }
    setSyncing(true)
    const login = await fetchCurrentLogin(githubToken)
    if (!login) {
      toast.error("无法获取当前登录用户，请检查 Token 权限")
      setSyncing(false)
      return
    }
    let total = 0
    let anyTruncated = false
    for (const cfg of notificationRepos) {
      try {
        const res = await fetchRepoIssues(cfg.repo, {
          onlyMine: true,
          token: githubToken,
          currentLogin: login,
          perPage: PER_PAGE,
        })
        if (res.items.length) {
          addToIssueQueue(res.items)
          total += res.items.length
        }
        if (res.truncated) anyTruncated = true
      } catch {
        // 单个仓库失败不中断其余
      }
    }
    setSyncing(false)
    if (total === 0) toast.info("监听仓库中没有 assign 给你的 issue / PR")
    else {
      toast.success(`已从监听仓库同步 ${total} 条（assign 给你的）`)
      if (anyTruncated) toast.warning("部分仓库 issue/PR 超过 100 条，仅导入前 100 条")
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* 顶栏 */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <GitPullRequest className="size-5 text-primary" />
        <h1 className="text-base font-semibold">GitHub 队列</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
            {syncing ? "同步中…" : "从监听同步"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="size-4" />
            添加仓库 Issue/PR
          </Button>
          {issueQueue.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-muted-foreground"
              onClick={() => {
                if (window.confirm("确定清空整个 GitHub 队列？此操作不可撤销。")) {
                  clearIssueQueue()
                  toast.success("已清空队列")
                }
              }}
            >
              <Trash2 className="size-4" />
              清空
            </Button>
          )}
        </div>
      </div>

      {/* 看板 */}
      <div className="grid min-h-0 flex-1 grid-cols-4 gap-3 overflow-auto p-4">
        {COLUMNS.map((col) => {
          const items = issueQueue.filter((it) => it.column === col.id)
          return (
            <div key={col.id} className="flex min-h-0 flex-col rounded-lg border bg-muted/20">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-sm font-medium">{col.label}</span>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <div className="flex flex-1 flex-col gap-2 overflow-auto p-2">
                {items.length === 0 ? (
                  <p className="px-1 py-4 text-center text-xs text-muted-foreground">空</p>
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

      {/* 添加对话框 */}
      <Dialog
        open={addOpen}
        onOpenChange={(v) => {
          if (!v) {
            setAddOpen(false)
            setRepoInput("")
            setOnlyMine(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>添加仓库 Issue/PR</DialogTitle>
            <DialogDescription>
              输入 owner/name 或完整 GitHub 链接。单次最多拉取 {PER_PAGE} 条，超出仅取前 {PER_PAGE} 条并提示。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="repo">仓库</Label>
              <Input
                id="repo"
                placeholder="owner/repo 或 https://github.com/owner/repo"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !loading) handleAdd()
                }}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={onlyMine}
                onChange={(e) => setOnlyMine(e.target.checked)}
              />
              仅拉取「分配给我的」（需已填 GitHub Token）
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAddOpen(false)}>
                取消
              </Button>
              <Button onClick={handleAdd} disabled={loading}>
                {loading ? "拉取中…" : "拉取"}
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
        {item.merged && <span className="text-green-600">已合并</span>}
        {item.state === "closed" && !item.merged && <span>已关闭</span>}
        {item.assigneeMe && <span className="text-emerald-600">@me</span>}
        <a
          href={item.htmlUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 hover:text-foreground"
        >
          <ExternalLink className="size-3" />
          打开
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
          删除
        </button>
      </div>
    </div>
  )
}
