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
/** 滑出动画时长（与下方 transition-transform duration-300 对应）+ 兜底余量 */
const SLIDE_MS = 300
const EJECT_MS = 50

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

  // 泵：空闲且队列非空 → 取下一条。只负责取，不碰定时器/动画
  // （此前取件与展示生命周期挤在同一个 effect 里且依赖 queue，取件引发的 queue
  //   变化会先触发 cleanup，把刚排的 5 秒定时器与滑入 rAF 一并取消 → 永不自动滑出）。
  useEffect(() => {
    if (current || queue.length === 0) return
    const [next, ...rest] = queue
    setQueue(rest)
    setCurrent(next)
  }, [current, queue])

  // 展示生命周期：只依赖 current——挂载后短暂延迟滑入（用 setTimeout 而非 rAF：
  // 后台标签页 rAF 被浏览器暂停，滑入永不触发，而 eject 兜底定时器照跑，
  // 会把队列无声消耗掉——这正是「QQ 收到了但内置弹窗没看到」的根因），
  // 停留 5 秒滑出，另设兜底 eject（transitionend 在后台标签页可能不触发）。
  // 若当前标签页在后台（document.hidden）：不启动任何计时，等回到前台再展示，
  // 队列原地等待不丢失。
  useEffect(() => {
    if (!current) return
    // 复位上一条的滑入态，确保本条从隐藏位重新滑入
    setVisible(false)
    let alive = true
    const timers: number[] = []

    const arm = () => {
      if (!alive) return
      timers.push(
        window.setTimeout(() => {
          if (alive) setVisible(true)
        }, 60)
      )
      timers.push(
        window.setTimeout(() => {
          if (alive) setVisible(false)
        }, DWELL_MS)
      )
      timers.push(
        window.setTimeout(() => {
          if (alive) setCurrent(null)
        }, DWELL_MS + SLIDE_MS + EJECT_MS)
      )
      // dismiss()（手动提前滑出）要清的是「滑出」定时器
      dismissTimer.current = timers[1]
    }

    let onVis: (() => void) | null = null
    if (document.hidden) {
      const handler = () => {
        if (!document.hidden && alive) {
          document.removeEventListener("visibilitychange", handler)
          onVis = null
          arm()
        }
      }
      onVis = handler
      document.addEventListener("visibilitychange", handler)
    } else {
      arm()
    }

    return () => {
      alive = false
      if (onVis) document.removeEventListener("visibilitychange", onVis)
      for (const t of timers) window.clearTimeout(t)
      dismissTimer.current = null
    }
  }, [current])

  // 滑出动画结束（或手动提前滑出）→ 卸载当前条，泵自动取下一条
  const onTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.propertyName !== "transform") return
    if (!visible) {
      clearDismissTimer()
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
