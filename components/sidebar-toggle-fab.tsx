"use client"

// 侧边栏收起后的贴边展开开关（TODO 25 打磨）：可上下拖动，松手持久化纵向位置（无记录时垂直居中）；
// 位移小于约 4px 视为点击而非拖动，此时展开侧边栏。

import { useTranslation } from "react-i18next"
import { useRef, useState } from "react"
import { PanelLeft } from "lucide-react"
import { useWorkspace } from "@/lib/store"

const BTN_H = 56 // 按钮估算高度（py-5 + 图标），用于拖动 clamp
const TOP_MIN = 64 // 拖动范围上界：BrandHeader（h-14）之下——开关不越过侧边栏本身的范围
const EDGE = 8

export function SidebarToggleFab() {
  const { t } = useTranslation()
  const setSidebarCollapsed = useWorkspace((s) => s.setSidebarCollapsed)
  const persistedY = useWorkspace((s) => s.sidebarToggleY)
  const setSidebarToggleY = useWorkspace((s) => s.setSidebarToggleY)

  // 拖动中的实时位置（px）；null = 未在拖动
  const [dragY, setDragY] = useState<number | null>(null)
  const draggingRef = useRef(false)
  const movedRef = useRef(false)
  const startClientY = useRef(0)
  const startTop = useRef(0)
  const btnRef = useRef<HTMLButtonElement>(null)

  const centered = persistedY == null && dragY == null
  const top = dragY ?? persistedY

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    draggingRef.current = true
    movedRef.current = false
    startClientY.current = e.clientY
    // 起点取按钮当前真实 top，兼容「居中」与「已持久化」两种形态
    startTop.current = btnRef.current?.getBoundingClientRect().top ?? 0
  }

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) return
    const dy = e.clientY - startClientY.current
    if (Math.abs(dy) > 3) movedRef.current = true
    if (!movedRef.current) return
    const max = window.innerHeight - BTN_H - EDGE
    setDragY(Math.min(max, Math.max(TOP_MIN, startTop.current + dy)))
  }

  const onPointerUp = () => {
    if (!draggingRef.current) return
    draggingRef.current = false
    if (movedRef.current) {
      const finalY = dragY ?? persistedY ?? startTop.current
      if (finalY != null) setSidebarToggleY(Math.round(finalY))
    } else {
      setSidebarCollapsed(false)
    }
    setDragY(null)
  }

  return (
    <button
      ref={btnRef}
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={
        "fixed left-0 z-40 hidden cursor-grab touch-none select-none items-center rounded-r-lg border border-l-0 bg-background/90 px-0.5 py-5 text-muted-foreground shadow-md backdrop-blur transition-colors hover:text-foreground active:cursor-grabbing md:flex " +
        (centered ? "top-1/2 -translate-y-1/2" : "")
      }
      style={top != null ? { top } : undefined}
      title={t("sidebar.expandFabHint")}
    >
      <PanelLeft className="size-4" />
      <span className="sr-only">{t("sidebar.expand")}</span>
    </button>
  )
}
