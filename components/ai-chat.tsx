// AI 助手视图：会话列表已迁至全局侧边栏（components/ai/ai-sessions-panel.tsx，TODO 25），
// 本组件只负责主区的消息流与输入框。会话持久化在 store（localStorage），刷新后保留。
// 流式请求由 lib/ai/request-queue 全局持有——切换会话 / 切走视图都不会中断在途请求。
// 配置（provider / apiKey）来自 store.settings；skills 由队列内部读取。
// 用户消息与 AI 回复统一用 RichTextView 渲染（与节点内容同管线：表格/代码高亮/卡片/内文图一致生效）。

"use client"

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import {
  Bot,
  Send,
  Square,
  Wrench,
  Sparkles,
  AlertTriangle,
  User,
  Copy,
  RefreshCw,
  ChevronDown,
} from "lucide-react"
import { toast } from "sonner"

import { useWorkspace } from "@/lib/store"
import { useAIChat, type AIChatConfig } from "@/lib/ai/use-ai-chat"
import { RichTextView } from "@/components/richtext/rich-text-view"
import { ModelManagerDialog } from "@/components/ai-models-dialog"
import { SkillsToggleDialog } from "@/components/ai-skills-dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { NativeScrollArea } from "@/components/ui/native-scroll-area"
import { cn } from "@/lib/utils"

// 新对话空状态下的预置问题；第三个由我们替用户补充。
// （导出供日历侧边栏的「AI 快捷提问」面板复用，TODO 25。）
export const PRESET_QUESTIONS = [
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

// query bar 的 title 文本：纯文本截断，超过 20 字取前 20 字加省略号
function shortQueryTitle(content: string): string {
  return content.length > 20 ? content.slice(0, 20) + "…" : content
}

// 自定义 rAF 缓动滚动（原生 scrollIntoView 无 duration）；rafRef 记录动画帧 id，供重复点击时取消上一个动画。
// 直接写 viewport 的 scrollTop 与 ScrollArea 兼容（viewport 即原生滚动容器）。
function animateScrollTop(
  container: HTMLElement,
  targetTop: number,
  duration = 500,
  rafRef?: { current: number },
) {
  if (rafRef) cancelAnimationFrame(rafRef.current)
  const start = container.scrollTop
  const delta = targetTop - start
  const t0 = performance.now()
  const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2) // easeInOutQuad
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / duration)
    container.scrollTop = start + delta * ease(p)
    if (p < 1 && rafRef) {
      rafRef.current = requestAnimationFrame(step)
    }
  }
  if (rafRef) {
    rafRef.current = requestAnimationFrame(step)
  } else {
    requestAnimationFrame(step)
  }
}

export function AIChatWorkspace() {
  const settings = useWorkspace((s) => s.settings)
  const conversations = useWorkspace((s) => s.conversations)
  const activeId = useWorkspace((s) => s.activeConversationId)
  const createConversation = useWorkspace((s) => s.createConversation)
  const selectConversation = useWorkspace((s) => s.selectConversation)
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
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [modelsOpen, setModelsOpen] = useState(false)

  const modelLabel = activeModel?.label ?? "未配置模型"
  const hasKey = !!activeModel && activeModel.apiKey.trim().length > 0
  const userAvatar = settings.aiUserAvatar || ""
  const assistantAvatar = settings.aiAssistantAvatar || ""

  const { messages, isLoading, send, stop, regenerateLast } = useAIChat({
    config,
    conversationId: active?.id ?? "",
  })

  // 打开对话 / 新消息后滚到底部
  // 消息列表现为 Base UI ScrollArea，实际可滚动的是 viewport（data-slot="scroll-area-viewport"）。
  // 同时依赖 messages 与 activeId：切换对话（即「打开对话」）时即使 messages 引用未变也要滚到底；
  // 用 requestAnimationFrame 等浏览器完成布局（含图片等异步撑高）后再定位，避免滚不到位。
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const raf = requestAnimationFrame(() => {
      const viewport = el.closest(
        '[data-slot="scroll-area-viewport"]',
      ) as HTMLElement | null
      const scroller = viewport ?? el
      scroller.scrollTop = scroller.scrollHeight
    })
    return () => cancelAnimationFrame(raf)
  }, [messages, activeId])

  // —— Query bar（桌面端右侧问题导航）——
  // userMsgs：当前会话的全部用户提问（过滤空内容）；bar 只显示最近 9 条（旧上新下）。
  const userMsgs = useMemo(
    () => messages.filter((m) => m.role === "user" && m.content.trim().length > 0),
    [messages],
  )
  const visibleTitles = userMsgs.slice(-9)
  // 当前所处位置对应的用户提问 id（滚动追踪得出；null = 无可高亮项）
  const [activeQueryId, setActiveQueryId] = useState<string | null>(null)
  const scrollAnimRafRef = useRef(0)
  // 「回到底部」按钮：消息可滚动且用户不在底部时渐显，到底后消失
  const [showScrollDown, setShowScrollDown] = useState(false)

  // 滚动追踪「当前所处位置」：监听真实滚动容器（ScrollArea viewport），
  // rAF 节流地遍历用户消息 DOM，取「视口顶部之下、底部已进入视口上半部」的最近一条；
  // 视口在第一条之前则取第一条；一条用户消息都没有则清空。
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const viewport = el.closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null
    const scroller = viewport ?? el
    let raf = 0
    const computeActive = () => {
      const rect = scroller.getBoundingClientRect()
      const mid = rect.top + rect.height / 2
      // 顺带计算「回到底部」按钮显隐：内容可滚动（溢出 >40px）且当前距底部 >40px
      const distToBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
      setShowScrollDown(scroller.scrollHeight - scroller.clientHeight > 40 && distToBottom > 40)
      let current: string | null = null
      let first: string | null = null
      for (const m of userMsgs) {
        const node = el.querySelector(`[data-msg-id="${m.id}"]`)
        if (!node) continue
        if (!first) first = m.id
        if (node.getBoundingClientRect().bottom <= mid) current = m.id
      }
      setActiveQueryId(current ?? first)
    }
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        computeActive()
      })
    }
    scroller.addEventListener("scroll", onScroll, { passive: true })
    computeActive()
    return () => {
      scroller.removeEventListener("scroll", onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
    // messages / activeId 变化时重挂监听并立即重算（切会话/消息清空自然重置）
  }, [messages, userMsgs, activeId])

  // 点击 title：0.5s 缓动滚动到对应用户消息（留 12px 呼吸空间，clamp 到滚动范围）
  const jumpToQuery = (id: string) => {
    const el = scrollRef.current
    if (!el) return
    const viewport = el.closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null
    const scroller = viewport ?? el
    const node = el.querySelector(`[data-msg-id="${id}"]`)
    if (!node) return
    const target =
      node.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop -
      12
    const max = scroller.scrollHeight - scroller.clientHeight
    animateScrollTop(
      scroller,
      Math.min(max, Math.max(0, target)),
      500,
      scrollAnimRafRef,
    )
  }

  // 回到底部按钮：0.5s 缓动滑到底；到底后 scroll 事件把 showScrollDown 置 false，按钮消失
  const scrollToBottom = () => {
    const el = scrollRef.current
    if (!el) return
    const viewport = el.closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null
    const scroller = viewport ?? el
    animateScrollTop(scroller, scroller.scrollHeight, 500, scrollAnimRafRef)
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
    <div className="relative flex h-full min-h-0 flex-col">
      {/* 主区 */}
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b px-4 py-2">
          <Bot className="size-4 text-primary" />
          <h2 className="truncate text-sm font-semibold">{active?.title ?? "AI 助手"}</h2>
          <span className="text-xs text-muted-foreground">{modelLabel}</span>
        </header>

        <ScrollArea className="min-h-0 flex-1 overflow-hidden">
          {/* 聊天框内容限宽 屏宽/2 + 160，水平居中；w-full 钉住宽度（mx-auto 会取消 flex stretch，
              不钉则随 field-sizing 内容收缩）；滚动容器本身延伸到屏幕右缘，滚动条贴最右侧 */}
          <div ref={scrollRef} className="mx-auto flex w-full max-w-[calc(50vw+160px)] flex-col px-4 py-3">
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
              // data-msg-id / data-msg-role 供 query bar 滚动定位取真实 DOM。
              <div
                key={m.id}
                data-msg-id={m.id}
                data-msg-role={m.role}
                className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}
              >
                <div
                  className={cn(
                    "flex w-full items-start gap-2",
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
                      "rounded-lg px-3 py-2 text-sm",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground max-w-[66%] min-w-0"
                        : "bg-muted text-foreground max-w-[66%] min-w-0",
                    )}
                  >
                    {m.content ? (
                      // 用户与 AI 回复统一走 RichTextView（与节点内容同渲染管线：
                      // 表格 / 代码高亮 / 任务列表 / GitHub·B站卡 / 内文图一致生效）。
                      // 用户与 AI 消息统一走 RichTextView：气泡限宽 2/3、超宽软折行、手工换行保留。
                      <RichTextView
                        content={m.content}
                        className="chat-md"
                      />
                    ) : isLoading ? (
                      <span className="text-muted-foreground">思考中…</span>
                    ) : null}
                    {m.tools && m.tools.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1 border-t border-border/50 pt-1.5">
                        {/* 相同工具的多次调用合并为一条，右上角 ×N 标注次数（保持首次出现顺序） */}
                        {(() => {
                          const groups = new Map<string, number>()
                          for (const t of m.tools) {
                            const key = t.display ?? t.name
                            groups.set(key, (groups.get(key) ?? 0) + 1)
                          }
                          return [...groups.entries()].map(([name, count]) => (
                            <span
                              key={name}
                              className="inline-flex items-center gap-1 rounded bg-background/60 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                              title={count > 1 ? `${name}（调用了 ${count} 次）` : name}
                            >
                              <Wrench className="size-3" />
                              {name}
                              {count > 1 && <span className="text-primary/70">×{count}</span>}
                            </span>
                          ))
                        })()}
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
          className="relative mx-auto flex w-full max-w-[calc(50vw+160px)] flex-col gap-2 border-t p-3"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          {/* 回到底部：消息溢出且不在底部时渐显（fade+zoom 入场）；黑底白 V 形符号，hover 变灰，点击滑到底后消失 */}
          {showScrollDown && (
            <button
              type="button"
              onClick={scrollToBottom}
              title="回到底部"
              aria-label="回到底部"
              className="animate-in fade-in-0 zoom-in-75 absolute -top-5 right-4 z-10 flex size-9 items-center justify-center rounded-full bg-black text-white shadow-lg duration-200 hover:bg-neutral-600"
            >
              <ChevronDown className="size-5" />
            </button>
          )}
          {/* 输入框：NativeScrollArea 自绘胶囊滑块（与消息区 ScrollArea 同风格）；原生条隐藏 */}
          <NativeScrollArea className="min-h-9 flex-1">
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
              className="max-h-40 min-h-14 w-full resize-none"
              rows={1}
            />
          </NativeScrollArea>
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

      {/* Query bar（仅桌面端）：悬浮于屏幕右缘、不占布局（主区因此延伸到最右、滚动条贴屏幕最右侧）。
          热区条 right-6 起步，与贴边滚动条之间留出 gap 不重叠；鼠标靠近热区/条体显形，离开隐没 */}
      <aside className="group/qbar pointer-events-none absolute inset-y-0 right-6 z-10 hidden w-[11.11vw] flex-col justify-center md:flex">
        {/* 窄竖条热区：贴近右缘但避开滚动条，hover 触发 bar 显形 */}
        <div className="pointer-events-auto absolute inset-y-0 right-0 w-10" aria-hidden />
        <div className="pointer-events-auto invisible flex max-h-[90%] w-full flex-col overflow-hidden rounded-lg border border-border bg-popover opacity-0 shadow-lg transition-opacity duration-200 group-hover/qbar:visible group-hover/qbar:opacity-100">
          <ScrollArea className="max-h-full min-h-0 flex-1">
            <div className="flex flex-col gap-0.5 p-2">
              {visibleTitles.map((m) => {
                const isActive = m.id === activeQueryId
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => jumpToQuery(m.id)}
                    title={m.content}
                    className={cn(
                      "flex w-full items-center justify-end gap-1.5 px-2 py-1 text-right text-xs",
                      "transition-colors duration-100",
                      isActive
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {/* 当前提问：文字变蓝，左侧加蓝色横标装饰 */}
                    {isActive && (
                      <span
                        className="inline-block h-0.5 w-3 shrink-0 rounded-full bg-primary align-middle"
                        aria-hidden
                      />
                    )}
                    <span className="truncate">{shortQueryTitle(m.content)}</span>
                  </button>
                )
              })}
            </div>
          </ScrollArea>
        </div>
      </aside>
    </div>
  )
}
