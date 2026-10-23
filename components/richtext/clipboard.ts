"use client"

// TipTap 选区复制共享实现（selection-toolbar「X 复制」与右键菜单「复制」共用）：带 HTML 写剪贴板，失败回退纯文本。

import { DOMSerializer } from "@tiptap/pm/model"
import type { Editor } from "@tiptap/core"

export async function copySelectionRich(editor: Editor): Promise<void> {
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
