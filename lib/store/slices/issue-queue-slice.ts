// GitHub Issue/PR 看板队列领域切片（TODO 85 / 36）：issueQueue 及其增删与状态标记联动
import type { StoreApi } from "zustand"
import type { WorkspaceState } from "../../store"

type SetState = StoreApi<WorkspaceState>["setState"]

export type IssueQueueSlice = Pick<
  WorkspaceState,
  | "issueQueue"
  | "addToIssueQueue"
  | "moveIssueQueueItem"
  | "removeIssueQueueItem"
  | "syncIssueQueueStates"
>

export const createIssueQueueSlice = (set: SetState): IssueQueueSlice => ({
  // GitHub Issue/PR 看板队列（TODO 36）：用户从仓库拉取 / 监听同步进来的卡片
  issueQueue: [],

  // 拉取到的 issue/PR 加入队列：按 id 去重（已存在则覆盖，保留其当前所在列）
  addToIssueQueue: (items) =>
    set((s) => {
      if (!items.length) return {}
      const byId = new Map(s.issueQueue.map((it) => [it.id, it]))
      for (const it of items) {
        const prev = byId.get(it.id)
        // 已存在 → 覆盖数据但保留其当前所在列与首次入队时间 queuedAt（用户手动移动过的列、原始排序位次不被拉取覆盖）
        // 新条目 → 记录首次入队时间（看板按 queuedAt 倒序；旧存档无此字段，组件排序时回落 0 沉底）
        byId.set(
          it.id,
          prev
            ? { ...it, column: prev.column, queuedAt: prev.queuedAt }
            : { ...it, queuedAt: Date.now() }
        )
      }
      return { issueQueue: [...byId.values()] }
    }),
  // 移动某卡片到指定列（手动搬运 = 重新入队，刷新 queuedAt 让卡片浮到新列顶）
  moveIssueQueueItem: (id, column) =>
    set((s) => ({
      issueQueue: s.issueQueue.map((it) =>
        it.id === id ? { ...it, column, queuedAt: Date.now() } : it
      ),
    })),
  removeIssueQueueItem: (id) =>
    set((s) => ({ issueQueue: s.issueQueue.filter((it) => it.id !== id) })),
  // 状态标记联动（TODO 46 后续）：close/merge/reopen 只回写 state/merged，列与排序位次不动
  syncIssueQueueStates: (entries) =>
    set((s) => {
      const byId = new Map(entries.map((e) => [e.id, e]))
      return {
        issueQueue: s.issueQueue.map((it) => {
          const e = byId.get(it.id)
          return e ? { ...it, state: e.state, merged: e.merged } : it
        }),
      }
    }),
})
