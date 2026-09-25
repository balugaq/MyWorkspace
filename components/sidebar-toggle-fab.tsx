"use client"

// 侧边栏收起后的贴边悬浮展开开关（TODO 25 打磨）：
// - 固定贴左边缘，可上下拖动，拖动结束把纵向位置持久化到 store（刷新保留）。
// - 未拖动过（store 无记录）时默认垂直居中。
// - 点击（位移 < 4px 视为点击而非拖动）展开侧边栏。

import { useRef, useState } from "react"
import { PanelLeft } from "lucide-react"
import { useWorkspace } from "@/lib/store"

const BTN_H = 56 // 按钮估算高度（py-5 + 图标），用于拖动 clamp
const TOP_MIN = 64 // 拖动范围上界：BrandHeader（h-14）之下——开关不越过侧边栏本身的范围
const EDGE = 8

export function SidebarToggleFab() {
  const setSidebarCollapsed = useWorkspace((s) => s.setSidebarCollapsed)
  const persistedY = useWorkspace((s) => s.sidebarToggleY)
  const setSidebarToggleY = useWorkspace((s) => s.setSidebarToggleY)

  // 拖动中的实时位置（px，距视口顶部）；null = 未在拖动
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
    // 拖动起点取按钮当前真实 top（兼容「居中」与「已持久化」两种形态）
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
      // 拖动结束：持久化最终位置
      const finalY = dragY ?? persistedY ?? startTop.current
      if (finalY != null) setSidebarToggleY(Math.round(finalY))
    } else {
      // 视为点击：展开侧边栏
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
      title="展开侧边栏（可上下拖动）"
    >
      <PanelLeft className="size-4" />
      <span className="sr-only">展开侧边栏</span>
    </button>
  )
}
