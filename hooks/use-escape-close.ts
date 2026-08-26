import { useEffect, useRef } from "react"

/**
 * 弹窗在「打开」状态下按 ESC 关闭。
 *
 * 统一各弹窗的 ESC 关闭行为：只要传入 open=true 就挂载监听，按 ESC 触发 onClose；
 * open=false 时不监听，避免干扰其它弹窗。各弹窗统一调用，保证行为一致。
 *
 * 注意：录制快捷键等场景若已在捕获阶段对 ESC 调 stopPropagation，本监听（冒泡阶段）不会触发，
 * 因此不会与这类逻辑冲突。
 */
export function useEscapeClose(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onCloseRef.current()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open])
}
