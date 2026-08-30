// AI 助手视图：侧边栏「AI 助手」入口进入。
// 复用工作区布局约定（header + 可滚动内容区 min-h-0 + flex-1 + 输入区）。
// 配置（provider / apiKey）来自 store.settings；skills 由 useAIChat 内部读取。

"use client"

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { Bot, Send, Square, Trash2, Wrench, AlertTriangle, User } from "lucide-react"

import { useWorkspace } from "@/lib/store"
import { useAIChat, type AIChatConfig } from "@/lib/ai/use-ai-chat"
import { loadSkills, type Skill } from "@/lib/ai/skills"
import { BUILTIN_SKILL_DISPLAY } from "@/lib/ai/builtin-skills"
import { AI_PROVIDERS } from "@/lib/ai/providers"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export function AIChatWorkspace() {
  const settings = useWorkspace((s) => s.settings)
  const setSettingsOpen = useWorkspace((s) => s.setSettingsOpen)

  const config: AIChatConfig = useMemo(
    () => ({
      providerId: settings.aiProvider,
      apiKey: settings.aiApiKey,
      baseURL: settings.aiBaseUrl || undefined,
      model: settings.aiModel || undefined,
    }),
    [settings.aiProvider, settings.aiApiKey, settings.aiBaseUrl, settings.aiModel],
  )

  const { messages, isLoading, error, send, stop, clear } = useAIChat(config)
  const [skills, setSkills] = useState<Skill[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState("")

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

  useEffect(() => {
    // 新消息后滚到底部
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const submit = () => {
    const text = input
    if (!text.trim() || isLoading) return
    setInput("")
    void send(text)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 顶栏 */}
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">AI 助手</h2>
          <span className="text-xs text-muted-foreground">{providerLabel}</span>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={clear} title="清空对话">
          <Trash2 />
        </Button>
      </header>

      {/* 消息区 */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
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
                "flex items-end gap-2",
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
                  "max-w-[78%] rounded-lg px-3 py-2 text-sm break-words whitespace-pre-wrap",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                {m.content || (isLoading && m.role === "assistant" ? "思考中…" : "")}
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

      {/* 输入区 */}
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
          placeholder={hasKey ? "输入消息，Enter 发送，Shift+Enter 换行" : "请先在设置中配置 API Key"}
          className="max-h-40 min-h-9 flex-1 resize-none"
          rows={1}
        />
        {isLoading ? (
          <Button type="button" variant="outline" size="icon" onClick={stop} title="停止">
            <Square />
          </Button>
        ) : (
          <Button type="submit" size="icon" disabled={!input.trim()} title="发送">
            <Send />
          </Button>
        )}
      </form>

      {error && (
        <div className="px-4 pb-2 text-xs text-destructive">{error}</div>
      )}
    </div>
  )
}
