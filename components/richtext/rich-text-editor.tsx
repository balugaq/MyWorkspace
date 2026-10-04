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
import { NativeScrollArea } from "@/components/ui/native-scroll-area"
import { TextContextMenu } from "@/components/text-context-menu"
import { copySelectionRich } from "./clipboard"
import type { TextMenuContext } from "@/lib/text-menu-actions"

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
 * - 右键菜单（TODO 50）：剪切/复制/粘贴/全选，外壳与功能分离见 components/text-context-menu.tsx；
 *   传入 onAiText 时额外出现「AI」项（随笔编辑器传入，其他宿主默认无）。
 * - 顶部「源码 / 可视化」切换：源码模式直接显示并编辑原始 Markdown 文本。
 */
export function RichTextEditor({
  value,
  onChange,
  className,
  minHeight = "min-h-24",
  forceSource = false,
  onAiText,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
  minHeight?: string
  /** 仅源码编辑：隐藏「源码/可视化」切换按钮，始终渲染源码 textarea */
  forceSource?: boolean
  /** 「AI」右键项回调（传选中文字）；不传则不显示 AI 项（如日历笔记、节点卡不需要） */
  onAiText?: (text: string) => void
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

  // 源码 textarea 引用（右键菜单的剪切/粘贴/全选需要实时读选区）。
  // 注意：不能直接写 ref={textareaRef}——外层 NativeScrollArea 会 cloneElement 注入自己的
  // scrollRef，覆盖子元素 ref（React 19 ref 即 prop）。改为在 textarea 的 onContextMenu
  // 事件里同步记录 currentTarget：右键瞬间必先于菜单求值，且切模式重挂载后自动更新。
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

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

  // 右键菜单上下文（TODO 50，外壳见 components/text-context-menu.tsx）。
  // 自绘浮层无焦点陷阱：菜单打开/点击全程编辑器保持聚焦，动作可即时执行。
  // 全部回调走闭包实时读取 editor/textarea 状态，菜单打开时取到的就是最新值。
  const visualCtx: TextMenuContext = {
    editable: true,
    getSelectedText: () => {
      const { from, to } = editor.state.selection
      return editor.state.doc.textBetween(from, to, "\n")
    },
    // 复制用富文本实现（与浮动工具条「X 复制」同一管线）；剪切/粘贴/全选走 TipTap 命令
    copy: () => void copySelectionRich(editor),
    cut: () => editor.commands.deleteSelection(),
    // 用 ProseMirror insertText 而非 insertContent(string)，避免文本被当 HTML 解析
    paste: (text) => {
      editor.commands.command(({ tr, dispatch }) => {
        if (dispatch) tr.insertText(text)
        return true
      })
    },
    selectAll: () => editor.commands.selectAll(),
    onAi: onAiText,
  }

  const sourceCtx: TextMenuContext = {
    editable: true,
    getSelectedText: () => {
      const ta = textareaRef.current
      if (!ta) return ""
      return ta.value.slice(ta.selectionStart ?? 0, ta.selectionEnd ?? 0)
    },
    cut: () => {
      const ta = textareaRef.current
      if (!ta) return
      // execCommand("cut") 与 Ctrl+X 同语义：写剪贴板 + 删选区 + 进浏览器撤销栈（可 Ctrl+Z）。
      // setRangeText 是程序化修改，不进撤销栈，只能作 execCommand 失败时的兜底。
      if (!document.execCommand("cut")) {
        const s = ta.selectionStart ?? 0
        const e = ta.selectionEnd ?? 0
        void navigator.clipboard.writeText(ta.value.slice(s, e))
        ta.setRangeText("", s, e, "end")
        onChange(ta.value)
      }
    },
    paste: (text) => {
      const ta = textareaRef.current
      if (!ta) return
      // execCommand("insertText") 进撤销栈（可 Ctrl+Z）；readText 拿到的纯文本按原样插入
      if (!document.execCommand("insertText", false, text)) {
        const s = ta.selectionStart ?? ta.value.length
        const e = ta.selectionEnd ?? ta.value.length
        ta.setRangeText(text, s, e, "end")
        onChange(ta.value)
      }
    },
    selectAll: () => textareaRef.current?.select(),
    onAi: onAiText,
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
        <TextContextMenu ctx={visualCtx} className="flex min-h-0 flex-1">
          <NativeScrollArea className="min-h-0 flex-1">
            <EditorContent editor={editor} className="h-full w-full overflow-auto" />
          </NativeScrollArea>
          <SelectionToolbar editor={editor} />
        </TextContextMenu>
      ) : (
        <TextContextMenu ctx={sourceCtx} className="flex min-h-0 flex-1">
          <NativeScrollArea className="min-h-0 flex-1">
            <textarea
              onContextMenu={(e) => {
                // NativeScrollArea 会覆盖子元素的 ref prop（cloneElement 注入 scrollRef），
                // 拿不到普通 ref——改由本事件同步捕获真实 DOM 引用（右键先于菜单求值）
                textareaRef.current = e.currentTarget
              }}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onPaste={handleSourcePaste}
              spellCheck={false}
              className={cn(
                "h-full w-full overflow-auto rounded-lg border bg-background px-3 py-2 font-mono text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                minHeight,
                className,
              )}
            />
          </NativeScrollArea>
        </TextContextMenu>
      )}
    </div>
  )
}
