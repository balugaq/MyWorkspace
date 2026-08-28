"use client"

import { BubbleMenu } from "@tiptap/react/menus"
import type { Editor } from "@tiptap/core"
import { DOMSerializer } from "@tiptap/pm/model"
import { Copy, ClipboardCopy, TextSelect, Quote } from "lucide-react"

/**
 * QQ 式选段浮动工具条：选中文字时出现。
 *  - 复制：纯文本
 *  - X 复制：带格式（HTML）复制，对应 QQ 的「复制」与「复制为富文本」
 *  - 全选：选中整篇
 *  - 引用：把选区包进引用块
 */
export function SelectionToolbar({ editor }: { editor: Editor }) {
  const copyPlain = () => {
    const { from, to } = editor.state.selection
    const text = editor.state.doc.textBetween(from, to, "\n")
    void navigator.clipboard.writeText(text)
  }

  const copyRich = async () => {
    const { from, to } = editor.state.selection
    const slice = editor.state.doc.slice(from, to)
    const serializer = DOMSerializer.fromSchema(editor.schema)
    const frag = serializer.serializeFragment(slice.content)
    const div = document.createElement("div")
    div.appendChild(frag)
    const html = div.innerHTML
    const text = editor.state.doc.textBetween(from, to, "\n")
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ])
    } catch {
      void navigator.clipboard.writeText(text)
    }
  }

  const selectAll = () => editor.chain().focus().selectAll().run()
  const quote = () => editor.chain().focus().toggleBlockquote().run()

  const btn =
    "flex items-center gap-1 rounded px-2 py-1 text-xs text-popover-foreground hover:bg-accent transition-colors"

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: ed, state }) => {
        const { from, to } = state.selection
        return from !== to && !ed.isActive("image") && !ed.isActive("githubCard")
      }}
    >
      <div className="flex items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-md">
        <button type="button" className={btn} onClick={copyPlain} title="复制为纯文本">
          <Copy className="size-3.5" />
          复制
        </button>
        <button type="button" className={btn} onClick={() => void copyRich()} title="复制为富文本">
          <ClipboardCopy className="size-3.5" />
          X 复制
        </button>
        <button type="button" className={btn} onClick={selectAll} title="全选">
          <TextSelect className="size-3.5" />
          全选
        </button>
        <button type="button" className={btn} onClick={quote} title="引用">
          <Quote className="size-3.5" />
          引用
        </button>
      </div>
    </BubbleMenu>
  )
}
