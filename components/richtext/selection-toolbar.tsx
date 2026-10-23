"use client"

import { useTranslation } from "react-i18next"
import { BubbleMenu } from "@tiptap/react/menus"
import type { Editor } from "@tiptap/core"
import { Copy, ClipboardCopy, TextSelect, Quote } from "lucide-react"
import { copySelectionRich } from "./clipboard"

/**
 * QQ 式选段浮动工具条（选中文字时出现）：复制=纯文本、X 复制=带格式（HTML）、全选、引用。
 */
export function SelectionToolbar({ editor }: { editor: Editor }) {
  const { t } = useTranslation()
  const copyPlain = () => {
    const { from, to } = editor.state.selection
    const text = editor.state.doc.textBetween(from, to, "\n")
    void navigator.clipboard.writeText(text)
  }

  const copyRich = () => void copySelectionRich(editor)

  const selectAll = () => editor.chain().focus().selectAll().run()
  const quote = () => editor.chain().focus().toggleBlockquote().run()

  const btn =
    "flex items-center gap-1 rounded px-2 py-1 text-xs text-popover-foreground hover:bg-accent transition-colors"

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: ed, state }) => {
        const { from, to } = state.selection
        return (
          from !== to &&
          !ed.isActive("image") &&
          !ed.isActive("githubCard") &&
          !ed.isActive("bilibiliCard")
        )
      }}
    >
      <div className="flex items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-md">
        <button type="button" className={btn} onClick={copyPlain} title={t("rt.copyPlain")}>
          <Copy className="size-3.5" />
          {t("common.copy")}
        </button>
        <button type="button" className={btn} onClick={() => void copyRich()} title={t("rt.copyRich")}>
          <ClipboardCopy className="size-3.5" />
          X {t("common.copy")}
        </button>
        <button type="button" className={btn} onClick={selectAll} title={t("common.selectAll")}>
          <TextSelect className="size-3.5" />
          {t("common.selectAll")}
        </button>
        <button type="button" className={btn} onClick={quote} title={t("common.quote")}>
          <Quote className="size-3.5" />
          {t("common.quote")}
        </button>
      </div>
    </BubbleMenu>
  )
}
