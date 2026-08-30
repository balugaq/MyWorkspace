"use client"

import { useEffect, useState } from "react"
import { FileJson, RotateCcw, Save } from "lucide-react"
import { toast } from "sonner"
import { useWorkspace } from "@/lib/store"
import { useEscapeClose } from "@/hooks/use-escape-close"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

/**
 * 配置文件源文本编辑器：直接查看/编辑持久化配置 JSON（categories / calendar / settings）。
 * 载入时用 exportData() 生成，保存时校验 JSON 后经 importData() 整体替换。
 * 注：calendarScripts 已随日历标记脚本弃用停用，不再出现在配置 JSON 中。
 */
export function ConfigEditorDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const exportData = useWorkspace((s) => s.exportData)
  const importData = useWorkspace((s) => s.importData)
  const [text, setText] = useState("")

  // ESC 关闭弹窗（与其它弹窗行为一致）
  useEscapeClose(open, () => onOpenChange(false))

  // 打开时载入当前配置
  useEffect(() => {
    if (open) {
      setText(exportData() ?? "{}")
    }
  }, [open, exportData])

  function reload() {
    setText(exportData() ?? "{}")
    toast.success("已重新载入当前配置")
  }

  function save() {
    try {
      JSON.parse(text) // 先校验
    } catch {
      toast.error("JSON 格式错误，无法保存")
      return
    }
    const ok = importData(text)
    if (ok) {
      toast.success("配置已保存并应用")
      onOpenChange(false)
    } else {
      toast.error("配置内容不合法（需含 categories/calendar）")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>配置文件（源文本）</DialogTitle>
          <DialogDescription>
            直接编辑持久化配置 JSON（分类 / 日历 / 系统设置 / 日历脚本）。谨慎修改，格式错误会拒绝保存。
          </DialogDescription>
        </DialogHeader>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="native-scroll h-72 w-full resize-y overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />

        <div className="flex justify-between gap-2">
          <Button variant="outline" className="gap-2" onClick={reload}>
            <RotateCcw className="size-4" />
            重新载入
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button className="gap-2" onClick={save}>
              <Save className="size-4" />
              保存
            </Button>
          </div>
        </div>

        <p className="flex items-start gap-1 text-xs text-muted-foreground">
          <FileJson className="mt-0.5 size-3 shrink-0" />
          修改后应用会即时生效；不包含浏览器 localStorage 之外的数据。
        </p>
      </DialogContent>
    </Dialog>
  )
}
