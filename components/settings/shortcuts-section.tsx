"use client"

// 设置-快捷键分区：全局快捷键录制与重置

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { RefreshCw, Keyboard } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useWorkspace } from "@/lib/store"
import { SHORTCUT_META, type ShortcutBinding } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Section } from "./shared"

function ShortcutRow({
  meta,
  binding,
  onSave,
}: {
  meta: (typeof SHORTCUT_META)[number]
  binding: ShortcutBinding
  onSave: (b: ShortcutBinding) => void
}) {
  const { t } = useTranslation()
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      // 只记 [ctrl/cmd]+单字符，Shift/Alt 不纳入组合
      const key = e.key.toLowerCase()
      if (key.length === 1 && key >= "a" && key <= "z") {
        onSave({ modifier: e.ctrlKey || e.metaKey, key })
        setRecording(false)
      } else if (e.key === "Escape") {
        setRecording(false)
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [recording, onSave])

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t(meta.label)}</p>
        <p className="truncate text-xs text-muted-foreground">{t(meta.description)}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {recording ? (
          <span className="rounded-md border border-primary bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
            {t("settings.pressKeys")}
          </span>
        ) : (
          <kbd className="rounded-md border bg-background px-2 py-1 text-xs font-semibold uppercase">
            {binding.modifier ? "Ctrl+" : ""}
            {binding.key}
          </kbd>
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => setRecording((v) => !v)}
        >
          {recording ? "取消" : "修改"}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          title="重置为默认"
          onClick={() => onSave({ ...meta.defaults })}
        >
          <RefreshCw className="size-3.5" />
          <span className="sr-only">{t("common.reset")}</span>
        </Button>
      </div>
    </div>
  )
}

export function ShortcutsSection() {
  const { t } = useTranslation()
  const settings = useWorkspace((s) => s.settings)
  const setShortcut = useWorkspace((s) => s.setShortcut)

  return (
    <Section title={t("settings.sections.shortcuts")}>
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <Keyboard className="size-3.5 text-muted-foreground" />
          <Label className="text-xs font-medium text-muted-foreground">{t("settings.shortcuts")}</Label>
        </div>
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
          {SHORTCUT_META.map((meta) => (
            <ShortcutRow
              key={meta.action}
              meta={meta}
              binding={settings.shortcuts[meta.action]}
              onSave={(b) => {
                setShortcut(meta.action, b)
                toast.success(t("settings.shortcutUpdated", { label: t(meta.label) }))
              }}
            />
          ))}
        </div>
      </section>
    </Section>
  )
}
