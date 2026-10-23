"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import { useEffect } from "react"
import { richTextExtensions } from "./extensions"
import { normalizeLegacyImg } from "./normalize"
import { upgradeLinkCards, upgradeInternalLinks } from "./upgrade"
import { navigateInternalLink } from "./internal-link-mark"
import { replaceLangTokens } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/**
 * 只读富文本渲染（与编辑态共用扩展集，渲染一致），用于章节/日历/节点卡片预览。
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
    // setContent 与 upgrade* 内部都用 flushSync，在 useEffect（React 提交阶段）内同步执行会抛错，
    // 故两者都延后到下一个 macrotask + isDestroyed 守卫。
    const t = window.setTimeout(() => {
      if (editor.isDestroyed) return
      // {lang:key} 占位符（TODO 40）在只读渲染时替换为当前语言文本（编辑态保留原 token）
      editor.commands.setContent(replaceLangTokens(normalizeLegacyImg(content || "")), {
        emitUpdate: false,
      })
      upgradeLinkCards(editor)
      // 内链标记（TODO 28）：只读渲染时升级为可点击跳转链接
      upgradeInternalLinks(editor)
    }, 0)
    return () => window.clearTimeout(t)
  }, [content, editor])

  // 内链点击委托：升级后的 <a data-mw-internal> 在此统一定位跳转
  function handleInternalLinkClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target instanceof Element ? e.target.closest("[data-mw-internal]") : null
    if (!target) return
    const link = target.getAttribute("data-mw-internal")
    if (link) navigateInternalLink(link)
  }

  if (!editor) return null
  return (
    <div onClick={handleInternalLinkClick}>
      <EditorContent editor={editor} />
    </div>
  )
}
