"use client"

// 设置-通用分区：主题 / 语言 / 字号字体 / 启动视图 / 生日横幅 / 极光背景 / 标签管理

import { useTranslation } from "react-i18next"
import { useWorkspace } from "@/lib/store"
import { syncLocale, APP_LOCALES } from "@/lib/i18n"
import type { DefaultView, ThemePreference, UILanguage, UIFontFamily } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Section } from "./shared"
import { TagManagerBlock } from "./tag-manager-block"

// 展示文案走 i18n 字典 settings.general.themeOptions.*，这里只保留取值
const THEMES: { value: ThemePreference }[] = [
  { value: "light" },
  { value: "dark" },
  { value: "system" },
  { value: "green" },
  { value: "purple" },
  { value: "orange" },
]

// 展示文案走 i18n 字典 settings.general.viewOptions.*
const DEFAULT_VIEWS: { value: DefaultView }[] = [
  { value: "ai-chat" },
  { value: "workspace" },
  { value: "calendar" },
  { value: "contacts" },
  { value: "vault" },
  { value: "notifications" },
  { value: "github-queue" },
  { value: "vocabulary" },
  { value: "profile" },
  { value: "settings" },
  { value: "last" },
]

// 展示文案走 i18n 字典 settings.general.fontFamilyOptions.*
const FONT_FAMILIES: { value: UIFontFamily }[] = [
  { value: "system" },
  { value: "serif" },
  { value: "mono" },
]

export function GeneralSection() {
  const { t } = useTranslation()
  const settings = useWorkspace((s) => s.settings)
  const updateSettings = useWorkspace((s) => s.updateSettings)

  return (
    <Section title={t("settings.sections.general")}>
      <section className="flex flex-col gap-2">
        <Label className="text-xs font-medium text-muted-foreground">
          {t("settings.general.theme")}
        </Label>
        <Select
          value={settings.theme}
          onValueChange={(v) => {
            if (v) updateSettings({ theme: v })
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {THEMES.find((th) => th.value === settings.theme)?.value
                ? t(`settings.general.themeOptions.${settings.theme}`)
                : t("settings.general.pickTheme")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {THEMES.map((th) => (
              <SelectItem key={th.value} value={th.value}>
                {t(`settings.general.themeOptions.${th.value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      {/* TODO 40：语言切换（zh 为源文案），字典见 lib/i18n/locales */}
      <section className="flex flex-col gap-2">
        <Label className="text-xs font-medium text-muted-foreground">
          {t("settings.general.language")}
        </Label>
        <Select
          value={settings.uiLanguage}
          onValueChange={(v) => {
            if (!v) return
            syncLocale(v)
            updateSettings({ uiLanguage: v as UILanguage })
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {APP_LOCALES.find((l) => l.value === settings.uiLanguage)?.label ?? "中文"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {APP_LOCALES.map((l) => (
              <SelectItem key={l.value} value={l.value}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {t("settings.general.languageDesc")}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-muted-foreground">
            {t("settings.general.fontSize")}
          </Label>
          <span className="text-xs text-muted-foreground">{settings.fontSize}px</span>
        </div>
        <input
          type="range"
          min={12}
          max={24}
          step={1}
          value={settings.fontSize}
          onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })}
          className="w-full accent-primary"
        />
        <p className="text-xs text-muted-foreground">{t("settings.general.fontSizeDesc")}</p>
        <div className="mt-2 flex items-center justify-between">
          <Label className="text-xs font-medium text-muted-foreground">
            {t("settings.general.fontFamily")}
          </Label>
        </div>
        <Select
          value={settings.uiFontFamily}
          onValueChange={(v) => {
            if (v) updateSettings({ uiFontFamily: v })
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {FONT_FAMILIES.find((f) => f.value === settings.uiFontFamily)?.value
                ? t(`settings.general.fontFamilyOptions.${settings.uiFontFamily}`)
                : t("settings.general.pickFontFamily")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {FONT_FAMILIES.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {t(`settings.general.fontFamilyOptions.${f.value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{t("settings.general.fontFamilyDesc")}</p>
      </section>

      <section className="flex flex-col gap-2">
        <Label className="text-xs font-medium text-muted-foreground">
          {t("settings.general.startup")}
        </Label>
        <Select
          value={settings.defaultView}
          onValueChange={(v) => {
            if (v) updateSettings({ defaultView: v })
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {DEFAULT_VIEWS.find((v) => v.value === settings.defaultView)?.value
                ? t(`settings.general.viewOptions.${settings.defaultView}`)
                : t("settings.general.pickView")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {DEFAULT_VIEWS.map((v) => (
              <SelectItem key={v.value} value={v.value}>
                {t(`settings.general.viewOptions.${v.value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{t("settings.general.startupDesc")}</p>
      </section>

      {/* TODO 61：生日横幅提前天数 */}
      <section className="flex flex-col gap-2">
        <Label htmlFor="birthday-banner-days" className="text-xs font-medium text-muted-foreground">
          {t("settings.general.birthdayBannerDays")}
        </Label>
        <Input
          id="birthday-banner-days"
          type="number"
          min={0}
          max={60}
          step={1}
          value={settings.birthdayBannerDays}
          onChange={(e) => {
            const n = Math.floor(Number(e.target.value))
            updateSettings({
              birthdayBannerDays: Number.isFinite(n) && n >= 0 ? Math.min(n, 60) : 7,
            })
          }}
          className="max-w-24"
        />
        <p className="text-xs text-muted-foreground">
          {t("settings.general.birthdayBannerDesc")}
        </p>
      </section>

      {/* TODO 75：游动极光背景开关 */}
      <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
        <div className="min-w-0">
          <Label className="text-xs font-medium">
            {t("settings.general.auroraBackground")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t("settings.general.auroraBackgroundDesc")}
          </p>
        </div>
        <Switch
          checked={settings.auroraBackground}
          onCheckedChange={(v) => updateSettings({ auroraBackground: v })}
        />
      </div>

      <TagManagerBlock />
    </Section>
  )
}
