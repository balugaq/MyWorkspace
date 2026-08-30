// 全局 AI 请求队列（模块级单例）：流式请求的所有权从 React 组件移到此处，
// 因此切换会话 / 切走视图都不会杀掉在途请求；请求完成后按 conversationId 写回 store。
//
// "AI 对话强制同步"（settings.aiForceSync）开启时，所有会话请求串行处理（单队列）；
// 关闭时允许并发（同一会话仍不会重复发起）。
//
// 容错与 use-ai-chat 一致：自定义 fetch 在 abort 时把 reject 转空响应以避免 unhandled rejection；
// 流被中止（用户点停止）时视为预期行为，静默收尾、不报错。

"use client"

import { streamText, tool, stepCountIs, zodSchema, type ModelMessage, type ToolSet } from "ai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { z } from "zod"

import { useWorkspace } from "@/lib/store"
import { resolveProvider } from "./providers"
import { loadSkills } from "./skills"
import { BUILTIN_SKILLS } from "./builtin-skills"
import type { AIChatMessage, AIProviderId } from "@/lib/types"

export interface AIChatConfig {
  providerId: AIProviderId
  apiKey: string
  baseURL?: string
  model?: string
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

// ---- 模块级状态（ephemeral，不持久化到 localStorage） ----
const liveMessages = new Map<string, AIChatMessage[]>()
const streaming = new Set<string>() // 正在流式输出的会话
const queued = new Set<string>() // 在队列中等待（强制同步模式下）的会话
const listeners = new Set<() => void>()

interface Job {
  conversationId: string
  config: AIChatConfig
  userMsg: AIChatMessage
  assistantId: string
  history: AIChatMessage[] // 本次请求之前已有的消息（不含新 user）
  controller: AbortController
}

const activeJobs = new Map<string, Job>()
const pendingQueue: Job[] = []

const EMPTY: AIChatMessage[] = []

function notify() {
  for (const l of listeners) l()
}

export function subscribeQueue(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getMessagesSnapshot(conversationId: string): AIChatMessage[] {
  const live = liveMessages.get(conversationId)
  if (live) return live
  const conv = useWorkspace.getState().conversations.find((c) => c.id === conversationId)
  return conv ? conv.messages : EMPTY
}

export function isWorking(conversationId: string): boolean {
  return streaming.has(conversationId) || queued.has(conversationId)
}

export function enqueue(conversationId: string, userContent: string, config: AIChatConfig) {
  if (!conversationId) return
  // 同一会话不应重复发起（UI 在流式/排队时已禁用输入）
  if (activeJobs.has(conversationId) || queued.has(conversationId)) return
  if (!config.apiKey?.trim()) return
  const state = useWorkspace.getState()
  const conv = state.conversations.find((c) => c.id === conversationId)
  if (!conv) return

  const history = conv.messages
  const userMsg: AIChatMessage = { id: newId(), role: "user", content: userContent }
  const assistantId = newId()
  const newHistory: AIChatMessage[] = [
    ...history,
    userMsg,
    { id: assistantId, role: "assistant", content: "" },
  ]
  // 立即持久化用户消息（不含助手占位，避免空占位落盘）
  state.setConversationMessages(conversationId, [...history, userMsg])
  // 内存 live 含助手占位，用于流式渲染（仅在切回该会话时可见，不占用 localStorage）
  liveMessages.set(conversationId, newHistory)
  queued.add(conversationId)
  notify()

  const job: Job = {
    conversationId,
    config,
    userMsg,
    assistantId,
    history,
    controller: new AbortController(),
  }
  pendingQueue.push(job)
  pump()
}

export function stopConversation(conversationId: string) {
  const job = activeJobs.get(conversationId)
  if (job) {
    job.controller.abort()
  }
  const idx = pendingQueue.findIndex((j) => j.conversationId === conversationId)
  if (idx >= 0) {
    pendingQueue.splice(idx, 1)
    queued.delete(conversationId)
    liveMessages.delete(conversationId)
    notify()
  }
}

function pump() {
  const synced = useWorkspace.getState().settings.aiForceSync
  const maxConcurrent = synced ? 1 : Number.POSITIVE_INFINITY
  while (activeJobs.size < maxConcurrent && pendingQueue.length > 0) {
    const job = pendingQueue.shift()!
    if (activeJobs.has(job.conversationId)) continue
    activeJobs.set(job.conversationId, job)
    queued.delete(job.conversationId)
    streaming.add(job.conversationId)
    notify()
    void runJob(job)
  }
}

function patchAssistant(
  conversationId: string,
  assistantId: string,
  patch: Partial<AIChatMessage>,
) {
  const cur = liveMessages.get(conversationId)
  if (!cur) return
  liveMessages.set(
    conversationId,
    cur.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)),
  )
}

async function runJob(job: Job) {
  const { conversationId, config, assistantId, history, userMsg, controller } = job
  let text = ""
  let sawError = false
  let errorMsg: string | null = null
  let httpStatus: number | null = null
  let httpStatusText = ""
  let rawBody: string | null = null
  const invocations: { name: string; display?: string; result?: string }[] = []

  // 诊断用 fetch：在 abort 时把 fetch 的 AbortError reject 转成空响应，避免 unhandled rejection。
  const diagFetch = (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, init)
      .then(async (res) => {
        httpStatus = res.status
        httpStatusText = res.statusText
        try {
          const clone = res.clone()
          rawBody = (await clone.text()).slice(0, 1000)
        } catch {
          // 忽略克隆/读取失败
        }
        return res
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") {
          return new Response(null, { status: 204 })
        }
        throw err
      })

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

  const resolved = resolveProvider(config.providerId, config.apiKey, config.baseURL, config.model)
  const provider = createOpenAICompatible({
    name: config.providerId,
    baseURL: resolved.baseURL,
    apiKey: resolved.apiKey,
    fetch: diagFetch,
  })
  const model = provider.chatModel(resolved.model)

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
          return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
        }
      },
    })
  }

  const modelMessages: ModelMessage[] = [...history, userMsg].map((m): ModelMessage =>
    m.role === "user"
      ? { role: "user", content: m.content }
      : { role: "assistant", content: m.content },
  )

  // 收尾：把最终（或中止/失败）结果写回 store，并清理 live/streaming 状态。
  const finish = (aborted: boolean) => {
    const body = text.trim()
    const conv = useWorkspace.getState().conversations.find((c) => c.id === conversationId)
    // 会话已被删除：直接清理，不再写回。
    if (!conv) {
      liveMessages.delete(conversationId)
      streaming.delete(conversationId)
      activeJobs.delete(conversationId)
      notify()
      pump()
      return
    }
    if (aborted && !body) {
      // 用户中止且尚未流到任何正文 —— 不写回，直接清理。
      liveMessages.delete(conversationId)
      streaming.delete(conversationId)
      activeJobs.delete(conversationId)
      notify()
      pump()
      return
    }
    let finalContent: string
    if (body) {
      finalContent =
        body +
        (sawError
          ? "\n\n⚠️ 响应被提前结束（未收到 finish_reason），以上内容可能不完整。"
          : "")
    } else {
      const providerErr = extractProviderError(rawBody)
      const reason =
        httpStatus != null && httpStatus !== 200
          ? `HTTP ${httpStatus} ${httpStatusText}`
          : providerErr
            ? `供应商返回错误：${providerErr}`
            : errorMsg ?? "未知错误"
      finalContent = `⚠️ 请求失败：${reason}`
    }
    const finalMsgs: AIChatMessage[] = [
      ...history,
      userMsg,
      {
        id: assistantId,
        role: "assistant",
        content: finalContent,
        tools: invocations.length ? [...invocations] : undefined,
      },
    ]
    useWorkspace.getState().setConversationMessages(conversationId, finalMsgs)
    liveMessages.delete(conversationId)
    streaming.delete(conversationId)
    activeJobs.delete(conversationId)
    notify()
    pump()
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

    try {
      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          text += part.text
          patchAssistant(conversationId, assistantId, { content: text })
          notify()
        } else if (part.type === "tool-call") {
          invocations.push({ name: part.toolName })
          patchAssistant(conversationId, assistantId, { tools: [...invocations] })
          notify()
        } else if (part.type === "tool-result") {
          const last = invocations[invocations.length - 1]
          if (last) {
            last.result =
              typeof part.output === "string" ? part.output : JSON.stringify(part.output)
          }
          patchAssistant(conversationId, assistantId, { tools: [...invocations] })
          notify()
        } else if (part.type === "error") {
          sawError = true
          if (part.error instanceof Error) errorMsg = part.error.message
          else if (typeof part.error === "string") errorMsg = part.error
        }
      }
    } catch (streamErr) {
      // fullStream 消费阶段抛错（onError 未吞掉时）：用户中止走 finish(true) 保留已生成内容，
      // 其余按失败处理并交给下方 finish 统一展示。
      if (streamErr instanceof Error && controller.signal.aborted) {
        finish(true)
        return
      }
      sawError = true
      errorMsg = streamErr instanceof Error ? streamErr.message : String(streamErr)
    }

    // 主动 finalize 流：请求完全失败（如 429）/ 空内容时，AI SDK 会以
    // AI_NoOutputGeneratedError 拒绝结果 Promise；若不消费会变成未捕获 rejection
    // （控制台 Runtime 报错）。此处 await + catch 吸收之——429/网络错信息已通过
    // errorMsg / httpStatus 在对话框正常展示，无需再抛。中止时不覆盖 errorMsg。
    try {
      await result.consumeStream()
    } catch (flushErr) {
      if (controller.signal.aborted) {
        // 用户中止：忽略 flush 阶段错误
      } else if (
        !(
          flushErr instanceof Error &&
          (flushErr.name === "AI_NoOutputGeneratedError" ||
            flushErr.message.includes("No output generated"))
        )
      ) {
        sawError = true
        if (!errorMsg) errorMsg = flushErr instanceof Error ? flushErr.message : String(flushErr)
      }
    }

    finish(controller.signal.aborted)
  } catch (e) {
    // 构造阶段等兜底（不应发生）
    const isAbort =
      e instanceof Error && (e.name === "AbortError" || controller.signal.aborted)
    if (isAbort) finish(true)
    else {
      sawError = true
      errorMsg = e instanceof Error ? e.message : String(e)
      finish(false)
    }
  }
}
