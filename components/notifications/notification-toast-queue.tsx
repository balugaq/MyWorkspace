"use client"

// 右下角通知弹窗队列（TODO 20）：订阅 toast-bus，FIFO 一次显示一条；堆积超阈值合并为「你有 x 条新消息」摘要（TODO 42）。
// 瞬态 UI：队列只在本地 state（不持久化、不进 store）；滑入停留 5 秒滑出，点击主体进通知中心并清空队列，X 提前滑出。

import { useCallback, useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useWorkspace } from "@/lib/store"
import type { NotificationItem } from "@/lib/types"
import { subscribeNotificationToasts } from "@/lib/notifications/toast-bus"
import { senderDisplayNameLocalized } from "@/lib/notifications/senders"

const DWELL_MS = 5000
/** 滑出动画时长（与下方 transition-transform duration-300 对应）+ 兜底余量 */
const SLIDE_MS = 300
const EJECT_MS = 50
/** 堆积超过该条数（严格大于）时合并为一条摘要弹窗（TODO 42） */
const MERGE_THRESHOLD = 3

/** 每行超 20 字截断为前 19 字 + "…"。 */
function clip(text: string, max = 20): string {
  const t = text.trim()
  return t.length > max ? t.slice(0, 19) + "…" : t
}

export function NotificationToastQueue() {
  const { t } = useTranslation()
  const goNotifications = useWorkspace((s) => s.goNotifications)
  const [queue, setQueue] = useState<NotificationItem[]>([])
  const [current, setCurrent] = useState<NotificationItem | null>(null)
  const [summaryCount, setSummaryCount] = useState<number | null>(null)
  const [visible, setVisible] = useState(false)
  const dismissTimer = useRef<number | null>(null)

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

  const clearPresenting = useCallback(() => {
    setCurrent(null)
    setSummaryCount(null)
  }, [])

  // 泵：空闲且队列非空 → 取下一条（超阈值合并为摘要，TODO 42）。只负责取，不碰定时器/动画——
  // 此前取件与展示挤在同一 effect 且依赖 queue，取件引发的 queue 变化会先触发 cleanup，
  // 把刚排的 5 秒定时器与滑入 rAF 一并取消 → 永不自动滑出。
  useEffect(() => {
    if (current || summaryCount !== null || queue.length === 0) return
    // 取件 setState 延迟一拍：effect 体内同步 setState 会触发 react-hooks/set-state-in-effect
    const t = window.setTimeout(() => {
      if (queue.length > MERGE_THRESHOLD) {
        setSummaryCount(queue.length)
        setQueue([])
        return
      }
      const [next, ...rest] = queue
      setQueue(rest)
      setCurrent(next)
    }, 0)
    return () => window.clearTimeout(t)
  }, [current, summaryCount, queue])

  // 展示生命周期：滑入延迟必须用 setTimeout 而非 rAF——后台标签页 rAF 被浏览器暂停、滑入永不触发，
  // 而 eject 兜底定时器照跑会把队列无声消耗掉（「QQ 收到了但内置弹窗没看到」的根因）。
  // 停留 5 秒滑出 + 兜底 eject（transitionend 后台可能不触发）；后台时不启动任何计时，回前台再展示，队列不丢。
  useEffect(() => {
    if (!current && summaryCount === null) return
    let alive = true
    const timers: number[] = []
    // 复位滑入态，确保本条从隐藏位重新滑入；延迟一拍避开 react-hooks/set-state-in-effect
    timers.push(
      window.setTimeout(() => {
        if (alive) setVisible(false)
      }, 0),
    )

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
          if (alive) clearPresenting()
        }, DWELL_MS + SLIDE_MS + EJECT_MS)
      )
      // dismiss()（手动提前滑出）要清的是「滑出」定时器
      dismissTimer.current = timers[2]
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
  }, [current, summaryCount, clearPresenting])

  const onTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.propertyName !== "transform") return
    if (!visible) {
      clearDismissTimer()
      clearPresenting()
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
    clearPresenting()
    goNotifications()
  }

  if (!current && summaryCount === null) return null

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
        <span className="text-xs font-semibold">
          {current ? senderDisplayNameLocalized(current.senderId) : t("notif.title")}
        </span>
        <button
          type="button"
          aria-label={t("notif.closeToast")}
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
        {current ? (
          <>
            <p className="truncate text-sm font-medium">{clip(current.title) || t("notif.untitled")}</p>
            {current.brief.trim() && (
              <p className="truncate text-xs text-muted-foreground">{clip(current.brief)}</p>
            )}
          </>
        ) : (
          // TODO 42：堆积合并摘要
          <p className="truncate text-sm font-medium">{t("notif.summaryCount", { n: summaryCount })}</p>
        )}
      </div>
    </div>
  )
}
