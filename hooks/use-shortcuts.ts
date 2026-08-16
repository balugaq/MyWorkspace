"use client"

import { useEffect } from "react"
import { useWorkspace } from "@/lib/store"
import type { ShortcutAction, ShortcutBinding } from "@/lib/types"

/**
 * 从 settings 读取快捷键动作的绑定，并做一次匹配判断。
 * @returns 若事件命中某动作绑定则返回该 action，否则返回 null
 */
export function matchShortcut(e: KeyboardEvent, binding: ShortcutBinding): boolean {
  if (e.altKey || e.shiftKey) return false
  const needsModifier = binding.modifier
  const modifier = e.ctrlKey || e.metaKey
  if (needsModifier !== modifier) return false
  // 归一化：把 Ctrl+ 组合忽略大小写；K 之类映射为小写
  const key = e.key.toLowerCase()
  return key === binding.key.toLowerCase()
}

/**
 * 绑定全局快捷键。任何依赖 canUseShortcut 作用的组件都可监听。
 * 返回一个 dispose 函数；同时提供当前绑定供 UI 展示。
 */
export function useGlobalShortcuts() {
  const settings = useWorkspace((s) => s.settings)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return

      // 在文本输入框中：Ctrl/Cmd 组合键应优先作用于文本本身
      if ((e.ctrlKey || e.metaKey) && isTextTarget(e.target)) {
        const k = e.key.toLowerCase()
        // Ctrl+A：全选当前输入框内的文字
        if (k === "a") {
          e.preventDefault()
          const el = e.target as HTMLInputElement | HTMLTextAreaElement
          el.select()
          return
        }
        // Ctrl+S：保存（val 已通过 onChange 写入 store，这里仅失焦提交）
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
