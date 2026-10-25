"use client"

// 设置-高级分区：图片缓存 / 配置文件编辑 / uapi token / 通知日志导出

import { toast } from "sonner"
import { FileCog, Image as ImageIcon, Download, Braces } from "lucide-react"
import { useTranslation, getI18n } from "react-i18next"
import { useWorkspace } from "@/lib/store"
import type { NotificationLogEntry } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Section } from "./shared"

// TODO 27 配套：通知日志导出——txt 为人类可读时间线，json 为原始结构化数据
function stamp(at: number): string {
  const d = new Date(at)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function exportNotificationLogs(logs: NotificationLogEntry[], format: "txt" | "json"): void {
  if (logs.length === 0) {
    toast.info(getI18n().t("settings.logsEmpty"))
    return
  }
  const ts = stamp(Date.now()).replace(/[-: ]/g, "")
  let content: string
  let mime: string
  if (format === "json") {
    content = JSON.stringify(logs, null, 2)
    mime = "application/json;charset=utf-8"
  } else {
    content = logs
      .map((e) => {
        const kind = e.kind === "scan" ? "扫描" : "条目"
        const flag = e.kind === "item" ? (e.notified ? "已通知" : "未通知") : ""
        return `[${stamp(e.at)}] [${kind}]${flag ? ` [${flag}]` : ""} ${e.message}`
      })
      .join("\n")
    mime = "text/plain;charset=utf-8"
  }
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `notification-logs-${ts}.${format}`
  a.click()
  URL.revokeObjectURL(url)
  toast.success(getI18n().t("settings.logsExported", { n: logs.length }))
}

export function AdvancedSection() {
  const { t } = useTranslation()
  const notificationLogs = useWorkspace((s) => s.notificationLogs)
  const updateSettings = useWorkspace((s) => s.updateSettings)
  const settings = useWorkspace((s) => s.settings)
  const setConfigEditorOpen = useWorkspace((s) => s.setConfigEditorOpen)
  const setImagesOpen = useWorkspace((s) => s.setImagesOpen)

  return (
    <Section title={t("settings.sections.advanced")}>
      <section className="flex flex-col gap-2">
        <Label className="text-xs font-medium text-muted-foreground">{t("settings.imageCache")}</Label>
        <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setImagesOpen(true)}>
          <ImageIcon className="size-4" />
          {t("settings.manageImageCache")}
        </Button>
      </section>

      <section className="flex flex-col gap-2">
        <Label className="text-xs font-medium text-muted-foreground">{t("settings.configFile")}</Label>
        <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setConfigEditorOpen(true)}>
          <FileCog className="size-4" />
          {t("settings.openConfig")}
        </Button>
        <p className="text-xs text-muted-foreground">
          {t("settings.openConfigDesc")}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <Label className="text-xs font-medium text-muted-foreground">{t("settings.uapiToken")}</Label>
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={settings.uapiToken}
          placeholder={t("settings.uapiPlaceholder")}
          onChange={(e) => updateSettings({ uapiToken: e.target.value })}
          className="w-full rounded-lg border bg-background px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <p className="text-xs text-muted-foreground">
          {t("settings.uapiDesc")}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <Label className="text-xs font-medium text-muted-foreground">{t("settings.logExport")}</Label>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 justify-start gap-2"
            onClick={() => exportNotificationLogs(notificationLogs, "txt")}
          >
            <Download className="size-4" />
            {t("settings.exportTxt")}
          </Button>
          <Button
            variant="outline"
            className="flex-1 justify-start gap-2"
            onClick={() => exportNotificationLogs(notificationLogs, "json")}
          >
            <Braces className="size-4" />
            {t("settings.exportJson")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("settings.logExportDesc")}
        </p>
      </section>
    </Section>
  )
}
