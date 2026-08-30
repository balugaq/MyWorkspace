// 纯客户端 AI 对话 hook：直接在浏览器调用供应商的 OpenAI 兼容接口，
// 不经过任何后端（本项目为静态导出 output: "export"）。
//
// 技能（skills）通过 Tool Calling（函数调用）生效：
//   - public/skills 下的每个 .md 注册为一个 tool（名称 = 文件名 slug）
//   - AI 决定调用某技能时，前端 execute 把该 .md 全文回传给 AI
//   - AI 据此（技能说明书）处理用户输入并产出最终答案
//
// 模型抽象使用 Vercel AI SDK（ai v7 + @ai-sdk/openai-compatible），
// streamText + stopWhen: stepCountIs 自动驱动「调用工具 -> 回传结果 -> 继续」的多步循环。
//
// 容错说明：部分供应商 / 网络环境会在流尚未发出 finish_reason 时提前断开，
// 触发 AI SDK 的 AI_InvalidResponseDataError（"Response stream ended without a
// finish reason"）。本 hook 对此做降级：只要已经流到正文就保留并提示「可能不完整」，
// 仅在完全没有任何正文时才判定为真正的失败。

"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  streamText,
  tool,
  stepCountIs,
  zodSchema,
  type ModelMessage,
  type ToolSet,
} from "ai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { z } from "zod"

import { resolveProvider } from "./providers"
import { loadSkills } from "./skills"
import { BUILTIN_SKILLS } from "./builtin-skills"
import type { AIProviderId, AIChatMessage } from "@/lib/types"

export interface AIChatConfig {
  providerId: AIProviderId
  apiKey: string
  baseURL?: string
  model?: string
}

// 多会话化参数：hook 接收「当前会话 id + 持久化的初始消息 + 提交回调」，
// 在会话之间切换时由组件经 conversationId 变化触发本地消息重置。
export interface UseAIChatArgs {
  config: AIChatConfig
  conversationId: string
  initialMessages: AIChatMessage[]
  onCommit: (messages: AIChatMessage[]) => void
}

const SYSTEM_PROMPT = `你是一个集成在「全能工作台」个人应用里的 AI 助手。
工作台支持：思维导图式待办、分类笔记、日历日程、通讯录、密码保险库。
回答应简洁、实用、用中文。
当用户的需求匹配某个「技能」时，请调用对应的技能工具获取其操作说明，再据此完成任务。`

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function useAIChat({ config, conversationId, initialMessages, onCommit }: UseAIChatArgs) {
  const [messages, setMessages] = useState<AIChatMessage[]>(initialMessages)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const messagesRef = useRef<AIChatMessage[]>(messages)
  messagesRef.current = messages
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit
  // 会话「代际」标记：每次切换会话自增。send 开始时记录当前代际，
  // 流结束提交时若代际已变（说明中途切走了），则丢弃提交，避免把残流写进新会话。
  const genRef = useRef(0)

  // 切换会话：把本地消息重置为所选会话的持久化内容，并丢弃错误与进行中的流状态。
  // 进行中的流由调用方在切换前调用 stop() 中断；此处只负责界面状态对齐。
  useEffect(() => {
    genRef.current += 1
    setMessages(initialMessages)
    setError(null)
    // 仅依赖 conversationId：initialMessages 在每轮提交后会变化，不应触发重置。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  const send = useCallback(
    async (input: string) => {
      const trimmed = input.trim()
      if (!trimmed || isLoading) return
      if (!config.apiKey?.trim()) {
        setError("请先在设置中填写 API Key。")
        return
      }

      const gen = genRef.current
      const userMsg: AIChatMessage = { id: newId(), role: "user", content: trimmed }
      const assistantId = newId()
      const history = [...messagesRef.current, userMsg]
      setMessages([...history, { id: assistantId, role: "assistant", content: "" }])
      onCommitRef.current(history) // 立即持久化用户消息
      setIsLoading(true)
      setError(null)

      // 累计变量在 try 之外声明，确保 catch 也能拿到已流式输出的正文；
      // diagFetch 用于在请求层捕获底层 HTTP 状态，区分「鉴权/配额错误」与「流被提前截断」。
      let text = ""
      let sawError = false
      let errorMsg: string | null = null
      let httpStatus: number | null = null
      let httpStatusText = ""
      let rawBody: string | null = null
      const diagFetch = (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, init).then(async (res) => {
          httpStatus = res.status
          httpStatusText = res.statusText
          // 克隆一份用于诊断：若流为空/非 SSE，可回看原始响应体（常是 JSON 错误信息），
          // 避免只抛出无意义的 "Response stream ended without a finish reason"。
          try {
            const clone = res.clone()
            rawBody = (await clone.text()).slice(0, 1000)
          } catch {
            // 忽略克隆/读取失败
          }
          return res
        })

      // 从原始响应体里提取供应商返回的可读错误（智谱/DeepSeek 等出错时返回 JSON 而非 SSE）。
      const extractProviderError = (raw: string | null): string | null => {
        if (!raw) return null
        const t = raw.trim()
        if (!t.startsWith("{") && !t.startsWith("[")) return null
        try {
          const j = JSON.parse(t)
          return (
            j?.error?.message ||
            j?.error?.msg ||
            (typeof j?.error === "string" ? j.error : null) ||
            j?.msg ||
            j?.message ||
            null
          )
        } catch {
          return null
        }
      }

      const resolved = resolveProvider(
        config.providerId,
        config.apiKey,
        config.baseURL,
        config.model,
      )

      const provider = createOpenAICompatible({
        name: config.providerId,
        baseURL: resolved.baseURL,
        apiKey: resolved.apiKey,
        fetch: diagFetch,
      })
      const model = provider.chatModel(resolved.model)

      // 把 public/skills 下的 .md 注册为工具；加载失败则降级为空（不影响对话）。
      const tools: ToolSet = {}
      try {
        const skills = await loadSkills()
        for (const s of skills) {
          tools[s.name] = tool({
            description: s.description,
            inputSchema: zodSchema(z.object({})),
            execute: async () => s.body,
          })
        }
      } catch {
        // 技能加载失败不影响普通对话
      }

      // 注册内置（代码驱动、只读）技能：直接读取运行时状态与数据文件，返回结构化 JSON。
      // 工具名以 wb_ 前缀，避免与用户 markdown 技能冲突。全部为只读操作。
      for (const s of BUILTIN_SKILLS) {
        const skillName = s.name
        tools[skillName] = tool({
          description: s.description,
          inputSchema: zodSchema(s.parameters),
          execute: async (args) => {
            try {
              const out = await s.execute(args as Record<string, unknown>)
              return typeof out === "string" ? out : JSON.stringify(out, null, 2)
            } catch (e) {
              return JSON.stringify({
                error: e instanceof Error ? e.message : String(e),
              })
            }
          },
        })
      }

      const modelMessages: ModelMessage[] = history.map((m): ModelMessage =>
        m.role === "user"
          ? { role: "user", content: m.content }
          : { role: "assistant", content: m.content },
      )

      const controller = new AbortController()
      abortRef.current = controller

      const invocations: { name: string; display?: string; result?: string }[] = []

      // 把最终消息写回本地与持久化。gen 不匹配（中途切走）时直接丢弃，不污染新会话。
      const finalize = (body: string, failed: boolean) => {
        if (genRef.current !== gen) return
        if (failed) {
          const providerErr = extractProviderError(rawBody)
          const reason =
            httpStatus != null && httpStatus !== 200
              ? `HTTP ${httpStatus} ${httpStatusText}`
              : providerErr
                ? `供应商返回错误：${providerErr}`
                : errorMsg ?? "未知错误"
          setError(`请求失败：${reason}`)
          const finalMsgs: AIChatMessage[] = [
            ...history,
            { id: assistantId, role: "assistant", content: `⚠️ 请求失败：${reason}` },
          ]
          setMessages(finalMsgs)
          onCommitRef.current(finalMsgs)
          return
        }
        const note = sawError
          ? "\n\n⚠️ 响应被提前结束（未收到 finish_reason），以上内容可能不完整。"
          : ""
        const finalMsgs: AIChatMessage[] = [
          ...history,
          {
            id: assistantId,
            role: "assistant",
            content: body + note,
            tools: invocations.length ? [...invocations] : undefined,
          },
        ]
        setMessages(finalMsgs)
        onCommitRef.current(finalMsgs)
      }

      try {
        const result = streamText({
          model,
          system: SYSTEM_PROMPT,
          messages: modelMessages,
          tools,
          stopWhen: stepCountIs(12),
          abortSignal: controller.signal,
          onError: (err) => {
            errorMsg = err instanceof Error ? err.message : String(err)
          },
        })

        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            text += part.text
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: text } : m)),
            )
          } else if (part.type === "tool-call") {
            invocations.push({ name: part.toolName })
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, tools: [...invocations] } : m,
              ),
            )
          } else if (part.type === "tool-result") {
            const last = invocations[invocations.length - 1]
            if (last) {
              last.result =
                typeof part.output === "string"
                  ? part.output
                  : JSON.stringify(part.output)
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, tools: [...invocations] } : m,
              ),
            )
          } else if (part.type === "error") {
            sawError = true
            if (part.error instanceof Error) errorMsg = part.error.message
            else if (typeof part.error === "string") errorMsg = part.error
          }
        }

        const body = text.trim()
        if (body) {
          finalize(body, false)
        } else {
          // 完全没有任何正文：判定为真正的失败。
          finalize("", true)
        }
      } catch (e) {
        sawError = true
        errorMsg = e instanceof Error ? e.message : String(e)
        const body = text.trim()
        if (body) {
          // 即便抛错也保留已流式输出的正文（finalize 会按 sawError 追加提示）。
          finalize(body, false)
        } else {
          finalize("", true)
        }
      } finally {
        setIsLoading(false)
      }
    },
    [config, isLoading],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    onCommitRef.current([])
    setError(null)
  }, [])

  return { messages, isLoading, error, send, stop, clear }
}
