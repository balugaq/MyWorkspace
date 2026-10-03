"use client"

// 文字右键菜单「UI 外壳层」（TODO 50）：
// 自绘轻量浮层（不用 base-ui ContextMenu/Menu）——base-ui 的右键菜单是 modal 焦点陷阱，
// 打开即夺走编辑器焦点，选区操作会全部落空。自绘的核心手法：菜单容器 onMouseDown
// preventDefault，点击菜单项时焦点根本不离开编辑器，动作可立即执行、选区全程可见。
// 功能与外壳的分工见 lib/text-menu-actions.ts 与 docs/ui-conventions.md §7。

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { BUILTIN_TEXT_MENU_ACTIONS, type TextMenuAction, type TextMenuContext } from "@/lib/text-menu-actions"
import { cn } from "@/lib/utils"

const ITEM_CLASS =
  "flex w-full cursor-default items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm text-popover-foreground outline-none hover:bg-accent focus-visible:bg-accent"

/**
 * 通用文字右键菜单：把 children 包进右键区域，按 ctx 的能力渲染可用动作。
 * - actions 缺省用 BUILTIN_TEXT_MENU_ACTIONS（剪切/复制/粘贴/全选/AI），可传自定义组；
 * - 动作是否出现完全由 ctx 的能力决定（可编辑、有无回调、有无选区）；
 * - 焦点零转移：菜单打开不夺焦（纯浮层）、点击菜单项 onMouseDown preventDefault 不丢焦，
 *   动作点击后立即执行（此时编辑器仍聚焦，select/剪切/粘贴即时生效、选区全程可见）；
 * - 关闭时机：点击菜单项 / 点击菜单外任意处 / 再次右键别处 / Esc / 页面滚动或缩放；
 * - run 失败（如剪贴板权限被拒）toast 提示，不抛出。
 */
export function TextContextMenu({
  ctx,
  actions = BUILTIN_TEXT_MENU_ACTIONS,
  className,
  children,
}: {
  ctx: TextMenuContext
  actions?: TextMenuAction[]
  /** 外壳 div 的布局类（调用方把原来的布局类挪到这里即可，不影响内部结构） */
  className?: string
  children: React.ReactNode
}) {
  // 菜单锚点（视口坐标）；null = 关闭。打开瞬间 setState 触发重渲染，
  // isAvailable 里的 getSelectedText() 恰好在此刻求值，快照不会过期。
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const close = useCallback(() => setPos(null), [])

  // 打开/跟随右键：阻止原生菜单，记录视口坐标
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setPos({ x: e.clientX, y: e.clientY })
  }, [])

  // 渲染后测量实际尺寸，把菜单 clamp 进视口
  useLayoutEffect(() => {
    if (!pos || !menuRef.current) return
    const r = menuRef.current.getBoundingClientRect()
    let { x, y } = pos
    if (r.right > window.innerWidth) x = Math.max(4, window.innerWidth - r.width - 4)
    if (r.bottom > window.innerHeight) y = Math.max(4, window.innerHeight - r.height - 4)
    if (x !== pos.x || y !== pos.y) setPos({ x, y })
  }, [pos])

  // 全局监听：菜单外点击/右键/Esc/滚动/缩放 → 关闭
  useEffect(() => {
    if (!pos) return
    const inMenu = (t: EventTarget | null) =>
      t instanceof Node && menuRef.current?.contains(t) === true
    const onDocMouseDown = (e: MouseEvent) => {
      if (!inMenu(e.target)) close()
    }
    const onDocContextMenu = (e: MouseEvent) => {
      // 别处右键：这里先关闭，编辑器区域的 onContextMenu 随后会重新打开
      if (!inMenu(e.target)) close()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    const onScrollOrResize = (e: Event) => {
      if (!inMenu(e.target)) close()
    }
    document.addEventListener("mousedown", onDocMouseDown, true)
    document.addEventListener("contextmenu", onDocContextMenu, true)
    document.addEventListener("keydown", onKeyDown, true)
    window.addEventListener("scroll", onScrollOrResize, true)
    window.addEventListener("resize", close)
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown, true)
      document.removeEventListener("contextmenu", onDocContextMenu, true)
      document.removeEventListener("keydown", onKeyDown, true)
      window.removeEventListener("scroll", onScrollOrResize, true)
      window.removeEventListener("resize", close)
    }
  }, [pos, close])

  const visible = pos ? actions.filter((a) => a.isAvailable(ctx)) : []

  return (
    <>
      {/* 普通外壳 div：只挂 onContextMenu，不再有 base-ui 的焦点陷阱 */}
      <div onContextMenu={handleContextMenu} className={cn(className)}>
        {children}
      </div>
      {pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            // 核心：不把焦点从编辑器夺走——菜单打开/点击全程编辑器保持聚焦
            onMouseDown={(e) => e.preventDefault()}
            style={{ left: pos.x, top: pos.y }}
            className="fixed z-50 min-w-32 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
          >
            {visible.map((a, i) => (
              <Fragment key={a.id}>
                {/* AI 与文本基础操作分组：非首位时补一条分隔线 */}
                {a.id === "ai" && i > 0 && <div className="-mx-1 my-1 h-px bg-border" />}
                <button
                  type="button"
                  role="menuitem"
                  className={ITEM_CLASS}
                  onClick={() => {
                    close()
                    void Promise.resolve(a.run(ctx)).catch(() => {
                      toast.error("操作失败：剪贴板不可用或权限被拒")
                    })
                  }}
                >
                  <a.icon className="size-4 shrink-0" />
                  {a.label}
                </button>
              </Fragment>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
