// 词汇问答 AI 评分（TODO 64 批 2）：每题作答在答完后一次性提交评分。
// 不走对话流：requestDirectCompletion 函数式调用（经 lib/ai/request-queue.ts 并发纪律，仿 relayout）。
// 评分前程序化预搜注入参考（复用 wb_web_search 的代理管线；搜索失败不阻塞评分）。

"use client"

import { useWorkspace } from "@/lib/store"
import { requestDirectCompletion } from "./request-queue"
import type { VocabRating } from "@/lib/types"

const RATINGS: readonly VocabRating[] = ["wrong", "partial", "correct", "beyond"]

const SYSTEM_PROMPT =
  "你是词汇测验评分器。依据词库释义与搜索参考，评定学习者对该词的作答。" +
  "四档标准：wrong=错误（与词库释义明显不符）；partial=部分正确（只沾到部分义项或存在偏差）；" +
  "correct=正确（符合词库释义）；beyond=超越（符合词库释义，且给出了更多正确的义项）。" +
  '只输出一个 JSON 对象：{"rating":"wrong|partial|correct|beyond","comment":"一两句中文点评，指出对在哪、缺什么"}，不要输出任何其他内容。'

/** 从 AI 回复中容错提取第一个 JSON 对象：兼容 ```json 代码围栏与前后缀解释文字（与 relayout 同款） */
function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidates = [fenced?.[1], trimmed].filter((t): t is string => !!t)
  for (const c of candidates) {
    const start = c.indexOf("{")
    const end = c.lastIndexOf("}")
    if (start === -1 || end <= start) continue
    try {
      const parsed: unknown = JSON.parse(c.slice(start, end + 1))
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // 尝试下一段候选
    }
  }
  return null
}

/** 程序化预搜：走 wb_web_search 同款本机代理；任何失败返回 null（评分继续，只是无参考） */
async function searchReference(word: string): Promise<string | null> {
  try {
    const key = useWorkspace.getState().settings.baiduAiSearchApiKey?.trim()
    if (!key) return null
    const proxyBase = process.env.NEXT_PUBLIC_AI_SEARCH_PROXY?.replace(/\/+$/, "") || ""
    const res = await fetch(`${proxyBase}/api/ai-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, query: `${word} 单词 释义 用法` }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return null
    const data: unknown = await res.json()
    return JSON.stringify(data).slice(0, 3000)
  } catch {
    return null
  }
}

export interface VocabGradeResult {
  rating: VocabRating
  comment: string
}

/** 评分单个作答。抛错场景：未配置模型 / 响应不含合法 JSON / rating 不在四档之内 */
export async function gradeVocabAnswer(args: {
  word: string
  definition: string
  answer: string
}): Promise<VocabGradeResult> {
  const reference = await searchReference(args.word)
  const prompt = [
    `词条：${args.word}`,
    `词库释义：${args.definition}`,
    reference
      ? `搜索参考（仅辅助判断，可能含无关内容，谨慎采纳）：${reference}`
      : "（本次无搜索参考，仅依据词库释义评定）",
    `学习者作答：${args.answer.trim().slice(0, 2000)}`,
    "",
    '只输出 JSON：{"rating":"wrong|partial|correct|beyond","comment":"点评"}',
  ].join("\n")

  const raw = await requestDirectCompletion(prompt, SYSTEM_PROMPT)
  const parsed = extractJsonObject(raw)
  if (!parsed) {
    throw new Error("AI 返回内容不含合法 JSON")
  }
  const rating = parsed.rating
  if (typeof rating !== "string" || !RATINGS.includes(rating as VocabRating)) {
    throw new Error("AI 返回的 rating 不在四档之内")
  }
  const comment = typeof parsed.comment === "string" ? parsed.comment.trim() : ""
  return { rating: rating as VocabRating, comment }
}
