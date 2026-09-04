// AI 助手视图：侧边栏「AI 助手」入口进入。
// 多会话架构（类似成熟 AI 网页服务）：左侧为对话列表，各自持有完整上下文，
// 主区为所选对话的消息流。会话持久化在 store（localStorage），刷新后保留。
// 流式请求由 lib/ai/request-queue 全局持有——切换会话 / 切走视图都不会中断在途请求。
// 配置（provider / apiKey）来自 store.settings；skills 由队列内部读取。
// 用户消息与 AI 回复统一用 RichTextView 渲染（与节点内容同管线：表格/代码高亮/卡片/内文图一致生效）。

"use client"

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react"
import {
  Bot,
  Send,
  Square,
  Trash2,
  Wrench,
  Sparkles,
  AlertTriangle,
  User,
  Plus,
  Pencil,
  MessageSquare,
  Copy,
  RefreshCw,
  MoreVertical,
  Pin,
  PinOff,
} from "lucide-react"
import { toast } from "sonner"

import { useWorkspace } from "@/lib/store"
import { useAIChat, type AIChatConfig } from "@/lib/ai/use-ai-chat"
import { subscribeQueue, isWorking, stopConversation } from "@/lib/ai/request-queue"
import { RichTextView } from "@/components/richtext/rich-text-view"
import { ModelManagerDialog } from "@/components/ai-models-dialog"
import { SkillsToggleDialog } from "@/components/ai-skills-dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

// 新对话空状态下的预置问题；第三个由我们替用户补充。
const PRESET_QUESTIONS = [
  "今天适合做什么？",
  "最近有什么新兴的开源项目？",
  "用通俗的语言给我讲讲 AI Agent 是什么？",
]

// 复制消息原文（raw 文本）到剪贴板，并给出轻量提示。
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success("已复制")
  } catch {
    toast.error("复制失败")
  }
}

export function AIChatWorkspace() {
  const settings = useWorkspace((s) => s.settings)
  const conversations = useWorkspace((s) => s.conversations)
  const activeId = useWorkspace((s) => s.activeConversationId)
  const createConversation = useWorkspace((s) => s.createConversation)
  const selectConversation = useWorkspace((s) => s.selectConversation)
  const deleteConversation = useWorkspace((s) => s.deleteConversation)
  const togglePinConversation = useWorkspace((s) => s.togglePinConversation)
  const renameConversation = useWorkspace((s) => s.renameConversation)
  const pendingAiQuery = useWorkspace((s) => s.pendingAiQuery)
  const clearPendingAiQuery = useWorkspace((s) => s.clearPendingAiQuery)

  // 当前选中的模型（优先 aiActiveModelId，否则取第一条）；无模型则为 null。
  const activeModel = useMemo(
    () =>
      settings.aiModels.find((m) => m.id === settings.aiActiveModelId) ??
      settings.aiModels[0] ??
      null,
    [settings.aiModels, settings.aiActiveModelId],
  )
  const config = useMemo<AIChatConfig | null>(
    () =>
      activeModel
        ? {
            providerId: activeModel.provider,
            apiKey: activeModel.apiKey,
            baseURL: activeModel.baseUrl || undefined,
            model: activeModel.model || undefined,
          }
        : null,
    [activeModel],
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

  const scrollRef = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState("")
  const [railOpen, setRailOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState("")
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [modelsOpen, setModelsOpen] = useState(false)

  // 对话列表宽度（可拖拽分隔线调整，持久化到 localStorage）
  const RAIL_MIN = 180
  const RAIL_MAX = 480
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const latestWidthRef = useRef(256)
  const [railWidth, setRailWidth] = useState(256)
  useEffect(() => {
    try {
      const v = localStorage.getItem("ai-rail-width")
      if (v) {
        const n = Number(v)
        if (!Number.isNaN(n)) setRailWidth(Math.min(RAIL_MAX, Math.max(RAIL_MIN, n)))
      }
    } catch {
      /* SSR / 隐私模式下忽略 */
    }
  }, [])
  const startDragRail = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    draggingRef.current = true
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    const clamp = (w: number) => Math.min(RAIL_MAX, Math.max(RAIL_MIN, w))
    const move = (ev: PointerEvent) => {
      if (!draggingRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const w = clamp(ev.clientX - rect.left)
      latestWidthRef.current = w
      setRailWidth(w)
    }
    const up = () => {
      draggingRef.current = false
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      try {
        localStorage.setItem("ai-rail-width", String(latestWidthRef.current))
      } catch {
        /* 忽略 */
      }
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  const modelLabel = activeModel?.label ?? "未配置模型"
  const hasKey = !!activeModel && activeModel.apiKey.trim().length > 0
  const userAvatar = settings.aiUserAvatar || ""
  const assistantAvatar = settings.aiAssistantAvatar || ""

  const { messages, isLoading, send, stop, regenerateLast } = useAIChat({
    config,
    conversationId: active?.id ?? "",
  })

  // 新消息后滚到底部
  // 消息列表现为 Base UI ScrollArea，需要滚动的是 viewport（data-slot="scroll-area-viewport"），
  // 兜底仍支持原生的 el 自身滚动。
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const viewport = el.closest(
      '[data-slot="scroll-area-viewport"]',
    ) as HTMLElement | null
    const scroller = viewport ?? el
    scroller.scrollTop = scroller.scrollHeight
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
  // 置顶的对话排在最前；组内保持原有相对顺序（Array.sort 在现代引擎为稳定排序）。
  const ordered = useMemo(
    () =>
      [...conversations].sort(
        (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0),
      ),
    [conversations],
  )
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
    // 首条消息自动取名（不发额外请求），最多取前 10 字
    if (isFirst) renameConversation(active.id, text.trim().slice(0, 10))
  }

  // 点击预置问题：已配置模型则直接发送；否则仅填入输入框提示用户去配置。
  const applyPreset = (q: string) => {
    if (!active || !hasKey) {
      setInput(q)
      return
    }
    const isFirst = active.messages.length === 0
    setInput("")
    void send(q)
    if (isFirst) renameConversation(active.id, q.trim().slice(0, 10))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  // 消费外部触发的"打开 AI 闲聊并自动询问"（如日历 DayDetail 的 节日/笔记 查询）：
  // 新建会话切到本视图后，pendingAiQuery 就绪即发送；若无模型配置则填入输入框并提示。
  useEffect(() => {
    const text = pendingAiQuery
    if (!text) return
    clearPendingAiQuery()
    if (!active || !hasKey) {
      setInput(text)
      if (!hasKey) toast.error("请先在设置中配置 AI 模型后再询问")
      return
    }
    const isFirst = active.messages.length === 0
    setInput("")
    void send(text)
    if (isFirst) renameConversation(active.id, text.trim().slice(0, 10))
    // 仅依赖 pendingAiQuery：消费一次即清空，无需对其余依赖建立依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAiQuery])

  return (
    <div ref={containerRef} className="relative flex h-full min-h-0">
      {/* 移动端遮罩 */}
      {railOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setRailOpen(false)}
        />
      )}

      {/* 左侧：对话列表 */}
      <aside
        style={{ width: railWidth }}
        className={cn(
          "z-30 flex shrink-0 flex-col border-r bg-muted/30",
          "max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:shadow-xl max-md:transition-transform",
          railOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full",
        )}
      >
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Bot className="size-4 text-primary" />
          <span className="text-sm font-semibold">对话</span>
          <span className="text-xs text-muted-foreground">{conversations.length}</span>
        </div>
        <Button
          variant="default"
          className="mx-3 my-2 w-[calc(100%-1.5rem)] justify-start gap-2"
          onClick={() => {
            // 已存在「空对话」（无任何消息记录）则直接切换过去，不重复创建
            const empty = conversations.find((c) => c.messages.length === 0)
            if (empty) selectConversation(empty.id)
            else createConversation()
            setRailOpen(false)
          }}
          title="开启新对话"
        >
          <Plus className="size-4" />
          开启新对话
        </Button>
        <ScrollArea className="min-h-0 flex-1 overflow-hidden">
          <ul className="flex flex-col gap-0.5 p-2">
            {ordered.map((c) => (
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
                  {c.pinned && (
                    <Pin className="size-3 shrink-0 text-muted-foreground" />
                  )}
                  <StreamingDot id={c.id} />
                  {editingId !== c.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 data-[popup-open]:opacity-100 focus-visible:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                        aria-label="更多操作"
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
                              取消置顶
                            </>
                          ) : (
                            <>
                              <Pin className="size-4" />
                              置顶
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
                          重命名
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDelete(c.id)
                          }}
                        >
                          <Trash2 className="size-4" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </aside>

      {/* 拖拽分隔线（仅桌面端）：左右拖动调整对话列表宽度 */}
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={startDragRail}
        className="group hidden w-1.5 shrink-0 cursor-col-resize md:block"
        title="拖动调整对话列表宽度"
      >
        <div className="mx-auto h-full w-px bg-border/40 transition-colors group-hover:bg-primary/60" />
      </div>

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
          <span className="text-xs text-muted-foreground">{modelLabel}</span>
        </header>

        <ScrollArea className="min-h-0 flex-1 overflow-hidden">
          <div ref={scrollRef} className="flex flex-col px-4 py-3">
          {!hasKey && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                尚未配置模型或 API Key。
                <button
                  className="mx-1 underline underline-offset-2"
                  onClick={() => setModelsOpen(true)}
                >
                  去配置模型
                </button>
                填写 Key 后即可对话（仅本机存储）。
              </div>
            </div>
          )}

          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-6 px-2 text-center">
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold">今天想问点什么？</h1>
                <p className="text-sm text-muted-foreground">
                  挑选一个问题开始，或直接在下方输入。
                </p>
              </div>
              <div className="flex w-full max-w-md flex-col gap-2">
                {PRESET_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => applyPreset(q)}
                    className="rounded-xl border bg-muted/30 px-4 py-3 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">

          {messages.map((m) => {
            const isUser = m.role === "user"
            return (
              // 外层竖列：气泡 + 反应按钮；用户消息整体靠右、AI 消息靠左，
              // 反应按钮因此自然贴在气泡正下方（气泡之外）。
              <div
                key={m.id}
                className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}
              >
                <div
                  className={cn(
                    "flex items-start gap-2",
                    isUser ? "flex-row-reverse" : "flex-row",
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
                  ) : assistantAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={assistantAvatar}
                      alt="AI 头像"
                      className="size-8 shrink-0 rounded-full object-cover ring-1 ring-border"
                    />
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
                    {m.content ? (
                      // 用户与 AI 回复统一走 RichTextView（与节点内容同渲染管线：
                      // 表格 / 代码高亮 / 任务列表 / GitHub·B站卡 / 内文图一致生效）
                      <RichTextView content={m.content} className="chat-md" />
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

                {/* 反应（reaction）：直接贴在气泡下方、气泡之外，以 icon 按钮呈现 */}
                <div className="flex items-center gap-0.5 text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => copyText(m.content)}
                    className="rounded p-1 transition-colors hover:bg-accent hover:text-accent-foreground"
                    title="复制"
                    aria-label="复制"
                  >
                    <Copy className="size-3.5" />
                  </button>
                  {!isUser && (
                    <button
                      type="button"
                      onClick={regenerateLast}
                      disabled={isLoading}
                      className="rounded p-1 transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                      title="重新回答"
                      aria-label="重新回答"
                    >
                      <RefreshCw className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
            </div>
          )}
          </div>
        </ScrollArea>

        <form
          className="flex flex-col gap-2 border-t p-3"
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
                : "请先在「模型」中配置 API Key"
            }
            disabled={!active || !hasKey}
            className="native-scroll max-h-40 min-h-9 flex-1 resize-none"
            rows={1}
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setSkillsOpen(true)}
              title="技能启停"
            >
              <Wrench className="size-4" />
              技能
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setModelsOpen(true)}
              title="模型选择"
            >
              <Sparkles className="size-4" />
              {modelLabel}
            </Button>
            <div className="ml-auto" />
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
          </div>
        </form>
        <SkillsToggleDialog open={skillsOpen} onOpenChange={setSkillsOpen} />
        <ModelManagerDialog open={modelsOpen} onOpenChange={setModelsOpen} />
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
