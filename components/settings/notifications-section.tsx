"use client"

// 设置-通知分区：GitHub token / 通知渠道 / QQ 中转 / 扫描仓库管理

import { useState } from "react"
import { Trash2, ChevronRight, Check } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { useWorkspace } from "@/lib/store"
import { parseRepoInput } from "@/lib/github-queue"
import { NOTIFICATION_CHANNELS } from "@/lib/notifications/channels"
import {
  DEFAULT_NOTIFICATION_SCAN_TYPES,
  DEFAULT_QQ_RELAY_URL,
  type NotificationScanTypes,
} from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Section } from "./shared"

const REPO_RE = /^[\w.-]+\/[\w.-]+$/

const SCAN_TYPE_META: { key: keyof NotificationScanTypes; label: string }[] = [
  { key: "commits", label: "settings.scanType.commits" },
  { key: "issues", label: "Issue" },
  { key: "prs", label: "PR" },
  { key: "releases", label: "settings.scanType.releases" },
]

export function NotificationsSection() {
  const { t } = useTranslation()
  const settings = useWorkspace((s) => s.settings)
  const updateSettings = useWorkspace((s) => s.updateSettings)
  const [repoInput, setRepoInput] = useState("")
  const [repoError, setRepoError] = useState("")

  function addNotificationRepo() {
    const v = repoInput.trim()
    if (!v) return
    // 支持完整 GitHub 链接（github.com/owner/repo，可带 .git / issues / pulls 后缀），统一解析成 owner/repo
    const repo = parseRepoInput(v)
    if (!repo || !REPO_RE.test(repo)) {
      setRepoError(t("settings.errRepoFormat"))
      return
    }
    if (settings.notificationRepos.some((r) => r.repo === repo)) {
      setRepoError(t("settings.repoInList"))
      return
    }
    setRepoError("")
    setRepoInput("")
    updateSettings({
      notificationRepos: [
        ...settings.notificationRepos,
        {
          repo,
          scanTypes: { ...DEFAULT_NOTIFICATION_SCAN_TYPES },
          commitMonitorOnly: false,
          // 扫描起点 = 添加时刻：只扫这之后的内容，不做历史回扫
          scanSince: Date.now(),
        },
      ],
    })
  }

  return (
    <Section title={t("settings.sections.notifications")}>
      <section className="flex flex-col gap-2">
        <Label className="text-xs font-medium text-muted-foreground">{t("settings.githubTokenLabel")}</Label>
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={settings.githubToken}
          placeholder={t("settings.githubTokenPlaceholder")}
          onChange={(e) => updateSettings({ githubToken: e.target.value })}
          className="w-full rounded-lg border bg-background px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <p className="text-xs text-muted-foreground">
          {t("settings.githubTokenDesc")}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <Label className="text-xs font-medium text-muted-foreground">{t("settings.notifyChannels")}</Label>
        <div className="flex flex-col gap-1.5">
          {NOTIFICATION_CHANNELS.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm transition-colors hover:bg-muted/70"
            >
              <input
                type="checkbox"
                className="mt-0.5 accent-primary"
                checked={settings.notificationChannels[c.id as keyof typeof settings.notificationChannels]}
                onChange={(e) =>
                  updateSettings({
                    notificationChannels: {
                      ...settings.notificationChannels,
                      [c.id]: e.target.checked,
                    },
                  })
                }
              />
              <span className="flex flex-col gap-0.5">
                <span>{t(c.nameKey)}</span>
                <span className="text-xs text-muted-foreground">{t(c.descKey)}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs font-medium text-muted-foreground">{t("settings.qqRelayUrl")}</Label>
          <Input
            value={settings.qqRelayUrl}
            placeholder={DEFAULT_QQ_RELAY_URL}
            spellCheck={false}
            className="font-mono"
            onChange={(e) => updateSettings({ qqRelayUrl: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            {t("settings.qqRelayDesc")}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("settings.notifyChannelsDesc")}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <Label className="text-xs font-medium text-muted-foreground">{t("settings.scanRepos")}</Label>
        {/* TODO 49：扫描间隔自适应开关（默认开）——按监听功能数量自动放慢扫描 */}
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 accent-primary"
            checked={settings.scanAdaptive}
            onChange={(e) => updateSettings({ scanAdaptive: e.target.checked })}
          />
          <span className="flex flex-col gap-0.5">
            <span>{t("settings.adaptiveScan")}</span>
            <span className="text-xs text-muted-foreground">
              {t("settings.adaptiveScanDesc")}
            </span>
          </span>
        </label>
        <div className="flex gap-2">
          <Input
            value={repoInput}
            placeholder={t("settings.repoPlaceholder")}
            spellCheck={false}
            className="font-mono"
            onChange={(e) => {
              setRepoInput(e.target.value)
              if (repoError) setRepoError("")
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) addNotificationRepo()
            }}
          />
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={addNotificationRepo}>
            {t("common.add")}
          </Button>
        </div>
        {repoError && <p className="text-xs text-destructive">{repoError}</p>}
        {settings.notificationRepos.length > 0 && (
          <div className="flex flex-col gap-1 rounded-lg border bg-muted/40 p-2">
            {settings.notificationRepos.map((r) => (
              <div
                key={r.repo}
                className="flex items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-muted/70"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-xs" title={r.repo}>
                  {r.repo}
                </span>
                {/* 新增仓库默认：提交关，其余开 */}
                <div className="flex shrink-0 items-center gap-2">
                  {/* 「仅监听 commit」下拉：commit 照扫并计贡献，但不产生通知/弹窗 */}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <button
                          type="button"
                          aria-label={t("settings.commitListenAria", { repo: r.repo })}
                          title={
                            r.commitMonitorOnly
                              ? t("settings.listenOnlyOn")
                              : t("settings.commitListenMode")
                          }
                          className={cn(
                            "flex size-5 items-center justify-center rounded transition-colors hover:bg-muted",
                            r.commitMonitorOnly
                              ? "text-primary"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        />
                      }
                    >
                      <ChevronRight className="size-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-32">
                      <DropdownMenuItem
                        onClick={() =>
                          updateSettings({
                            notificationRepos: settings.notificationRepos.map((cfg) =>
                              cfg.repo === r.repo
                                ? { ...cfg, commitMonitorOnly: !cfg.commitMonitorOnly }
                                : cfg
                            ),
                          })
                        }
                      >
                        {r.commitMonitorOnly ? <Check className="text-primary" /> : <span className="size-4" aria-hidden />}
                        {t("settings.listenOnly")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {SCAN_TYPE_META.map((st) => (
                    <label
                      key={st.key}
                      className="flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <input
                        type="checkbox"
                        className="accent-primary"
                        checked={r.scanTypes[st.key]}
                        onChange={(e) =>
                          updateSettings({
                            notificationRepos: settings.notificationRepos.map((cfg) =>
                              cfg.repo === r.repo
                                ? {
                                    ...cfg,
                                    scanTypes: { ...cfg.scanTypes, [st.key]: e.target.checked },
                                    // 关→开时重置扫描起点 = 当前时刻，只扫之后的内容
                                    scanSince:
                                      e.target.checked && !cfg.scanTypes[st.key]
                                        ? Date.now()
                                        : cfg.scanSince,
                                  }
                                : cfg
                            ),
                          })
                        }
                      />
                      {t(st.label)}
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  aria-label={t("settings.removeRepo", { repo: r.repo })}
                  className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  onClick={() =>
                    updateSettings({
                      notificationRepos: settings.notificationRepos.filter((x) => x.repo !== r.repo),
                    })
                  }
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {t("settings.scanReposDesc")}
        </p>
      </section>
    </Section>
  )
}
