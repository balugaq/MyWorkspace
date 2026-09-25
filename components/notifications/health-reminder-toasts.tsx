"use client"

/**
 * 健康提醒弹窗（TODO 26）：喝水提醒（每 2 小时）+ 站立提醒（每 4 小时）。
 * - 计时按**墙钟**对表：上次触发时间持久化在 store（lastWater/StandRemindAt），
 *   每分钟检查一次 + 回到前台立即检查——dev 重启、标签页被浏览器冻结/节流都不会丢计时；
 *   首次使用（无记录）以当前时刻起算，2h / 4h 后首次弹出；
 * - 弹窗为「常驻卡」：不自动消失（等效 99999 秒），直到用户点右上角小灰 x 关闭；
 * - 位于右下角通知弹窗（fixed right-4 bottom-4）的上方堆叠，互不遮挡；
 * - 与通知系统（sender/渠道）完全独立：本地定时触发，不走 store.notifications、不进日志。
 */

import { useEffect, useRef, useState } from "react"
import { CupSoda, PersonStanding, X } from "lucide-react"
import { useWorkspace } from "@/lib/store"
import { cn } from "@/lib/utils"

interface ReminderCard {
  /** 唯一 id：类型 + 触发时间戳（同一次触发只弹一张） */
  id: string
  kind: "water" | "stand"
}

const WATER_INTERVAL_MS = 2 * 60 * 60 * 1000
const STAND_INTERVAL_MS = 4 * 60 * 60 * 1000
/** 墙钟对表周期：1 分钟（后台被冻结时暂停，回前台立即补查） */
const CHECK_MS = 60 * 1000

const REMINDER_META: Record<ReminderCard["kind"], { title: string; message: string; icon: typeof CupSoda }> = {
  water: {
    title: "喝水提醒",
    message: "已经工作 2 小时啦，记得喝杯水休息一下",
    icon: CupSoda,
  },
  stand: {
    title: "站立提醒",
    message: "不能久坐，已经 4 小时了，起来站立活动一下吧",
    icon: PersonStanding,
  },
}

export function HealthReminderToasts() {
  const [cards, setCards] = useState<ReminderCard[]>([])
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set())

  // 触发与滑入动画分离：push 后下一帧置 visible 触发 transition
  const rafRef = useRef<number[]>([])
  useEffect(() => {
    const push = (kind: ReminderCard["kind"]) => {
      const id = `${kind}-${Date.now()}`
      setCards((prev) => [...prev, { id, kind }])
      const raf = requestAnimationFrame(() => {
        setVisibleIds((prev) => new Set(prev).add(id))
      })
      rafRef.current.push(raf)
    }
    /** 墙钟对表：距上次触发 ≥ 周期（或无记录=首次起算）则触发并记账 */
    const check = () => {
      const s = useWorkspace.getState()
      const now = Date.now()
      const due: ReminderCard["kind"][] = []
      const lastWater = s.lastWaterRemindAt
      if (lastWater == null) {
        s.setLastWaterRemindAt(now) // 首次使用：从现在起算
      } else if (now - lastWater >= WATER_INTERVAL_MS) {
        due.push("water")
      }
      const lastStand = s.lastStandRemindAt
      if (lastStand == null) {
        s.setLastStandRemindAt(now)
      } else if (now - lastStand >= STAND_INTERVAL_MS) {
        due.push("stand")
      }
      if (due.includes("water")) {
        s.setLastWaterRemindAt(now)
        push("water")
      }
      if (due.includes("stand")) {
        s.setLastStandRemindAt(now)
        push("stand")
      }
    }
    check() // 启动立即对表一次（补上重启/冻结期间错过的触发）
    const checkTimer = window.setInterval(check, CHECK_MS)
    const onVisible = () => {
      if (!document.hidden) check()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(checkTimer)
      document.removeEventListener("visibilitychange", onVisible)
      for (const r of rafRef.current) cancelAnimationFrame(r)
      rafRef.current = []
    }
  }, [])

  const dismiss = (id: string) => {
    setVisibleIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    // 等滑出动画播完再移除 DOM，避免直接消失
    window.setTimeout(() => {
      setCards((prev) => prev.filter((c) => c.id !== id))
    }, 300)
  }

  if (cards.length === 0) return null

  return (
    <div className="fixed right-4 bottom-28 z-[100] flex w-80 flex-col gap-2">
      {cards.map((card) => {
        const meta = REMINDER_META[card.kind]
        const Icon = meta.icon
        const visible = visibleIds.has(card.id)
        return (
          <div
            key={card.id}
            className={cn(
              "flex items-start gap-2.5 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg transition-transform duration-300 ease-out",
              visible ? "translate-x-0" : "translate-x-[calc(100%+1rem)]"
            )}
          >
            <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{meta.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{meta.message}</p>
            </div>
            <button
              type="button"
              aria-label="关闭提醒"
              className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => dismiss(card.id)}
            >
              <X className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
