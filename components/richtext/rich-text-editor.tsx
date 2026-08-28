"use client"

import { useEditor, EditorContent, type Editor } from "@tiptap/react"
import { useEffect, useRef, useState } from "react"
import { richTextExtensions } from "./extensions"
import { normalizeLegacyImg } from "./normalize"
import { SelectionToolbar } from "./selection-toolbar"
import { upgradeLinkCards } from "./upgrade"
import { isGithubIssueUrl } from "@/lib/gh-card"
import { isBilibiliUrl } from "@/lib/bilibili"
import { addImage } from "@/lib/image-store"
import { cn } from "@/lib/utils"

const IMGREF_PREFIX = "imgref:"

type MarkdownStorage = { getMarkdown: () => string }
function getEditorMarkdown(editor: Editor): string {
  const md = (editor.storage as { markdown?: MarkdownStorage }).markdown
  return md ? md.getMarkdown() : ""
}

/**
 * 可编辑富文本编辑器（TipTap 接管）。
 * - 受控：value 为 markdown 字符串，onChange 回传 getMarkdown() 结果。
 * - 粘贴 GitHub Issue/PR 链接自动生成预览卡。
 * - 选中文字出现 QQ 式浮动工具条（复制 / X 复制 / 全选 / 引用）。
 * - 顶部「源码 / 可视化」切换：源码模式直接显示并编辑原始 Markdown 文本。
 */
export function RichTextEditor({
  value,
  onChange,
  className,
  minHeight = "min-h-24",
  forceSource = false,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
  minHeight?: string
  /** 仅源码编辑：隐藏「源码/可视化」切换按钮，始终渲染源码 textarea */
  forceSource?: boolean
}) {
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  // 程序化升级（把裸链接换成预览卡）会改动文档并触发 onUpdate，
  // 若此时回写 getMarkdown()，tiptap-markdown 的序列化会规范化空白，
  // 把用户原文里的空行/空格改掉。用此标志让升级期间不回写 onChange，保护原文。
  const suppressRef = useRef(false)

  const [mode, setMode] = useState<"visual" | "source">("source")

  const editor = useEditor(
    {
      extensions: richTextExtensions,
      content: normalizeLegacyImg(value || ""),
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: cn(
            "w-full min-h-0 flex-1 overflow-auto rounded-lg border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            minHeight,
            className,
          ),
        },
        handlePaste(view, event) {
          const text = event.clipboardData?.getData("text/plain")?.trim()
          if (text && isGithubIssueUrl(text)) {
            const card = view.state.schema.nodes.githubCard.create({ url: text })
            view.dispatch(view.state.tr.replaceSelectionWith(card))
            return true
          }
          if (text && isBilibiliUrl(text)) {
            const card = view.state.schema.nodes.bilibiliCard.create({ url: text })
            view.dispatch(view.state.tr.replaceSelectionWith(card))
            return true
          }
          // 图片粘贴：写入 IndexedDB 并插入 imgref 图片节点
          const items = event.clipboardData?.items
          if (items) {
            const blobs: Blob[] = []
            for (const it of items) {
              if (it.kind === "file" && it.type.startsWith("image/")) {
                const f = it.getAsFile()
                if (f) blobs.push(f)
              }
            }
            if (blobs.length > 0) {
              event.preventDefault()
              void (async () => {
                const ids = await Promise.all(blobs.map((b) => addImage(b, b.type)))
                const { state, dispatch } = view
                let tr = state.tr
                const imgType = state.schema.nodes.image
                for (const id of ids) {
                  tr = tr.replaceSelectionWith(imgType.create({ src: `${IMGREF_PREFIX}${id}` }))
                }
                dispatch(tr)
              })()
              return true
            }
          }
          return false
        },
      },
      onUpdate: ({ editor }) => {
        if (suppressRef.current) return
        onChangeRef.current(getEditorMarkdown(editor))
      },
      onCreate: ({ editor }) => {
        suppressRef.current = true
        upgradeLinkCards(editor)
        suppressRef.current = false
      },
    },
    [],
  )

  // 外部 value 变化（切换章节/合并导入等）同步进编辑器，避免受控回环。
  // 源码模式下编辑器被隐藏且以 textarea 为唯一事实源，跳过此同步——
  // 否则 upgradeLinkCards 会改动隐藏编辑器并触发 onChange，把用户刚输入的
  // 回车/空格等被 markdown 序列化规范掉的空白「回写」掉，导致无法输入。
  useEffect(() => {
    if (!editor || mode === "source") return
    const current = getEditorMarkdown(editor)
    if (value !== current) {
      editor.commands.setContent(normalizeLegacyImg(value || ""), { emitUpdate: false })
      upgradeLinkCards(editor)
    }
  }, [value, editor, mode])

  if (!editor) return null

  const toggleMode = () => {
    if (mode === "visual") {
      setMode("source")
    } else {
      // 切回可视化：用最新 value 同步编辑器（源码编辑已通过 onChange 回流到 value）
      suppressRef.current = true
      editor.commands.setContent(normalizeLegacyImg(value || ""), { emitUpdate: false })
      upgradeLinkCards(editor)
      suppressRef.current = false
      setMode("visual")
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-1">
      <div className="flex items-center justify-end">
        {!forceSource && (
          <button
            type="button"
            onClick={toggleMode}
            className="rounded border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {mode === "visual" ? "源码" : "可视化"}
          </button>
        )}
      </div>
      {forceSource || mode === "visual" ? (
        <>
          <EditorContent editor={editor} className="w-full min-h-0 flex-1" />
          <SelectionToolbar editor={editor} />
        </>
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className={cn(
            "w-full min-h-0 flex-1 overflow-auto rounded-lg border bg-background px-3 py-2 font-mono text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            minHeight,
            className,
          )}
        />
      )}
    </div>
  )
}
