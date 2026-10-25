// 通知领域切片（TODO 85 / 18 / 20 / 26 / 23）：通知中心、扫描水位、健康/新闻提醒等时间戳
import type { StoreApi } from "zustand"
import type { WorkspaceState } from "../../store"
import type { NotificationItem, NotificationLogEntry } from "../../types"

type SetState = StoreApi<WorkspaceState>["setState"]

export type NotificationsSlice = Pick<
  WorkspaceState,
  | "notifications"
  | "notificationLogs"
  | "notificationWatermark"
  | "lastActiveAt"
  | "lastReadNotificationsAt"
  | "lastWaterRemindAt"
  | "lastStandRemindAt"
  | "newsLastFetchedAt"
  | "addNotifications"
  | "appendNotificationLogs"
  | "setNotificationWatermark"
  | "setLastActiveAt"
  | "markNotificationsRead"
  | "setLastWaterRemindAt"
  | "setLastStandRemindAt"
  | "setNewsLastFetchedAt"
>

export const createNotificationsSlice = (set: SetState): NotificationsSlice => ({
  // 站内通知（TODO 20 / 18，GitHub sender 等入库）：按「发现时间」降序，上限 200 条（超出截断最旧）
  notifications: [],
  // 通知系统日志（TODO 27）：每轮扫描检查了哪些仓库/发现哪些新内容、是否发送提示；按 at 降序，上限 500 条
  notificationLogs: [],
  // 扫描水位（epoch ms）：上一轮成功扫描的时间，作为下轮起算点；null = 从未扫过
  notificationWatermark: null,
  // 最近活跃时间（epoch ms）：调度器心跳维护；pagehide 时的更新 ≈「关机时间」，
  // 作为首次扫描（无水位时）的兜底起算点
  lastActiveAt: null,
  // 已读水位（epoch ms）：createdAt 晚于它的通知计为未读（工具栏徽标）；进通知页即更新
  lastReadNotificationsAt: null,
  // 健康提醒上次触发时间（epoch ms，TODO 26）：持久化 + 按墙钟对表，重启/后台冻结不丢计时
  lastWaterRemindAt: null,
  lastStandRemindAt: null,
  // 新闻精选上次触发时刻（epoch ms，TODO 23）：与 18:00 周期起点比对判断本周期是否已拉取；null = 从未拉过
  newsLastFetchedAt: null,

  // 通知入库（TODO 20 / 18）：按 id 去重合并（已有条目保留原样），按「发现时间」降序，上限 200 条截断最旧。
  addNotifications: (items) =>
    set((s) => {
      if (items.length === 0) return {}
      const map = new Map<string, NotificationItem>()
      for (const n of s.notifications) map.set(n.id, n)
      for (const n of items) map.set(n.id, n)
      // 按「发现时间」排序/截断（foundAt 缺省回落 createdAt）：晚推送的旧 commit
      // createdAt 很早，若按 createdAt 排会被压到列表深处甚至截断掉
      const key = (n: NotificationItem) => n.foundAt ?? (Date.parse(n.createdAt) || 0)
      const merged = [...map.values()].sort((a, b) => key(b) - key(a)).slice(0, 200)
      return { notifications: merged }
    }),

  setNotificationWatermark: (ms) => set({ notificationWatermark: ms }),

  // 追加通知系统日志（TODO 27）：按 id 去重、at 降序、上限 500 条
  appendNotificationLogs: (entries) =>
    set((s) => {
      if (entries.length === 0) return {}
      const map = new Map<string, NotificationLogEntry>()
      for (const e of s.notificationLogs) map.set(e.id, e)
      for (const e of entries) map.set(e.id, e)
      const merged = [...map.values()].sort((a, b) => b.at - a.at).slice(0, 500)
      return { notificationLogs: merged }
    }),

  setLastActiveAt: (ms) => set({ lastActiveAt: ms }),

  // 通知全部已读：进入通知页时调用（工具栏未读徽标随之清零）
  markNotificationsRead: () => set({ lastReadNotificationsAt: Date.now() }),

  setLastWaterRemindAt: (ms) => set({ lastWaterRemindAt: ms }),
  setLastStandRemindAt: (ms) => set({ lastStandRemindAt: ms }),
  setNewsLastFetchedAt: (ms) => set({ newsLastFetchedAt: ms }),
})
