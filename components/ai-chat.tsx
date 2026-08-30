// AI 助手视图：侧边栏「AI 助手」入口进入。
// 多会话架构（类似成熟 AI 网页服务）：左侧为对话列表，各自持有完整上下文，
// 主区为所选对话的消息流。会话持久化在 store（localStorage），刷新后保留。
// 流式请求由 lib/ai/request-queue 全局持有——切换会话 / 切走视图都不会中断在途请求。
// 配置（provider / apiKey）来自 store.settings；skills 由队列内部读取。
// AI 回复用项目内置的 MarkdownView 安全渲染（marked.lexer + React，不接外部呈现库）。

"use client"

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react"
import {
  Bot,
  Send,
  Square,
  Trash2,
  Wrench,
  AlertTriangle,
  User,
  Plus,
  Pencil,
  MessageSquare,
} from "lucide-react"

import { useWorkspace } from "@/lib/store"
import { useAIChat } from "@/lib/ai/use-ai-chat"
import { subscribeQueue, isWorking, stopConversation } from "@/lib/ai/request-queue"
import { loadSkills, type Skill } from "@/lib/ai/skills"
import { BUILTIN_SKILL_DISPLAY } from "@/lib/ai/builtin-skills"
import { AI_PROVIDERS } from "@/lib/ai/providers"
import { MarkdownView } from "@/components/markdown-view"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

export function AIChatWorkspace() {
  const settings = useWorkspace((s) => s.settings)
  const setSettingsOpen = useWorkspace((s) => s.setSettingsOpen)
  const conversations = useWorkspace((s) => s.conversations)
  const activeId = useWorkspace((s) => s.activeConversationId)
  const createConversation = useWorkspace((s) => s.createConversation)
  const selectConversation = useWorkspace((s) => s.selectConversation)
  const deleteConversation = useWorkspace((s) => s.deleteConversation)
  const renameConversation = useWorkspace((s) => s.renameConversation)

  const config = useMemo(
    () => ({
      providerId: settings.aiProvider,
      apiKey: settings.aiApiKey,
      baseURL: settings.aiBaseUrl || undefined,
      model: settings.aiModel || undefined,
    }),
    [settings.aiProvider, settings.aiApiKey, settings.aiBaseUrl, settings.aiModel],
  )

  // 进入视图时确保至少有一个会话、且有一个被选中。
  // createdRef 防止 StrictMode 下重复创建；prevLenRef 在「全部删除」后允许再次创建。
  const createdRef = useRef(false)
  const prevLenRef = useRef(0)
  useEffect(() => {
    const len = conversations.length
    if (prevLenRef.current > 0 && len === 0) createdRef.current = false
    prevLenRef.current = len
    if (len === 0 && !createdRef.current) {
      createdRef.current = true
      createConversation()
    } else if (len > 0 && !activeId) {
      selectConversation(conversations[0].id)
    }
  // 仅依赖 length 与 activeId：conversations 数组身份每次提交都会变，但本 effect
  // 只在「无会话」或「无选中」时动作，无需对其整体建立依赖。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.length, activeId, createConversation, selectConversation])

  const active = conversations.find((c) => c.id === activeId) ?? null

  const [skills, setSkills] = useState<Skill[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState("")
  const [railOpen, setRailOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState("")

  const providerLabel = AI_PROVIDERS[settings.aiProvider]?.label ?? settings.aiProvider
  const hasKey = settings.aiApiKey.trim().length > 0
  const userAvatar = settings.aiUserAvatar || ""

  useEffect(() => {
    loadSkills().then(setSkills).catch(() => setSkills([]))
  }, [])

  // 内置技能的展示清单（与 markdown 技能合并展示）
  const builtinSkills: Skill[] = BUILTIN_SKILL_DISPLAY.map((s) => ({
    name: s.name,
    displayName: s.name,
    description: s.description,
    body: s.description,
  }))

  const { messages, isLoading, send, stop, clear } = useAIChat({
    config,
    conversationId: active?.id ?? "",
  })

  // 新消息后滚到底部
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const startEdit = (c: { id: string; title: string }) => {
    setEditingId(c.id)
    setEditingTitle(c.title)
  }
  const commitEdit = () => {
    if (editingId) renameConversation(editingId, editingTitle)
    setEditingId(null)
  }
  const onDelete = (id: string) => {
    if (!confirm("确定删除这个对话？删除后不可恢复。")) return
    // 若该对话正在生成，先中断其请求（其余对话不受影响）
    stopConversation(id)
    deleteConversation(id)
    setRailOpen(false)
  }
  const onSelect = (id: string) => {
    if (id === activeId) {
      setRailOpen(false)
      return
    }
    // 注意：不再中断进行中的流——请求在后台继续，切回时可看到其回复
    // （"正常中断应当保持对话请求"：切换会话 / 视图都不杀掉在途请求）。
    selectConversation(id)
    setRailOpen(false)
  }

  const submit = () => {
    const text = input
    if (!text.trim() || isLoading || !active || !hasKey) return
    const isFirst = active.messages.length === 0
    setInput("")
    void send(text)
    // 首条消息自动取名（不发额外请求），取前约 18 字
    if (isFirst) renameConversation(active.id, text.trim().slice(0, 18))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="relative flex h-full min-h-0">
      {/* 移动端遮罩 */}
      {railOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setRailOpen(false)}
        />
      )}

      {/* 左侧：对话列表 */}
      <aside
        className={cn(
          "z-30 flex w-64 shrink-0 flex-col border-r bg-muted/30",
          "max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:shadow-xl max-md:transition-transform",
          railOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full",
        )}
      >
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Bot className="size-4 text-primary" />
          <span className="text-sm font-semibold">对话</span>
          <span className="text-xs text-muted-foreground">{conversations.length}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            onClick={() => {
              createConversation()
              setRailOpen(false)
            }}
            title="新建对话"
          >
            <Plus />
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1 overflow-hidden">
          <ul className="flex flex-col gap-0.5 p-2">
            {conversations.map((c) => (
              <li key={c.id}>
                <div
                  className={cn(
                    "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm",
                    c.id === activeId
                      ? "bg-accent text-accent-foreground"
                      : "cursor-pointer hover:bg-accent/50",
                  )}
                  onClick={() => c.id !== activeId && onSelect(c.id)}
                >
                  <MessageSquare className="size-3.5 shrink-0 opacity-60" />
                  {editingId === c.id ? (
                    <input
                      autoFocus
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
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
                  <StreamingDot id={c.id} />
                  {editingId !== c.id && (
                    <>
                      <button
                        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation()
                          startEdit(c)
                        }}
                        title="重命名"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(c.id)
                        }}
                        title="删除"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </aside>

      {/* 主区 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b px-4 py-2">
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            onClick={() => setRailOpen(true)}
            title="对话列表"
          >
            <MessageSquare />
          </Button>
          <Bot className="size-4 text-primary" />
          <h2 className="truncate text-sm font-semibold">{active?.title ?? "AI 助手"}</h2>
          <span className="text-xs text-muted-foreground">{providerLabel}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            onClick={clear}
            disabled={!active}
            title="清空当前对话"
          >
            <Trash2 />
          </Button>
        </header>

        <div
          ref={scrollRef}
          className="native-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3"
        >
          {!hasKey && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                尚未配置 API Key。
                <button
                  className="mx-1 underline underline-offset-2"
                  onClick={() => setSettingsOpen(true)}
                >
                  去设置
                </button>
                选择供应商并填写 Key（仅本机存储）。
              </div>
            </div>
          )}

          {messages.length === 0 && (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>在下方输入消息即可开始对话。可用技能（用户技能 + 内置只读技能）：</p>
              {skills.length === 0 && builtinSkills.length === 0 ? (
                <p className="text-xs">（未找到技能文件，不影响普通对话）</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {[...skills, ...builtinSkills].map((s) => (
                    <li
                      key={s.name}
                      className="rounded-full border bg-muted px-2 py-0.5 text-xs"
                      title={s.description}
                    >
                      {s.displayName}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {messages.map((m) => {
            const isUser = m.role === "user"
            return (
              <div
                key={m.id}
                className={cn(
                  "flex items-start gap-2",
                  isUser ? "flex-row-reverse justify-start" : "flex-row justify-start",
                )}
              >
                {/* 头像：左侧机器人默认头像 / 右侧用户头像（可自定义） */}
                {isUser ? (
                  userAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={userAvatar}
                      alt="用户头像"
                      className="size-8 shrink-0 rounded-full object-cover ring-1 ring-border"
                    />
                  ) : (
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border">
                      <User className="size-4" />
                    </div>
                  )
                ) : (
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-border">
                    <Bot className="size-4" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[78%] rounded-lg px-3 py-2 text-sm",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  {isUser ? (
                    <span className="whitespace-pre-wrap break-words">{m.content}</span>
                  ) : m.content ? (
                    <MarkdownView text={m.content} />
                  ) : isLoading ? (
                    <span className="text-muted-foreground">思考中…</span>
                  ) : null}
                  {m.tools && m.tools.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1 border-t border-border/50 pt-1.5">
                      {m.tools.map((t, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded bg-background/60 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                          title={t.name}
                        >
                          <Wrench className="size-3" />
                          {t.display ?? t.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <form
          className="flex items-end gap-2 border-t p-3"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              hasKey
                ? active
                  ? "输入消息，Enter 发送，Shift+Enter 换行"
                  : "请先选择或新建一个对话"
                : "请先在设置中配置 API Key"
            }
            disabled={!active || !hasKey}
            className="native-scroll max-h-40 min-h-9 flex-1 resize-none"
            rows={1}
          />
          {isLoading ? (
            <Button type="button" variant="outline" size="icon" onClick={stop} title="停止">
              <Square />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || !active || !hasKey}
              title="发送"
            >
              <Send />
            </Button>
          )}
        </form>
      </div>
    </div>
  )
}

// 对话列表中某个会话是否正在生成（流式或排队中）——订阅全局队列，仅在状态变化时重渲染该小圆点。
function StreamingDot({ id }: { id: string }) {
  const working = useSyncExternalStore(subscribeQueue, () => isWorking(id), () => false)
  if (!working) return null
  return (
    <span
      className="ml-1 size-1.5 shrink-0 animate-pulse rounded-full bg-primary"
      title="正在生成…"
    />
  )
}
