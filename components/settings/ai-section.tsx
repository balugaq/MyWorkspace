"use client"

// 设置-AI 分区：模型管理 / 技能开关 / 联网密钥 / 人设 / AI 头像 / 强制同步

import { useState } from "react"
import { Sparkles, Wrench, Bot, Image as ImageIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useWorkspace } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ModelManagerDialog } from "@/components/ai-models-dialog"
import { PersonaManagerDialog } from "@/components/ai-personas-dialog"
import { SkillsToggleDialog } from "@/components/ai-skills-dialog"
import { Section, useAvatarUpload } from "./shared"

export function AiSection() {
  const { t } = useTranslation()
  const settings = useWorkspace((s) => s.settings)
  const updateSettings = useWorkspace((s) => s.updateSettings)
  const { inputRef, handleAvatarFile } = useAvatarUpload()
  const [modelsOpen, setModelsOpen] = useState(false)
  const [personasOpen, setPersonasOpen] = useState(false)
  const [skillsOpen, setSkillsOpen] = useState(false)

  const activeModelEntry =
    settings.aiModels.find((m) => m.id === settings.aiActiveModelId) ?? settings.aiModels[0]
  const modelLabel = activeModelEntry?.label ?? t("settings.unconfigured")

  return (
    <Section title={t("settings.sections.ai")}>
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2">
          <div className="min-w-0">
            <Label className="text-xs font-medium">{t("settings.aiModelLabel")}</Label>
            <p className="truncate text-xs text-muted-foreground">
              {settings.aiModels.length === 0
                ? t("settings.aiNotConfigured")
                : t("settings.aiConfigured", { n: settings.aiModels.length, model: modelLabel })}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setModelsOpen(true)}
          >
            <Sparkles className="size-4" />
            {t("models.title")}
          </Button>
        </div>

        <Button
          type="button"
          variant="outline"
          className="gap-1.5"
          onClick={() => setSkillsOpen(true)}
        >
          <Wrench className="size-4" />
          {t("aiChat.skillsToggle")}
        </Button>

        <div className="flex flex-col gap-1">
          <Label className="text-xs font-medium">{t("settings.webSearchKey")}</Label>
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={settings.baiduAiSearchApiKey}
            placeholder={t("settings.webSearchKeyPlaceholder")}
            onChange={(e) => updateSettings({ baiduAiSearchApiKey: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            {t("settings.webSearchKeyDesc")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("settings.plaintextWarn")}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2">
          <div className="min-w-0">
            <Label className="text-xs font-medium">{t("personas.title")}</Label>
            <p className="truncate text-xs text-muted-foreground">
              {settings.aiActivePersonaId
                ? t("settings.personaCurrent", { name: settings.aiPersonas.find((p) => p.id === settings.aiActivePersonaId)?.name ?? "—" })
                : t("settings.personaUnused")}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setPersonasOpen(true)}
          >
            <Sparkles className="size-4" />
            {t("personas.title")}
          </Button>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary ring-1 ring-border">
            {settings.aiAssistantAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.aiAssistantAvatar}
                alt="AI 头像"
                className="size-full object-cover"
              />
            ) : (
              <Bot className="size-5" />
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{t("settings.aiAvatar")}</span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => inputRef.current?.click()}
              >
                <ImageIcon className="size-3.5" />
                {settings.aiAssistantAvatar ? t("settings.change") : t("settings.upload")}
              </Button>
              {settings.aiAssistantAvatar && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-muted-foreground"
                  onClick={() => updateSettings({ aiAssistantAvatar: "" })}
                >
                  {t("settings.clear")}
                </Button>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleAvatarFile(e, "ai")}
            />
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
          <div className="min-w-0">
            <Label className="text-xs font-medium">{t("settings.aiForceSync")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("settings.aiForceSyncDesc")}
            </p>
          </div>
          <Switch
            checked={settings.aiForceSync}
            onCheckedChange={(v) => updateSettings({ aiForceSync: v })}
          />
        </div>
      </section>

      <ModelManagerDialog open={modelsOpen} onOpenChange={setModelsOpen} />
      <PersonaManagerDialog open={personasOpen} onOpenChange={setPersonasOpen} />
      <SkillsToggleDialog open={skillsOpen} onOpenChange={setSkillsOpen} />
    </Section>
  )
}
