"use client"

import { useEditor, EditorContent, type Editor } from "@tiptap/react"
import { useEffect, useRef, useState, type ClipboardEvent as ReactClipboardEvent } from "react"
import { richTextExtensions } from "./extensions"
import { normalizeLegacyImg } from "./normalize"
import { SelectionToolbar } from "./selection-toolbar"
import { scheduleUpgradeLinkCards } from "./upgrade"
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
            "rich-text-content w-full h-full min-h-0 rounded-lg border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
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
        scheduleUpgradeLinkCards(editor, { suppressRef })
      },
    },
    [],
  )

  // 外部 value 变化（切换章节/合并导入等）同步进编辑器，避免受控回环。
  // 源码模式下编辑器被隐藏且以 textarea 为唯一事实源，跳过此同步——
  // 否则 upgradeLinkCards 会改动隐藏编辑器并触发 onChange，把用户刚输入的
  // 回车/空格等被 markdown 序列化规范掉的空白「回写」掉，导致无法输入。
  //
  // 注意：editor.commands.setContent 会 dispatch 事务，TipTap 内部用 flushSync
  // 强制重渲染编辑器；若在 useEffect（React 提交阶段）内同步执行会触发
  // "flushSync was called from inside a lifecycle method"。因此整体延后到下一个
  // macrotask，并加 isDestroyed 守卫；effect 清理时取消待执行的定时任务。
  useEffect(() => {
    if (!editor || mode === "source") return
    const id = window.setTimeout(() => {
      if (editor.isDestroyed) return
      const current = getEditorMarkdown(editor)
      if (value !== current) {
        editor.commands.setContent(normalizeLegacyImg(value || ""), { emitUpdate: false })
        scheduleUpgradeLinkCards(editor)
      }
    }, 0)
    return () => window.clearTimeout(id)
  }, [value, editor, mode])

  if (!editor) return null

  // 源码模式（textarea）下的图片粘贴：剪贴板含图片时，写入 IndexedDB
  // 并在光标处插入 ![...](imgref:<id>)，切到可视化后会被解析为图片节点。
  // 可视化模式的图片粘贴由 editorProps.handlePaste 处理，此处只补源码态的缺口。
  const handleSourcePaste = async (e: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return
    const blobs: Blob[] = []
    for (const it of items) {
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const f = it.getAsFile()
        if (f) blobs.push(f)
      }
    }
    if (blobs.length === 0) return
    e.preventDefault()
    // 同步阶段捕获 DOM 引用与光标位置：React 合成事件的 currentTarget
    // 仅在事件派发期有效，await 之后会被置为 null，须在异步前取值。
    const ta = e.currentTarget
    const cur = ta.value
    const start = ta.selectionStart ?? cur.length
    const end = ta.selectionEnd ?? cur.length
    const ids = await Promise.all(blobs.map((b) => addImage(b, b.type)))
    const token = ids.map((id) => `![](imgref:${id})`).join("\n\n")
    onChange(cur.slice(0, start) + token + cur.slice(end))
    const caret = start + token.length
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(caret, caret)
    })
  }

  const toggleMode = () => {
    if (mode === "visual") {
      setMode("source")
    } else {
      // 切回可视化：用最新 value 同步编辑器（源码编辑已通过 onChange 回流到 value）
      editor.commands.setContent(normalizeLegacyImg(value || ""), { emitUpdate: false })
      scheduleUpgradeLinkCards(editor, { suppressRef })
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
      {!forceSource && mode === "visual" ? (
        <>
          <EditorContent editor={editor} className="native-scroll w-full min-h-0 flex-1 overflow-auto" />
          <SelectionToolbar editor={editor} />
        </>
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handleSourcePaste}
          spellCheck={false}
          className={cn(
            "native-scroll w-full min-h-0 flex-1 overflow-auto rounded-lg border bg-background px-3 py-2 font-mono text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            minHeight,
            className,
          )}
        />
      )}
    </div>
  )
}
