// 贡献账本领域切片（TODO 85 / 8 / 9 / 10 / 18）：contributions 及其写入 / 签到 / 专注钟
import type { StoreApi } from "zustand"
import type { WorkspaceState } from "../../store"
import type { Contribution } from "../../types"
import { CONTRIBUTION_AMOUNT } from "../../types"
import { parseDayStartOffset, todayKey } from "../../contributions"

type SetState = StoreApi<WorkspaceState>["setState"]
type GetState = StoreApi<WorkspaceState>["getState"]

export type ContributionsSlice = Pick<
  WorkspaceState,
  | "contributions"
  | "scanLegacyContributions"
  | "checkIn"
  | "addFocusContribution"
  | "appendContributions"
>

export const createContributionsSlice = (set: SetState, get: GetState): ContributionsSlice => ({
  // 贡献账本（Profile 热力图数据源）：每条为一次「新建/完成节点」事件（真账本，非派生）
  contributions: [],

  // 一次性存量补算：为账本中缺失的节点补 created/done 记录（幂等），返回新增条数。
  // 临时功能（入口在 Profile 页），主人用完会要求删除 —— 与 Profile 的按钮一并摘除。
  scanLegacyContributions: () => {
    let added = 0
    set((s) => {
      const existing = new Set(s.contributions.map((c) => c.id))
      const next = [...s.contributions]
      for (const fam of Object.values(s.relationFamilies)) {
        for (const n of fam.nodes) {
          const createdId = `${n.id}:created`
          if (typeof n.createdAt === "number" && !existing.has(createdId)) {
            next.push({
              id: createdId,
              at: n.createdAt,
              amount: CONTRIBUTION_AMOUNT["mindmap-node-created"],
              type: "mindmap-node-created",
              content: n.title,
            })
            existing.add(createdId)
            added++
          }
          const doneId = `${n.id}:done`
          // completedAt != null：含迁移写入的 LEGACY_NODE_TIME（主人要求如实计入）
          if (n.completedAt != null && !existing.has(doneId)) {
            next.push({
              id: doneId,
              at: n.completedAt,
              amount: CONTRIBUTION_AMOUNT["mindmap-node-done"],
              type: "mindmap-node-done",
              content: n.title,
            })
            existing.add(doneId)
            added++
          }
        }
      }
      return added > 0 ? { contributions: next } : {}
    })
    return added
  },

  // 每日签到（TODO 9）：写一条 `check-in:${dayKey}` 贡献（amount 2）；状态由账本按 dayKey 推导，过 04:00 自动重置。
  checkIn: () => {
    const off = parseDayStartOffset(get().settings.dayStartOffset)
    const dayKey = todayKey(off)
    const id = `check-in:${dayKey}`
    // 幂等：今天已签过就不再写（按钮虽禁用，双保险）
    if (get().contributions.some((c) => c.id === id)) return
    set((s) => ({
      contributions: [
        ...s.contributions,
        {
          id,
          at: Date.now(),
          amount: CONTRIBUTION_AMOUNT["check-in"],
          type: "check-in",
          content: "签到",
        },
      ],
    }))
  },

  // 专注钟（TODO 10）：结束专注时按专注分钟写一条 `focus:<dayKey>` 贡献；amount = floor(分钟/10)，不足 10 分钟返回 0（不写）。同 dayKey 已存在则覆盖（更新 at / amount）。
  addFocusContribution: (minutes, content) => {
    const amount = Math.floor(minutes / 10)
    if (amount < 1) return 0
    const off = parseDayStartOffset(get().settings.dayStartOffset)
    const dayKey = todayKey(off)
    const id = `focus:${dayKey}`
    const finalContent =
      content && content.trim() ? content.trim() : `专注 ${Math.round(minutes)} 分钟`
    set((s) => ({
      contributions: [
        ...s.contributions.filter((c) => c.id !== id),
        {
          id,
          at: Date.now(),
          amount,
          type: "focus",
          content: finalContent,
        },
      ],
    }))
    return amount
  },

  // 批量追加贡献（TODO 18：GitHub sender 按通知入账）；按 id 与现有账本去重后追加。
  //  amount 在本 action 内按 CONTRIBUTION_AMOUNT[type] 统一取值（调用方只传 type）。
  appendContributions: (entries) =>
    set((s) => {
      if (entries.length === 0) return {}
      const existing = new Set(s.contributions.map((c) => c.id))
      const additions = entries
        .filter((e) => !existing.has(e.id) && Number.isFinite(e.at))
        .map((e) => ({
          id: e.id,
          at: e.at,
          amount: CONTRIBUTION_AMOUNT[e.type],
          type: e.type,
          content: e.content,
        }))
      if (additions.length === 0) return {}
      return { contributions: [...s.contributions, ...additions] as Contribution[] }
    }),
})
