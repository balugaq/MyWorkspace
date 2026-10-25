"use client"

// 设置-资讯分区：早报开关与工作流说明

import { useTranslation } from "react-i18next"
import { useWorkspace } from "@/lib/store"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Section } from "./shared"

export function NewsSection() {
  const { t } = useTranslation()
  const settings = useWorkspace((s) => s.settings)
  const updateSettings = useWorkspace((s) => s.updateSettings)

  return (
    <Section title={t("settings.sections.news")}>
      <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
        <div className="min-w-0">
          <Label className="text-xs font-medium">{t("settings.newsSwitch")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("settings.newsSwitchDesc")}
          </p>
        </div>
        <Switch
          checked={settings.newsEnabled}
          onCheckedChange={(v) => updateSettings({ newsEnabled: v })}
        />
      </div>

      <section className="flex flex-col gap-2">
        <Label className="text-xs font-medium text-muted-foreground">{t("settings.newsWorkflow")}</Label>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("settings.newsWorkflowDesc")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("settings.newsWorkflowPrereq")}
        </p>
      </section>
    </Section>
  )
}
