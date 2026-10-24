"use client"

// AI 会话列表面板（TODO 25）：渲染在全局侧边栏内容区（工具栏选中「AI 对话」时显示）。
// 会话持久化在 store；流式状态订阅全局队列。

import { Fragment, useMemo, useState, useSyncExternalStore } from "react"
import { BotMessageSquare, MoreVertical, PanelLeftClose, Pencil, Pin, PinOff, Plus, Trash2 } from "lucide-react"

import { useWorkspace } from "@/lib/store"
import type { Conversation } from "@/lib/types"
import { subscribeQueue, isWorking, stopConversation } from "@/lib/ai/request-queue"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"
import { useNow } from "@/hooks/use-now"

// 锚点：最后一条用户消息的创建时间（继续对话自动置顶）；旧消息/无消息回落 updatedAt/createdAt。
function conversationAnchor(c: Conversation): number {
  for (let i = c.messages.length - 1; i >= 0; i--) {
    const m = c.messages[i]
    if (m.role === "user" && m.createdAt) return m.createdAt
  }
  return c.updatedAt ?? c.createdAt
}

// 天数差相对「今天本地零点」：0=今天，1=昨天，负数=未来。
function dayDiff(anchor: number, now: number): number {
  const a = new Date(anchor)
  const n = new Date(now)
  const a0 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const n0 = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())
  return Math.floor((n0 - a0) / 86400000)
}

function bucketKey(c: Conversation, now: number): string {
  if (c.pinned) return "pinned"
  const d = dayDiff(conversationAnchor(c), now)
  if (d <= 0) return "today"
  if (d === 1) return "yesterday"
  if (d <= 7) return "week"
  if (d <= 30) return "month30"
  const a = new Date(conversationAnchor(c))
  return `ym-${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, "0")}`
}

const GROUP_LABEL: Record<string, string> = {
  pinned: "sessions.bucket.pinned",
  today: "sessions.bucket.today",
  yesterday: "sessions.bucket.yesterday",
  week: "sessions.bucket.week",
  month30: "sessions.bucket.month30",
}
function groupLabel(key: string): string {
  return GROUP_LABEL[key] ?? key
}

// 固定分组顺序（置顶最前，时间由近到远）；未知 key（ym-*）统一排在 month30 之后。
const GROUP_ORDER = ["pinned", "today", "yesterday", "week", "month30"]
function groupRank(key: string): number {
  const i = GROUP_ORDER.indexOf(key)
  return i >= 0 ? i : GROUP_ORDER.length
}

// 生成中的小圆点：useSyncExternalStore 订阅全局队列，仅状态变化时重渲染。
function StreamingDot({ id }: { id: string }) {
  const { t } = useTranslation()
  const working = useSyncExternalStore(subscribeQueue, () => isWorking(id), () => false)
  if (!working) return null
  return (
    <span
      className="ml-1 size-1.5 shrink-0 animate-pulse rounded-full bg-primary"
      title={t("sessions.generating")}
    />
  )
}

export function AiSessionsPanel() {
  const { t } = useTranslation()
  const conversations = useWorkspace((s) => s.conversations)
  const activeId = useWorkspace((s) => s.activeConversationId)
  const createConversation = useWorkspace((s) => s.createConversation)
  const selectConversation = useWorkspace((s) => s.selectConversation)
  const deleteConversation = useWorkspace((s) => s.deleteConversation)
  const togglePinConversation = useWorkspace((s) => s.togglePinConversation)
  const renameConversation = useWorkspace((s) => s.renameConversation)
  const setSidebarCollapsed = useWorkspace((s) => s.setSidebarCollapsed)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState("")
  const [delTarget, setDelTarget] = useState<string | null>(null)

  const startEdit = (c: { id: string; title: string }) => {
    setEditingId(c.id)
    setEditingTitle(c.title)
  }
  const commitEdit = () => {
    if (editingId) renameConversation(editingId, editingTitle)
    setEditingId(null)
  }
  const onDelete = (id: string) => {
    stopConversation(id)
    deleteConversation(id)
  }

  // 时间走 useNow（外部时钟源，每分钟刷新）：渲染期直接调 Date.now() 会触发 react-hooks/purity
  const now = useNow()
  const groups = useMemo(() => {
    const byKey = new Map<string, Conversation[]>()
    for (const c of conversations) {
      const k = bucketKey(c, now)
      if (!byKey.has(k)) byKey.set(k, [])
      byKey.get(k)!.push(c)
    }
    const list = [...byKey.entries()].map(([key, items]) => ({
      key,
      items: [...items].sort((a, b) => conversationAnchor(b) - conversationAnchor(a)),
    }))
    list.sort((a, b) => {
      const ra = groupRank(a.key)
      const rb = groupRank(b.key)
      if (ra !== rb) return ra - rb
      // 同为 ym-* 时近的月份（key 字典序大）在前
      return b.key.localeCompare(a.key)
    })
    return list
  }, [conversations, now])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <BotMessageSquare className="size-4 text-primary" />
        <span className="text-sm font-semibold">{t("toolbar.aiChat")}</span>
        <span className="text-xs text-muted-foreground">{conversations.length}</span>
        <button
          type="button"
          onClick={() => setSidebarCollapsed(true)}
          className="ml-auto flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={t("sidebar.collapse")}
        >
          <PanelLeftClose className="size-4" />
          <span className="sr-only">{t("sidebar.collapse")}</span>
        </button>
      </div>
      <Button
        variant="default"
        className="mx-3 my-2 w-[calc(100%-1.5rem)] gap-2"
        onClick={() => {
          // 已有空对话（无消息记录）则直接切换过去，不重复创建
          const empty = conversations.find((c) => c.messages.length === 0)
          if (empty) selectConversation(empty.id)
          else createConversation()
        }}
        title={t("sessions.newChat")}
      >
        <Plus className="size-4" />
        {t("sessions.newChat")}
      </Button>
      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        <ul className="flex flex-col gap-0.5 p-2">
          {groups.map((g) => (
            <Fragment key={g.key}>
              <li className="px-2 pb-1 pt-3 text-xs font-medium text-muted-foreground first:pt-0">
                {groupLabel(g.key).startsWith("ym-") ? groupLabel(g.key).slice(3) : t(groupLabel(g.key))}
              </li>
              {g.items.map((c) => (
                <li key={c.id}>
                  <div
                    className={cn(
                      "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm",
                      c.id === activeId
                        ? "bg-accent text-accent-foreground"
                        : "cursor-pointer hover:bg-accent/50",
                    )}
                    onClick={() => c.id !== activeId && selectConversation(c.id)}
                  >
                    {editingId === c.id ? (
                      <input
                        autoFocus
                        maxLength={10}
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value.slice(0, 10))}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit()
                          if (e.key === "Escape") setEditingId(null)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="min-w-0 flex-1 rounded bg-background px-1 py-0.5 text-sm outline-none ring-1 ring-ring/40"
                      />
                    ) : (
                      <span
                        className="min-w-0 flex-1 truncate"
                        onDoubleClick={() => startEdit(c)}
                      >
                        {c.title}
                      </span>
                    )}
                    {c.pinned && <Pin className="size-3 shrink-0 text-muted-foreground" />}
                    <StreamingDot id={c.id} />
                    {editingId !== c.id && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 data-[popup-open]:opacity-100 focus-visible:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                          aria-label={t("sessions.more")}
                        >
                          <MoreVertical className="size-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" side="bottom">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              togglePinConversation(c.id)
                            }}
                          >
                            {c.pinned ? (
                              <>
                                <PinOff className="size-4" />
                                {t("sessions.unpin")}
                              </>
                            ) : (
                              <>
                                <Pin className="size-4" />
                                {t("sessions.pin")}
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              startEdit(c)
                            }}
                          >
                            <Pencil className="size-4" />
                            {t("common.rename")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={(e) => {
                              e.stopPropagation()
                              setDelTarget(c.id)
                            }}
                          >
                            <Trash2 className="size-4" />
                            {t("common.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </li>
              ))}
            </Fragment>
          ))}
        </ul>
      </ScrollArea>

      <AlertDialog
        open={delTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDelTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sessions.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("sessions.deleteDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (delTarget) onDelete(delTarget)
                setDelTarget(null)
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
