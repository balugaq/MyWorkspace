// 原生滚动容器（textarea 等）的自绘「细圆角胶囊」滑块，与 Base UI ScrollArea 观感一致。
// 背景：textarea 是原生控件，其原生滚动条受浏览器渲染策略支配（如 Win11 Fluent overlay
// 模式直接无视 ::-webkit-scrollbar 自定义），无法可靠画成胶囊 → 隐藏原生条 + 自绘 thumb。
// 交互：thumb 可拖拽（按 track 比例映射 scrollTop，与原生滚动条行为一致）；
// 轨道空白处点击翻页；悬停在滑条区域的滚轮转发给滚动容器。
// thumb 拖拽期间滚动容器持续触发 scroll → 复用滚动监听刷新位置，天然自洽。
// 已知边界：内容尺寸变化但容器自身高度不变时（textarea 到达 max-h 后继续输入），
// thumb 比例会在下次 scroll 事件时修正——纯视觉误差，可接受。

"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  cloneElement,
  isValidElement,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { cn } from "@/lib/utils"

type ThumbBox = { height: number; top: number }

function useScrollThumb() {
  const scrollRef = useRef<HTMLElement | null>(null)
  const rafRef = useRef(0)
  const [thumb, setThumb] = useState<ThumbBox | null>(null)

  const update = useCallback(() => {
    const el = scrollRef.current
    if (!el) {
      setThumb(null)
      return
    }
    const { scrollTop, scrollHeight, clientHeight } = el
    if (scrollHeight <= clientHeight + 1) {
      setThumb(null)
      return
    }
    // 与 Base UI ScrollArea 同口径：thumb 最小可见 24px，比例 = 可视 / 全内容
    const height = Math.max(24, (clientHeight / scrollHeight) * clientHeight)
    const maxScroll = scrollHeight - clientHeight
    const top = maxScroll > 0 ? (scrollTop / maxScroll) * (clientHeight - height) : 0
    setThumb({ height, top })
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      if (rafRef.current) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        update()
      })
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    // 容器自身尺寸变化（如 textarea field-sizing 随内容增高）时重算
    const ro = new ResizeObserver(onScroll)
    ro.observe(el)
    update()
    return () => {
      el.removeEventListener("scroll", onScroll)
      ro.disconnect()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [update])

  return { scrollRef, thumb }
}

export function NativeScrollArea({
  children,
  className,
}: {
  children: React.ReactElement
  className?: string
}) {
  const { scrollRef, thumb } = useScrollThumb()
  const trackRef = useRef<HTMLDivElement | null>(null)

  const el = children as React.ReactElement<{
    ref?: unknown
    className?: string
  }>
  const child = isValidElement(children)
    ? cloneElement(el, {
        ref: scrollRef,
        className: cn(el.props.className, "hide-native-scrollbar"),
      })
    : children

  // thumb 拖拽：指针位移按「thumb 行程 / track 高 = 可视 / 全内容」同比例映射 scrollTop
  const onThumbPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const scrollEl = scrollRef.current
    const track = trackRef.current
    if (!scrollEl || !track || scrollEl.scrollHeight <= scrollEl.clientHeight) return
    e.preventDefault()
    e.stopPropagation()
    const startY = e.clientY
    const startScrollTop = scrollEl.scrollTop
    const trackH = track.clientHeight
    const move = (ev: PointerEvent) => {
      scrollEl.scrollTop =
        startScrollTop + ((ev.clientY - startY) * scrollEl.scrollHeight) / trackH
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  // 轨道空白处点击：向点击方向翻一屏（thumb 自身的 pointerdown 已 stopPropagation）
  const onTrackPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const scrollEl = scrollRef.current
    const track = trackRef.current
    if (!scrollEl || !track || !thumb) return
    const rect = track.getBoundingClientRect()
    const direction = e.clientY < rect.top + thumb.top + thumb.height / 2 ? -1 : 1
    scrollEl.scrollTop += direction * scrollEl.clientHeight * 0.9
  }

  // 悬停在滑条区域（track/thumb）上的滚轮转发给滚动容器；
  // 必须非 passive 才能 preventDefault，阻止滚动事件冒泡给页面上其他可滚祖先。
  // deps 用 hasThumb：track 只在出现滚动（thumb 非 null）后才挂载，
  // 若 deps 不含它，effect 早期跑空一次后 track 挂载也不会再挂 wheel 监听。
  const hasThumb = thumb !== null
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const onWheel = (e: WheelEvent) => {
      const scrollEl = scrollRef.current
      if (!scrollEl) return
      e.preventDefault()
      scrollEl.scrollTop += e.deltaY
    }
    track.addEventListener("wheel", onWheel, { passive: false })
    return () => track.removeEventListener("wheel", onWheel)
    // scrollRef 是稳定的 useRef 引用，入 deps 不会引发重挂
  }, [hasThumb, scrollRef])

  return (
    <div data-slot="native-scroll-area" className={cn("group/nsa relative", className)}>
      {child}
      {thumb && (
        <div
          ref={trackRef}
          aria-hidden
          className="absolute inset-y-0 right-0 w-2.5"
          onPointerDown={onTrackPointerDown}
        >
          <div
            className="absolute inset-x-px cursor-default rounded-full bg-border transition-colors duration-150 hover:bg-color"
            style={{ height: thumb.height, transform: `translateY(${thumb.top}px)` }}
            onPointerDown={onThumbPointerDown}
          />
        </div>
      )}
    </div>
  )
}
