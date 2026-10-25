"use client"

// 设置-账户分区：头像 / 昵称 / 地区 / 生日 / 版本信息（数据备份与清空见 ./data-section）

import { Image as ImageIcon, User } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useWorkspace } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Section, useAvatarUpload } from "./shared"
import { DataSectionContent } from "./data-section"
import pkg from "../../package.json"

export function AccountSection() {
  const { t } = useTranslation()
  const settings = useWorkspace((s) => s.settings)
  const updateSettings = useWorkspace((s) => s.updateSettings)
  const { inputRef, handleAvatarFile } = useAvatarUpload()

  return (
    <Section title={t("settings.sections.account")}>
      <section className="flex flex-col gap-2">
        <Label className="text-xs font-medium text-muted-foreground">{t("settings.loginInfo")}</Label>
        <div className="flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground ring-1 ring-border">
            {settings.aiUserAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.aiUserAvatar}
                alt="用户头像"
                className="size-full object-cover"
              />
            ) : (
              <User className="size-5" />
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => inputRef.current?.click()}
            >
              <ImageIcon className="size-3.5" />
              {settings.aiUserAvatar ? t("settings.changeAvatar") : t("settings.uploadAvatar")}
            </Button>
            {settings.aiUserAvatar && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground"
                onClick={() => updateSettings({ aiUserAvatar: "" })}
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
            onChange={(e) => void handleAvatarFile(e, "user")}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="account-name" className="text-xs font-medium text-muted-foreground">{t("settings.accountName")}</Label>
          <Input
            id="account-name"
            value={settings.userName}
            placeholder={t("profile.unnamed")}
            onChange={(e) => updateSettings({ userName: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            {t("settings.accountNameDesc")}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="account-location" className="text-xs font-medium text-muted-foreground">{t("settings.location")}</Label>
          <Input
            id="account-location"
            value={settings.location}
            placeholder="中国"
            onChange={(e) => updateSettings({ location: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            {t("settings.locationDesc")}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("settings.loginInfoDesc")}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <Label className="text-xs font-medium text-muted-foreground">{t("contacts.birthday")}</Label>
        <Input
          type="date"
          value={settings.birthday}
          onChange={(e) => updateSettings({ birthday: e.target.value })}
          className="max-w-48"
        />
        <p className="text-xs text-muted-foreground">
          {t("settings.birthdayDesc")}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <Label className="text-xs font-medium text-muted-foreground">{t("settings.versionInfo")}</Label>
        <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">My Workspace</span>
          <span className="text-xs text-muted-foreground">v{pkg.version}</span>
        </div>
      </section>

      <DataSectionContent />
    </Section>
  )
}
