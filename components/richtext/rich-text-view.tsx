"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import { useEffect } from "react"
import { richTextExtensions } from "./extensions"
import { normalizeLegacyImg } from "./normalize"
import { upgradeLinkCards } from "./upgrade"
import { cn } from "@/lib/utils"

/**
 * 只读富文本渲染（与编辑态共用扩展集，渲染一致）。
 * 用于章节/日历/节点卡片的预览。GitHub 预览卡、imgref 内文图、任务列表等照常渲染。
 */
export function RichTextView({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  const editor = useEditor(
    {
      extensions: richTextExtensions,
      content: normalizeLegacyImg(content || ""),
      editable: false,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: cn("rich-text-content text-sm leading-relaxed [overflow-wrap:anywhere]", className),
        },
      },
    },
    [],
  )

  useEffect(() => {
    if (!editor) return
    // setContent 与 upgradeLinkCards 内部都会触发 TipTap 的 flushSync；
    // 若在 React 提交阶段（useEffect 内）同步执行，会抛
    // "flushSync was called from inside a lifecycle method" 错误。
    // 两者都延后到下一个 macrotask 执行，并加 isDestroyed 守卫。
    const t = window.setTimeout(() => {
      if (editor.isDestroyed) return
      editor.commands.setContent(normalizeLegacyImg(content || ""), { emitUpdate: false })
      upgradeLinkCards(editor)
    }, 0)
    return () => window.clearTimeout(t)
  }, [content, editor])

  if (!editor) return null
  return <EditorContent editor={editor} />
}
