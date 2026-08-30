// AI 供应商抽象：统一 OpenAI 兼容的 /v1/chat/completions 接口。
// 内置 ZCode/BigModel（智谱）与 DeepSeek 的默认 baseURL/模型，用户无需填写；
// 另提供「自定义」项，由用户自行填写任意 OpenAI 兼容端点的 baseURL 与模型名。
//
// 说明：本项目为纯静态导出（output: "export"），没有后端路由，
// 因此所有调用都在浏览器端直接打供应商接口，API Key 仅存于本机 localStorage。

import type { AIProviderId } from "@/lib/types"

export interface AIProvider {
  id: AIProviderId
  label: string
  /** OpenAI 兼容 base，不含末尾的 /chat/completions */
  baseURL: string
  defaultModel: string
  apiKeyPlaceholder: string
  help?: string
}

export const AI_PROVIDERS: Record<AIProviderId, AIProvider> = {
  zcode: {
    id: "zcode",
    label: "ZCode / BigModel（智谱）",
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-plus",
    apiKeyPlaceholder: "智谱 API Key（在 open.bigmodel.cn 获取）",
    help: "智谱开放平台：https://open.bigmodel.cn",
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    baseURL: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    apiKeyPlaceholder: "DeepSeek API Key（以 sk- 开头）",
    help: "DeepSeek 平台：https://platform.deepseek.com",
  },
  custom: {
    id: "custom",
    label: "自定义（OpenAI 兼容）",
    baseURL: "",
    defaultModel: "gpt-4o-mini",
    apiKeyPlaceholder: "API Key",
    help: "填写任意 OpenAI 兼容端点的 Base URL 与模型名。",
  },
}

export interface ResolvedProvider {
  baseURL: string
  apiKey: string
  model: string
}

/** 根据用户在设置里选择的 provider 与输入，解析出实际请求的 baseURL / key / model */
export function resolveProvider(
  providerId: AIProviderId,
  apiKey: string,
  customBaseURL?: string,
  selectedModel?: string,
): ResolvedProvider {
  const p = AI_PROVIDERS[providerId]
  // 所有供应商都允许用户在设置里覆盖模型名；留空则回退到该供应商的默认模型。
  const baseURL =
    providerId === "custom"
      ? (customBaseURL ?? "").replace(/\/+$/, "")
      : p.baseURL
  const model = (selectedModel ?? "").trim() || p.defaultModel
  return { baseURL, apiKey, model }
}
