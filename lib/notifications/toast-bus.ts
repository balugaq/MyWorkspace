// 通知 toast 的极简 pub/sub（TODO 20）：
// scheduler 扫到新通知后 emit，右下角弹窗组件（NotificationToastQueue）订阅展示。
// 弹窗的瞬态队列**不进 store**（不持久化）——持久化数据在 store.notifications，
// UI 瞬态留在组件本地 state，符合「禁止组件承载应属 store 的数据」红线的边界约定。

import type { NotificationItem } from "@/lib/types"

type Listener = (items: NotificationItem[]) => void

const listeners = new Set<Listener>()

/** 向弹窗组件推一批新通知（调用方保证只推「新入库」的条目）。 */
export function emitNotificationToasts(items: NotificationItem[]): void {
  if (items.length === 0) return
  for (const l of listeners) {
    try {
      l(items)
    } catch {
      // 单个监听器异常不影响其他监听器
    }
  }
}

/** 订阅通知 toast；返回退订函数。 */
export function subscribeNotificationToasts(cb: Listener): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
