"use client"

import { useEffect } from "react"
import { useWorkspace } from "@/lib/store"
import type { ShortcutAction, ShortcutBinding } from "@/lib/types"

// 匹配键盘事件与动作绑定：命中返回 true，否则 false。
export function matchShortcut(e: KeyboardEvent, binding: ShortcutBinding): boolean {
  if (e.altKey || e.shiftKey) return false
  const needsModifier = binding.modifier
  const modifier = e.ctrlKey || e.metaKey
  if (needsModifier !== modifier) return false
  const key = e.key.toLowerCase()
  return key === binding.key.toLowerCase()
}

// 全局快捷键：绑定来自 settings.shortcuts，变更时重新挂载；返回当前绑定供 UI 展示。
export function useGlobalShortcuts() {
  const settings = useWorkspace((s) => s.settings)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return

      // 在文本输入框中：Ctrl/Cmd 组合键应优先作用于文本本身
      if ((e.ctrlKey || e.metaKey) && isTextTarget(e.target)) {
        const k = e.key.toLowerCase()
        if (k === "a") {
          e.preventDefault()
          const el = e.target as HTMLInputElement | HTMLTextAreaElement
          el.select()
          return
        }
        // Ctrl+S：值已由 onChange 写入 store，失焦即完成提交保存
        if (k === "s") {
          e.preventDefault()
          const el = e.target as HTMLElement
          el.blur()
          return
        }
      }

      const shortcuts = settings.shortcuts
      const hit = (action: ShortcutAction) => matchShortcut(e, shortcuts[action])

      if (hit("newCategory")) {
        e.preventDefault()
        useWorkspace.getState().setAddCategoryOpen(true)
      } else if (hit("goCalendar")) {
        e.preventDefault()
        useWorkspace.getState().goCalendar()
      } else if (hit("search")) {
        e.preventDefault()
        // 打开全局搜索：通过全局事件，由 page.tsx 监听
        window.dispatchEvent(new CustomEvent("dsh:open-search"))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [settings.shortcuts])

  return settings.shortcuts
}

function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA"
  )
}
