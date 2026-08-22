"use client"

import { useRef, useState } from "react"
import { ImagePlus, Eye, PencilLine } from "lucide-react"
import { addImage, imageBlobFromClipboard } from "@/lib/image-store"
import { RichText } from "@/components/rich-text"
import { cn } from "@/lib/utils"

/**
 * 支持图片粘贴与预览的富文本输入框。
 * - 编辑态：textarea，粘贴（Ctrl+V）图片时自动上传到 IndexedDB，并在光标处插入引用 token `{{img:<id>}}`。
 * - 预览态：把正文渲染成富文本（显示图片）。
 * 也可手动「插入图片」按钮选择文件。
 */
export function ImageRichInput({
  value,
  onChange,
  placeholder,
  className,
  previewClassName,
  minHeight = "min-h-24",
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  previewClassName?: string
  minHeight?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<"edit" | "preview">("edit")

  async function insertImage(blob: Blob) {
    const id = await addImage(blob, blob.type)
    const el = ref.current
    if (el) {
      const st = el.selectionStart ?? value.length
      const en = el.selectionEnd ?? value.length
      const next = value.slice(0, st) + `{{img:${id}}}` + value.slice(en)
      onChange(next)
      // 提交后光标置于 token 之后
      requestAnimationFrame(() => {
        el.focus()
        const pos = st + `{{img:${id}}}`.length
        el.setSelectionRange(pos, pos)
      })
    } else {
      onChange(value + `{{img:${id}}}`)
    }
  }

  async function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const blob = imageBlobFromClipboard(e.clipboardData)
    if (!blob) return
    e.preventDefault()
    await insertImage(blob)
  }

  async function onFile(file: File | undefined | null) {
    if (!file) return
    await insertImage(file)
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-1">
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-primary"
        >
          <ImagePlus className="size-3.5" />
          插图
        </button>
        <button
          type="button"
          onClick={() => setMode((m) => (m === "edit" ? "preview" : "edit"))}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-primary"
        >
          {mode === "edit" ? <Eye className="size-3.5" /> : <PencilLine className="size-3.5" />}
          {mode === "edit" ? "预览" : "编辑"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            onFile(e.target.files?.[0])
            e.target.value = ""
          }}
        />
      </div>

      {mode === "preview" ? (
        <div
          className={cn(
            "w-full rounded-lg border bg-background px-3 py-2 text-sm leading-relaxed outline-none",
            previewClassName,
          )}
        >
          {value.trim() ? <RichText text={value} /> : <span className="text-muted-foreground">（空白）</span>}
        </div>
      ) : (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={onPaste}
          placeholder={placeholder}
          className={cn(
            "w-full min-h-0 flex-1 resize-none overflow-auto rounded-lg border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            minHeight,
            className,
          )}
        />
      )}
    </div>
  )
}
