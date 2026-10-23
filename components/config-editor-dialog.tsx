"use client"

import { useEffect, useState } from "react"
import { FileJson, RotateCcw, Save } from "lucide-react"
import { useTranslation } from "react-i18next"
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
import { NativeScrollArea } from "@/components/ui/native-scroll-area"

/**
 * 配置文件源文本编辑器：直接查看/编辑持久化配置 JSON（categories / calendar / settings）。
 * 载入时用 exportData() 生成，保存时校验 JSON 后经 importData() 整体替换。
 */
export function ConfigEditorDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { t } = useTranslation()
  const exportData = useWorkspace((s) => s.exportData)
  const importData = useWorkspace((s) => s.importData)
  const [text, setText] = useState("")

  useEscapeClose(open, () => onOpenChange(false))

  useEffect(() => {
    if (open) {
      setText(exportData() ?? "{}")
    }
  }, [open, exportData])

  function reload() {
    setText(exportData() ?? "{}")
    toast.success(t("cfg.reloaded"))
  }

  function save() {
    try {
      JSON.parse(text)
    } catch {
      toast.error(t("cfg.errJson"))
      return
    }
    const ok = importData(text)
    if (ok) {
      toast.success(t("cfg.saved"))
      onOpenChange(false)
    } else {
      toast.error(t("cfg.errInvalid"))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("cfg.title")}</DialogTitle>
          <DialogDescription>
            {t("cfg.desc")}
          </DialogDescription>
        </DialogHeader>

        <NativeScrollArea>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            className="h-72 w-full resize-y overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </NativeScrollArea>

        <div className="flex justify-between gap-2">
          <Button variant="outline" className="gap-2" onClick={reload}>
            <RotateCcw className="size-4" />
            {t("cfg.reload")}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button className="gap-2" onClick={save}>
              <Save className="size-4" />
              {t("common.save")}
            </Button>
          </div>
        </div>

        <p className="flex items-start gap-1 text-xs text-muted-foreground">
          <FileJson className="mt-0.5 size-3 shrink-0" />
          {t("cfg.note")}
        </p>
      </DialogContent>
    </Dialog>
  )
}
