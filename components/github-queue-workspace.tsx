"use client"

// GitHub Issue/PR 看板队列（TODO 36）。
// 四列：Urgent / Assigned / Completed / Backlog。卡片来源 = 监听仓库：
// 「添加监听仓库」自动创建 GitHub 监听并回扫一次存量；此后由通知调度器增量入队
// （自有仓库全量、他人仓库仅 @me；close/merge/reopen 只回写状态标记，见 lib/notifications/scheduler.ts）。
// 拉取走 lib/github-queue.ts（复用 github-sender 的认证/限流思路，独立模块）。
// AI 可通过内置技能 wb_get_github_queue 只读访问队列（见 lib/ai/builtin-skills.ts）。

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
  // 手动添加单条 Issue/PR
  const [addSingleOpen, setAddSingleOpen] = useState(false)
  const [issueInput, setIssueInput] = useState("")
  const [singleLoading, setSingleLoading] = useState(false)
  const [query, setQuery] = useState("")

  // 实时搜索：按 标题 / 正文 / 仓库 / 提交者 / #编号 过滤四列（拼音增强：纯字母 query 追加全拼/首字母命中）
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

  // 添加监听仓库：先拉一次存量（同时校验仓库存在，404 不予添加——2026-10-10 主人口径），
  // 校验通过才落监听配置并入队（自有仓库全量、他人仓库仅 @me）。
  async function handleAdd() {
    const repo = parseRepoInput(repoInput)
    if (!repo.includes("/")) {
      toast.error("仓库格式应为 owner/name 或完整 GitHub 链接")
      return
    }
    if (notificationRepos.some((r) => r.repo === repo)) {
      toast.info("该仓库已在监听列表中")
      return
    }
    setLoading(true)
    try {
      const login = await fetchCurrentLogin(githubToken)
      // 先拉一次：既是存在性校验也是存量回扫；失败（404 / 限流 / 网络）一律不落监听配置
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
          "已添加监听；未填写 GitHub Token，后续自动入队需 Token（设置 → 账户与同步）"
        )
        setAddOpen(false)
        setRepoInput("")
        return
      }
      const isMine = repo.split("/")[0] === login
      const items = isMine ? res.items : res.items.filter((it) => it.assigneeMe)
      if (items.length === 0) {
        toast.info(
          `已添加监听（${repo} 暂无${isMine ? "" : "分配给你的"}存量 issue/PR）`
        )
      } else {
        addToIssueQueue(items)
        toast.success(`已添加监听并回扫 ${items.length} 条 issue/PR 入队`)
      }
      if (res.truncated) {
        toast.warning(`该仓库 issue/PR 超过 ${PER_PAGE} 条，仅导入前 ${PER_PAGE} 条；如需更多请缩小范围。`)
      }
      setAddOpen(false)
      setRepoInput("")
    } catch (e) {
      const msg = e instanceof Error ? e.message : "添加失败"
      if (msg === "RATE_LIMITED")
        toast.error("添加失败：GitHub API 限流（403/429），请稍后重试")
      else if (msg.includes("404"))
        toast.error(`仓库不存在（404），未添加：${repo}`)
      else toast.error(`添加失败：${msg}`)
    } finally {
      setLoading(false)
    }
  }

  // 手动添加单条 Issue / PR：解析链接或 owner/repo#编号 → 拉取 → 入队（已在队列中则刷新状态）
  async function handleAddSingle() {
    const ref = parseIssueRef(issueInput)
    if (!ref || !ref.repo.includes("/") || !Number.isFinite(ref.number) || ref.number <= 0) {
      toast.error("无法识别：粘贴 issue/pull 完整链接或 owner/repo#编号")
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
          ? `已在队列中（状态已刷新）：${item.repo}#${item.number}`
          : `已添加：${item.repo}#${item.number}`,
      )
      setAddSingleOpen(false)
      setIssueInput("")
    } catch (e) {
      const msg = e instanceof Error ? e.message : "添加失败"
      if (msg === "RATE_LIMITED") toast.error("GitHub API 限流（403/429），请稍后重试")
      else if (msg.includes("404")) toast.error("该 Issue / PR 不存在（404）")
      else toast.error(`添加失败：${msg}`)
    } finally {
      setSingleLoading(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* 顶栏 */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <GitPullRequest className="size-5 text-primary" />
        <h1 className="text-base font-semibold">GitHub 队列</h1>
        <div className="ml-3 flex items-center gap-2">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索 issue/PR"
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
            添加 Issue/PR
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="size-4" />
            添加监听仓库
          </Button>
        </div>
      </div>

      {/* 看板 */}
      <div className="grid min-h-0 flex-1 grid-cols-4 gap-3 overflow-auto native-scroll p-4">
        {COLUMNS.map((col) => {
          const items = visible.filter((it) => it.column === col.id)
          // TODO 46：按入队时间倒序（最新在上）；旧存档无 queuedAt 回落 0 沉底。filter 返回新数组，可安全原地排序（稳定排序，同刻入队保持原相对次序）
          items.sort((a, b) => (b.queuedAt ?? 0) - (a.queuedAt ?? 0))
          return (
            <div key={col.id} className="flex min-h-0 flex-col rounded-lg border bg-muted/20">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-sm font-medium">{col.label}</span>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto native-scroll p-2">
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

      {/* 添加监听仓库对话框 */}
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
            <DialogTitle>添加监听仓库</DialogTitle>
            <DialogDescription>
              输入 owner/name 或完整 GitHub 链接。添加前会先校验仓库存在（不存在的仓库不予添加）；
              添加后自动创建 GitHub 监听（只扫描 Issue + PR 通知）并回扫一次存量 issue/PR 入队
              （最多 {PER_PAGE} 条）；此后新动态由监听自动入队。
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
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAddOpen(false)}>
                取消
              </Button>
              <Button onClick={handleAdd} disabled={loading}>
                {loading ? "校验并添加中…" : "添加"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 手动添加单条 Issue/PR 对话框 */}
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
            <DialogTitle>添加 Issue / PR</DialogTitle>
            <DialogDescription>
              粘贴 issue / pull 完整链接（含 #锚点也可以）或 owner/repo#编号。
              已在队列中时会刷新其状态，不改变所在列。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="issue-ref">链接或编号</Label>
              <Input
                id="issue-ref"
                placeholder="https://github.com/owner/repo/issues/123 或 owner/repo#123"
                value={issueInput}
                onChange={(e) => setIssueInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !singleLoading) handleAddSingle()
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAddSingleOpen(false)}>
                取消
              </Button>
              <Button onClick={handleAddSingle} disabled={singleLoading}>
                {singleLoading ? "获取中…" : "添加"}
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
