"use client"

// 设置工作区：独立 view（原 settings-dialog 弹窗整体迁移改造），经顶栏 goSettings() 进入
// TODO 85 第二刀：分区组件拆至 components/settings/（general/shortcuts/account/ai/advanced/notifications/news），
// 本文件只保留分区导航与布局壳。

import { useState } from "react"
import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"
import { ScrollArea } from "@/components/ui/scroll-area"
import { GeneralSection } from "@/components/settings/general-section"
import { ShortcutsSection } from "@/components/settings/shortcuts-section"
import { AccountSection } from "@/components/settings/account-section"
import { AiSection } from "@/components/settings/ai-section"
import { AdvancedSection } from "@/components/settings/advanced-section"
import { NotificationsSection } from "@/components/settings/notifications-section"
import { NewsSection } from "@/components/settings/news-section"

// TODO 25 打磨：设置分类清单
const SETTINGS_SECTIONS = [
  { id: "general", labelKey: "settings.sections.general" },
  { id: "shortcuts", labelKey: "settings.sections.shortcuts" },
  { id: "account", labelKey: "settings.sections.account" },
  { id: "ai", labelKey: "settings.sections.ai" },
  { id: "advanced", labelKey: "settings.sections.advanced" },
  { id: "notifications", labelKey: "settings.sections.notifications" },
  { id: "news", labelKey: "settings.sections.news" },
] as const

export function SettingsView() {
  const { t } = useTranslation()
  const [activeSectionId, setActiveSectionId] = useState<(typeof SETTINGS_SECTIONS)[number]["id"]>(
    SETTINGS_SECTIONS[0].id,
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center px-8 py-6">
        <h1 className="text-2xl font-bold leading-tight text-foreground">{t("settings.title")}</h1>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="w-44 shrink-0 border-r px-2 py-3">
          <div className="flex flex-col gap-0.5">
            {SETTINGS_SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSectionId(s.id)}
                className={cn(
                  "rounded-md px-3 py-2 text-left text-sm transition-colors",
                  activeSectionId === s.id
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t(s.labelKey)}
              </button>
            ))}
          </div>
        </nav>

        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-8 pb-8">
            {activeSectionId === "general" && <GeneralSection />}
            {activeSectionId === "shortcuts" && <ShortcutsSection />}
            {activeSectionId === "account" && <AccountSection />}
            {activeSectionId === "ai" && <AiSection />}
            {activeSectionId === "advanced" && <AdvancedSection />}
            {activeSectionId === "notifications" && <NotificationsSection />}
            {activeSectionId === "news" && <NewsSection />}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
