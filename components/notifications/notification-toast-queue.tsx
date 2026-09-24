"use client"

// 右下角通知弹窗队列（TODO 20）：订阅 toast-bus，FIFO 队列一次显示一条。
// 瞬态 UI：队列只存在于本组件本地 state（不持久化，不进 store）。
// 行为：滑入停留 5 秒滑出（hover 不暂停）→ 动画结束后展示下一条；
// 点击弹窗主体 → goNotifications() 并清空队列；右上角 X 提前滑出。

import { useCallback, useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { useWorkspace } from "@/lib/store"
import type { NotificationItem } from "@/lib/types"
import { subscribeNotificationToasts } from "@/lib/notifications/toast-bus"
import { senderDisplayName } from "@/lib/notifications/senders"

const DWELL_MS = 5000

/** 每行超 20 字截断为前 19 字 + "…"。 */
function clip(text: string, max = 20): string {
  const t = text.trim()
  return t.length > max ? t.slice(0, 19) + "…" : t
}

export function NotificationToastQueue() {
  const goNotifications = useWorkspace((s) => s.goNotifications)
  // FIFO 队列 + 当前展示条 + 滑入/滑出可视态
  const [queue, setQueue] = useState<NotificationItem[]>([])
  const [current, setCurrent] = useState<NotificationItem | null>(null)
  const [visible, setVisible] = useState(false)
  const dismissTimer = useRef<number | null>(null)

  // 订阅 toast-bus：新通知追加进队列
  useEffect(() => {
    return subscribeNotificationToasts((items) => {
      if (items.length === 0) return
      setQueue((q) => [...q, ...items])
    })
  }, [])

  const clearDismissTimer = useCallback(() => {
    if (dismissTimer.current !== null) {
      window.clearTimeout(dismissTimer.current)
      dismissTimer.current = null
    }
  }, [])

  // 队列泵：空闲且队列非空 → 取下一条，下一帧滑入，5 秒后滑出
  useEffect(() => {
    if (current || queue.length === 0) return
    const [next, ...rest] = queue
    setQueue(rest)
    setCurrent(next)
    setVisible(false)
    // 双 rAF 等待挂载后触发 transition（translateX 滑入）
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setVisible(true))
    })
    dismissTimer.current = window.setTimeout(() => setVisible(false), DWELL_MS)
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      clearDismissTimer()
    }
  }, [current, queue, clearDismissTimer])

  // 滑出动画结束 → 卸载当前条，泵自动取下一条
  const onTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.propertyName !== "transform") return
    if (!visible) {
      setCurrent(null)
    }
  }

  const dismiss = () => {
    clearDismissTimer()
    setVisible(false)
  }

  const openCenter = () => {
    clearDismissTimer()
    setVisible(false)
    setQueue([])
    setCurrent(null)
    goNotifications()
  }

  if (!current) return null

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={openCenter}
      onTransitionEnd={onTransitionEnd}
      className={
        "fixed right-4 bottom-4 z-[100] w-80 cursor-pointer rounded-lg border bg-popover text-popover-foreground shadow-lg transition-transform duration-300 ease-out " +
        (visible ? "translate-x-0" : "translate-x-[calc(100%+2rem)]")
      }
    >
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <span className="text-xs font-semibold">{senderDisplayName(current.senderId)}</span>
        <button
          type="button"
          aria-label="关闭通知"
          onClick={(e) => {
            e.stopPropagation()
            dismiss()
          }}
          className="ml-auto flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex flex-col gap-0.5 px-3 py-2">
        <p className="truncate text-sm font-medium">{clip(current.title) || "（无标题）"}</p>
        {current.brief.trim() && <p className="truncate text-xs text-muted-foreground">{clip(current.brief)}</p>}
      </div>
    </div>
  )
}
