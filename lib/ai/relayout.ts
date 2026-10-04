// AI 整理布局（TODO 54）：对指定关系族做一次「位置重排」。
// 不走对话流：直接用 AI SDK 函数式调用（经 lib/ai/request-queue.ts 的并发纪律），
// prompt 携带节点清单（id/title/当前坐标），要求返回 JSON `{nodeId:{x,y}}`；
// 解析成功才写回族内节点 position（updateNode），失败抛错由调用方 toast、不落库。

"use client"

import { useWorkspace } from "@/lib/store"
import { requestDirectCompletion } from "./request-queue"

const SYSTEM_PROMPT =
  "你是思维导图布局算法。用户会给出节点清单（nodeId、标题、当前坐标），" +
  "你需要输出一个更清晰、不重叠、层次分明的布局。" +
  "只输出一个 JSON 对象，不要输出任何解释文字或 Markdown 代码块之外的内容。" +
  'JSON 格式：{"nodeId":{"x":数字,"y":数字},...}，key 必须是清单里给定的 nodeId 原文，' +
  "保持与输入相近的坐标量级（横向间隔建议 300 以上，纵向间隔 160 以上），不要增删节点。"

/** 从 AI 回复中容错提取第一个 JSON 对象：兼容 ```json 代码围栏与前后缀解释文字 */
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

/**
 * 重排指定族的全部节点位置，返回实际写回的节点数。
 * 抛错场景：族不存在 / 族无节点 / 未配置模型 / 响应不含合法 JSON / 无任何有效坐标。
 */
export async function relayoutFamilyNodes(familyId: string): Promise<number> {
  const s = useWorkspace.getState()
  const fam = s.relationFamilies[familyId]
  if (!fam) throw new Error("关系族不存在")
  const nodes = fam.nodes
  if (nodes.length === 0) throw new Error("当前族没有节点，无需整理")
  const cat = s.categories.find((c) => c.id === fam.categoryId)

  const listing = nodes
    .map(
      (n) =>
        `- nodeId: ${n.id} | 标题: ${n.title || "未命名"} | 当前坐标: (${Math.round(n.position?.x ?? 0)}, ${Math.round(n.position?.y ?? 0)})`
    )
    .join("\n")
  const prompt = [
    `请为以下思维导图（分类「${cat?.name ?? "未知"}」的族「${fam.name}」）共 ${nodes.length} 个节点输出新布局。`,
    "节点清单：",
    listing,
    "",
    "只输出 JSON：{\"nodeId\":{\"x\":数字,\"y\":数字},...}",
  ].join("\n")

  const raw = await requestDirectCompletion(prompt, SYSTEM_PROMPT)
  const parsed = extractJsonObject(raw)
  if (!parsed) {
    throw new Error("AI 返回内容不含合法 JSON，已放弃写回（原布局未变）")
  }

  let applied = 0
  for (const n of nodes) {
    const pos = parsed[n.id]
    if (!pos || typeof pos !== "object") continue
    const x = (pos as Record<string, unknown>).x
    const y = (pos as Record<string, unknown>).y
    if (
      typeof x === "number" && Number.isFinite(x) &&
      typeof y === "number" && Number.isFinite(y)
    ) {
      // 逐节点写回（updateNode 只改 position，不触发贡献账本记账）
      s.updateNode(familyId, n.id, { position: { x, y } })
      applied++
    }
  }
  if (applied === 0) {
    throw new Error("AI 返回的 JSON 中没有可用的节点坐标，已放弃写回（原布局未变）")
  }
  return applied
}
