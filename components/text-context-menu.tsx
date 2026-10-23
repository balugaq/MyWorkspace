"use client"

// 文字右键菜单外壳（TODO 50）：自绘浮层而不用 base-ui ContextMenu——后者是 modal 焦点陷阱，
// 打开即夺走编辑器焦点；核心手法是菜单容器 onMouseDown preventDefault，点击菜单项不丢焦。

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"
import { BUILTIN_TEXT_MENU_ACTIONS, type TextMenuAction, type TextMenuContext } from "@/lib/text-menu-actions"
import { cn } from "@/lib/utils"
import { AiText } from "@/components/ai-brand"

const ITEM_CLASS =
  "flex w-full cursor-default items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm text-popover-foreground outline-none hover:bg-accent focus-visible:bg-accent"

/**
 * 通用文字右键菜单：把 children 包进右键区域，按 ctx 能力渲染可用动作
 * （actions 缺省 BUILTIN_TEXT_MENU_ACTIONS）。焦点零转移：点击菜单项
 * onMouseDown preventDefault，编辑器保持聚焦、选区全程可见。
 */
export function TextContextMenu({
  ctx,
  actions = BUILTIN_TEXT_MENU_ACTIONS,
  className,
  children,
}: {
  ctx: TextMenuContext
  actions?: TextMenuAction[]
  /** 外壳 div 的布局类 */
  className?: string
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  // 菜单锚点（视口坐标），null = 关闭；打开瞬间重渲染时 getSelectedText() 恰好求值，快照不会过期
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const close = useCallback(() => setPos(null), [])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setPos({ x: e.clientX, y: e.clientY })
  }, [])

  useLayoutEffect(() => {
    if (!pos || !menuRef.current) return
    const r = menuRef.current.getBoundingClientRect()
    let { x, y } = pos
    if (r.right > window.innerWidth) x = Math.max(4, window.innerWidth - r.width - 4)
    if (r.bottom > window.innerHeight) y = Math.max(4, window.innerHeight - r.height - 4)
    if (x !== pos.x || y !== pos.y) setPos({ x, y })
  }, [pos])

  // 全局监听关闭时机：菜单外点击/右键/Esc/滚动/缩放
  useEffect(() => {
    if (!pos) return
    const inMenu = (t: EventTarget | null) =>
      t instanceof Node && menuRef.current?.contains(t) === true
    const onDocMouseDown = (e: MouseEvent) => {
      if (!inMenu(e.target)) close()
    }
    const onDocContextMenu = (e: MouseEvent) => {
      // 别处右键：先关闭，编辑器 onContextMenu 随后会重新打开
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
      <div onContextMenu={handleContextMenu} className={cn(className)}>
        {children}
      </div>
      {pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            // 核心：preventDefault 不夺焦，点击菜单项时编辑器仍聚焦
            onMouseDown={(e) => e.preventDefault()}
            style={{ left: pos.x, top: pos.y }}
            className="fixed z-50 min-w-32 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
          >
            {visible.map((a, i) => (
              <Fragment key={a.id}>
                {a.id === "ai" && i > 0 && <div className="-mx-1 my-1 h-px bg-border" />}
                <button
                  type="button"
                  role="menuitem"
                  className={ITEM_CLASS}
                  onClick={() => {
                    close()
                    void Promise.resolve(a.run(ctx)).catch(() => {
                      toast.error(t("novel.clipboardError"))
                    })
                  }}
                >
                  <a.icon className="size-4 shrink-0" />
                  {/* TODO 57：AI 项用渐变彩色「AI」字 */}
                  {a.id === "ai" ? <AiText /> : a.label}
                </button>
              </Fragment>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
