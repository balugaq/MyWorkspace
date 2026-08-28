"use client"

import { useEditor, EditorContent, type Editor } from "@tiptap/react"
import { useEffect, useRef, useState } from "react"
import { richTextExtensions } from "./extensions"
import { normalizeLegacyImg } from "./normalize"
import { SelectionToolbar } from "./selection-toolbar"
import { upgradeGithubUrls } from "./upgrade"
import { isGithubIssueUrl } from "@/lib/gh-card"
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
}: {
  value: string
  onChange: (v: string) => void
  className?: string
  minHeight?: string
}) {
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const [mode, setMode] = useState<"visual" | "source">("visual")

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
        onChangeRef.current(getEditorMarkdown(editor))
      },
      onCreate: ({ editor }) => {
        upgradeGithubUrls(editor)
      },
    },
    [],
  )

  // 外部 value 变化（切换章节/合并导入等）同步进编辑器，避免受控回环
  useEffect(() => {
    if (!editor) return
    const current = getEditorMarkdown(editor)
    if (value !== current) {
      editor.commands.setContent(normalizeLegacyImg(value || ""), { emitUpdate: false })
      upgradeGithubUrls(editor)
    }
  }, [value, editor])

  if (!editor) return null

  const toggleMode = () => {
    if (mode === "visual") {
      setMode("source")
    } else {
      // 切回可视化：用最新 value 同步编辑器（源码编辑已通过 onChange 回流到 value）
      editor.commands.setContent(normalizeLegacyImg(value || ""), { emitUpdate: false })
      upgradeGithubUrls(editor)
      setMode("visual")
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-1">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={toggleMode}
          className="rounded border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {mode === "visual" ? "源码" : "可视化"}
        </button>
      </div>
      {mode === "visual" ? (
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
