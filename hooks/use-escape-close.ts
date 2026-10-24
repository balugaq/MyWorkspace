import { useEffect, useRef } from "react"

// 统一各弹窗的 ESC 关闭：open=true 时在冒泡阶段挂 window 监听，
// 录制快捷键等场景在捕获阶段对 ESC 调 stopPropagation 也不会与本钩子冲突。
export function useEscapeClose(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose)
  // ref 只能在 effect 里赋值（渲染期写 ref 触发 react-hooks/refs）；无 deps，每次渲染后同步最新回调
  useEffect(() => {
    onCloseRef.current = onClose
  })

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
