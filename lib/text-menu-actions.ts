"use client"

// 文字右键菜单「功能层」（TODO 50 / 主人要求的分离架构）：
// 本文件只定义「能做什么」——统一的上下文接口 + 可复用的动作集合，
// 不知道也不关心菜单长什么样（UI 见 components/text-context-menu.tsx）。
// 任何地方的 ContextMenu（随笔编辑器、未来的只读文档、节点卡……）都可以：
//   1) 直接复用 BUILTIN_TEXT_MENU_ACTIONS；
//   2) 用自定义 TextMenuContext 适配自己的编辑器（TipTap / textarea / 任意 contenteditable）；
//   3) 追加自有动作（如日历格的「今天放假」），不必经过这里。

import type { LucideIcon } from "lucide-react"
import { Scissors, Copy, ClipboardPaste, TextSelect, Sparkles } from "lucide-react"

/**
 * 文字右键菜单的统一上下文：功能层只认这个接口，不认任何具体组件。
 *
 * 所有回调由「宿主」（编辑器/文本框的封装方）提供；菜单打开时刻才求值，
 * 因此 getSelectedText 必须是函数——选区变化不触发 React 渲染，
 * 若传字符串快照会拿到过期值。
 */
export interface TextMenuContext {
  /** 目标是否可编辑（决定剪切/粘贴是否出现；只读文档天然为 false） */
  editable: boolean
  /** 打开菜单那一刻的选中文本（惰性求值） */
  getSelectedText: () => string
  /** 复制实现；缺省用纯文本剪贴板写入 getSelectedText() 的结果 */
  copy?: () => void
  /** 剪切实现（删除选区）；写入剪贴板由默认 run 统一负责 */
  cut?: () => void
  /** 粘贴实现，收到的 text 为 navigator.clipboard.readText() 的结果 */
  paste?: (text: string) => void
  /** 全选实现；缺省 document.execCommand("selectAll") */
  selectAll?: () => void
  /** AI 处理选中文字；提供即出现「AI」项（如只在随笔中显示） */
  onAi?: (text: string) => void
}

/** 单个菜单动作：是否出现 + 点击行为，与 UI 外壳完全解耦 */
export interface TextMenuAction {
  id: string
  label: string
  icon: LucideIcon
  isAvailable: (ctx: TextMenuContext) => boolean
  run: (ctx: TextMenuContext) => void | Promise<void>
}

/** 内置动作组（顺序即 TODO 50 口径）：剪切 → 复制 → 粘贴 → 全选 → AI */
export const BUILTIN_TEXT_MENU_ACTIONS: TextMenuAction[] = [
  {
    id: "cut",
    label: "剪切",
    icon: Scissors,
    // 无选区剪切无意义：空白处（只有光标甚至无焦点）不出现
    isAvailable: (ctx) => ctx.editable && !!ctx.cut && ctx.getSelectedText().length > 0,
    run: async (ctx) => {
      const text = ctx.getSelectedText()
      if (text) await navigator.clipboard.writeText(text)
      ctx.cut?.()
    },
  },
  {
    id: "copy",
    label: "复制",
    icon: Copy,
    // 无选区复制无意义；ctx.copy（富文本复制）只在有选区时才有内容可写
    isAvailable: (ctx) => ctx.getSelectedText().length > 0,
    run: (ctx) => {
      // 宿主给了 copy（如富文本复制）则优先；否则纯文本兜底
      if (ctx.copy) {
        ctx.copy()
        return
      }
      const text = ctx.getSelectedText()
      if (text) void navigator.clipboard.writeText(text)
    },
  },
  {
    id: "paste",
    label: "粘贴",
    icon: ClipboardPaste,
    isAvailable: (ctx) =>
      ctx.editable && !!ctx.paste && typeof navigator.clipboard?.readText === "function",
    run: async (ctx) => {
      const text = await navigator.clipboard.readText()
      if (text) ctx.paste?.(text)
    },
  },
  {
    id: "selectAll",
    label: "全选",
    icon: TextSelect,
    isAvailable: (ctx) => !!ctx.selectAll || ctx.editable,
    run: (ctx) => {
      if (ctx.selectAll) {
        ctx.selectAll()
        return
      }
      document.execCommand("selectAll")
    },
  },  {
    id: "ai",
    label: "AI",
    icon: Sparkles,
    // AI 处理的是选中内容：无选区出现也无从下手，一并隐藏
    isAvailable: (ctx) => !!ctx.onAi && ctx.getSelectedText().length > 0,
    run: (ctx) => {
      const text = ctx.getSelectedText()
      if (text) ctx.onAi?.(text)
    },
  },
]
