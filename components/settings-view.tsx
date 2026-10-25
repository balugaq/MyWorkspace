"use client"

// 设置工作区：独立 view（原 settings-dialog 弹窗整体迁移改造），经顶栏 goSettings() 进入

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { RefreshCw, Keyboard, Download, Upload, FileCog, Image as ImageIcon, Scale, User, Sparkles, Wrench, Bot, Trash2, ChevronRight, Check, Braces, History, RotateCcw, Tag as TagIcon, Plus, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"
import { useNow } from "@/hooks/use-now"
import { useWorkspace } from "@/lib/store"
import {
  exportBackupZip,
  importBackup,
  parseBackupFile,
  importBackupZip,
  BACKUP_SECTION_META,
  DEFAULT_EXPORT_SECTIONS,
  type ImportMode,
} from "@/lib/backup"
import { clearAllImages } from "@/lib/image-store"
import { clearVault } from "@/lib/vault-store"
import { parseRepoInput } from "@/lib/github-queue"
import { useTranslation, getI18n } from "react-i18next"
import { syncLocale, APP_LOCALES } from "@/lib/i18n"
import type { UILanguage } from "@/lib/types"
import {
  listAutoBackups,
  saveAutoBackup,
  deleteAutoBackup,
  restoreAutoBackup,
  AUTO_BACKUP_KEEP,
  type AutoBackupEntry,
} from "@/lib/auto-backup"
import { loadPublicYaml, clearDataCache } from "@/lib/fetch-data"
import { loadAddressBook, withIds } from "@/lib/address-book"
import type { FestivalsFile } from "@/lib/festivals"
import {
  SHORTCUT_META,
  DEFAULT_NOTIFICATION_SCAN_TYPES,
  DEFAULT_QQ_RELAY_URL,
  type ShortcutBinding,
  type DefaultView,
  type ThemePreference,
  type UIFontFamily,
  type NotificationScanTypes,
  type NotificationLogEntry,
  type BackupSections,
} from "@/lib/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { normalizeDayStartOffset, firstContributionAt, formatUsageDuration } from "@/lib/contributions"
import { collectAllTagsWithKnown, collectTagUsage } from "@/lib/tags"
import { matchTextPinyin } from "@/lib/pinyin"
import { NOTIFICATION_CHANNELS } from "@/lib/notifications/channels"
import { LicenseDialog } from "@/components/license-dialog"
import { ModelManagerDialog } from "@/components/ai-models-dialog"
import { PersonaManagerDialog } from "@/components/ai-personas-dialog"
import { SkillsToggleDialog } from "@/components/ai-skills-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import pkg from "../package.json"

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

// 用户头像压缩：限制最长边 256px，转 JPEG 控制体积（避免撑爆 localStorage）
const MAX_AVATAR = 256
function compressAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error("图片读取失败"))
      img.onload = () => {
        const scale = Math.min(1, MAX_AVATAR / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement("canvas")
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext("2d")
        if (!ctx) return reject(new Error("无法创建画布"))
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL("image/jpeg", 0.85))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

const REPO_RE = /^[\w.-]+\/[\w.-]+$/

const SCAN_TYPE_META: { key: keyof NotificationScanTypes; label: string }[] = [
  { key: "commits", label: "settings.scanType.commits" },
  { key: "issues", label: "Issue" },
  { key: "prs", label: "PR" },
  { key: "releases", label: "settings.scanType.releases" },
]

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

// TODO 67：全站标签统一管理（随笔章节 / 思维图节点 / 联系人角色 / 标签库）；重命名撞名自动合并，删除全站清理
function TagManagerBlock() {
  const { t } = useTranslation()
  const categories = useWorkspace((s) => s.categories)
  const relationFamilies = useWorkspace((s) => s.relationFamilies)
  const knownTags = useWorkspace((s) => s.knownTags)
  const contacts = useWorkspace((s) => s.contacts)
  const renameTag = useWorkspace((s) => s.renameTag)
  const deleteTag = useWorkspace((s) => s.deleteTag)
  const addKnownTags = useWorkspace((s) => s.addKnownTags)

  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState(false)
  const [createName, setCreateName] = useState("")
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState("")
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const familyList = useMemo(() => Object.values(relationFamilies), [relationFamilies])
  const usage = useMemo(
    () => collectTagUsage(categories, familyList, contacts),
    [categories, familyList, contacts],
  )
  const allTags = useMemo(
    () => collectAllTagsWithKnown(categories, familyList, knownTags),
    [categories, familyList, knownTags],
  )
  const visible = useMemo(() => {
    const q = query.trim()
    if (!q) return allTags
    return allTags.filter((t) => matchTextPinyin(t, q))
  }, [allTags, query])

  const commitCreate = () => {
    const name = createName.trim()
    setCreating(false)
    setCreateName("")
    if (!name) return
    if (allTags.some((t) => t === name)) {
      toast.error(t("settings.tagExists", { name }))
      return
    }
    addKnownTags([name])
    toast.success(t("settings.tagCreated", { name }))
  }

  const commitRename = () => {
    const from = renaming
    setRenaming(null)
    setRenameDraft("")
    if (!from) return
    const to = renameDraft.trim()
    if (!to || to === from) return
    const merged = allTags.some((t) => t === to)
    const changed = renameTag(from, to)
    if (merged) {
      toast.success(t("settings.tagMerged", { to, n: changed }))
    } else {
      toast.success(changed > 0 ? t("settings.tagRenamedWith", { to, n: changed }) : t("settings.tagRenamed", { to }))
    }
  }

  const doDelete = () => {
    const name = confirmDel
    setConfirmDel(null)
    if (!name) return
    const removed = deleteTag(name)
    toast.success(removed > 0 ? t("settings.tagDeletedWith", { name, n: removed }) : t("settings.tagDeleted", { name }))
  }

  const delCount = confirmDel ? (usage.get(confirmDel) ?? 0) : 0

  return (
    <section className="flex flex-col gap-2">
      <Label className="text-xs font-medium text-muted-foreground">{t("settings.tagManage")}</Label>
      <div className="flex items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("settings.tagSearchPlaceholder")}
          className="h-8 flex-1"
        />
        {creating ? (
          <Input
            autoFocus
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onBlur={commitCreate}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                commitCreate()
              } else if (e.key === "Escape") {
                e.preventDefault()
                setCreating(false)
                setCreateName("")
              }
            }}
            placeholder={t("settings.newTagPlaceholder")}
            className="h-8 w-36"
          />
        ) : (
          <Button
            variant="outline"
            className="h-8 shrink-0 gap-1.5"
            onClick={() => {
              setCreating(true)
              setCreateName("")
            }}
          >
            <Plus className="size-3.5" />
            {t("settings.createTag")}
          </Button>
        )}
      </div>

      {visible.length > 0 ? (
        <ul className="native-scroll flex max-h-64 flex-col gap-1 overflow-auto pr-1">
          {visible.map((tg) => (
            <li
              key={tg}
              className="group flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-xs"
            >
              {renaming === tg ? (
                <input
                  autoFocus
                  ref={renameInputRef}
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      commitRename()
                    } else if (e.key === "Escape") {
                      e.preventDefault()
                      setRenaming(null)
                      setRenameDraft("")
                    }
                  }}
                  maxLength={30}
                  className="h-6 min-w-0 flex-1 rounded border bg-background px-1.5 outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              ) : (
                <>
                  <TagIcon className="size-3 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-foreground" title={tg}>
                    {tg}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {(usage.get(tg) ?? 0) > 0 ? t("settings.tagUsage", { n: usage.get(tg) ?? 0 }) : t("settings.tagOnlyLib")}
                  </span>
                  <button
                    type="button"
                    title={t("common.rename")}
                    aria-label={t("settings.renameTagAria", { name: tg })}
                    onClick={() => {
                      setRenaming(tg)
                      setRenameDraft(tg)
                    }}
                    className="hidden size-5 shrink-0 items-center justify-center rounded hover:bg-primary/10 group-hover:flex"
                  >
                    <Pencil className="size-3 text-muted-foreground" />
                  </button>
                  <button
                    type="button"
                    title={t("common.delete")}
                    aria-label={t("settings.deleteTagAria", { name: tg })}
                    onClick={() => setConfirmDel(tg)}
                    className="hidden size-5 shrink-0 items-center justify-center rounded hover:bg-destructive/10 group-hover:flex"
                  >
                    <Trash2 className="size-3 text-destructive" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          {allTags.length === 0 ? t("settings.noTags") : t("settings.noTagMatch")}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {t("settings.tagDesc")}
      </p>

      <AlertDialog
        open={confirmDel !== null}
        onOpenChange={(v) => !v && setConfirmDel(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.deleteTagTitle", { name: confirmDel ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {delCount > 0
                ? t("settings.deleteTagDescUsed", { n: delCount })
                : t("settings.deleteTagDescUnused")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDel(null)}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="border-b pb-2 text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  )
}

// TODO 60：自动备份手动兜底与恢复入口；日常备份由 AutoBackupWatcher 在页面隐藏/关闭时自动做（当天一次）
function AutoBackupManager() {
  const { t } = useTranslation()
  const [list, setList] = useState<AutoBackupEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState<AutoBackupEntry | null>(null)

  const refresh = () => {
    listAutoBackups()
      .then(setList)
      .catch(() => setList([]))
  }
  useEffect(() => {
    refresh()
  }, [])

  const doBackup = async () => {
    setBusy(true)
    try {
      await saveAutoBackup(true)
      toast.success(t("settings.backupSaved"))
      refresh()
    } catch {
      toast.error(t("settings.backupFail"))
    } finally {
      setBusy(false)
    }
  }

  const doRestore = async (entry: AutoBackupEntry) => {
    setBusy(true)
    try {
      const ok = await restoreAutoBackup(entry.json)
      if (ok) {
        toast.success(t("settings.restored", { time: new Date(entry.at).toLocaleString() }))
      } else {
        toast.error(t("settings.restoreParseFail"))
      }
    } catch {
      toast.error(t("settings.restoreFail"))
    } finally {
      setBusy(false)
      setConfirmRestore(null)
    }
  }

  const doDelete = async (entry: AutoBackupEntry) => {
    try {
      await deleteAutoBackup(entry.dayKey)
    } catch {
      // 删除失败静默
    }
    refresh()
  }

  return (
    <section className="flex flex-col gap-2">
      <Label className="text-xs font-medium text-muted-foreground">{t("settings.autoBackup", { n: AUTO_BACKUP_KEEP })}</Label>
      <div className="flex items-center gap-2">
        <Button variant="outline" className="gap-2" onClick={() => void doBackup()} disabled={busy}>
          <History className="size-4" />
          {t("settings.backupNow")}
        </Button>
        <span className="text-xs text-muted-foreground">{t("settings.backupCount", { n: list.length })}</span>
      </div>
      {list.length > 0 && (
        <ul className="flex flex-col gap-1">
          {list.map((entry) => (
            <li
              key={entry.dayKey}
              className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-xs"
            >
              <span className="min-w-0 flex-1 truncate text-foreground">
                {new Date(entry.at).toLocaleString()}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {entry.size < 1024
                  ? `${entry.size} 字符`
                  : entry.size < 1024 * 1024
                    ? `${(entry.size / 1024).toFixed(1)} K 字符`
                    : `${(entry.size / 1024 / 1024).toFixed(2)} M 字符`}
              </span>
              <button
                type="button"
                title={t("settings.restoreThisTitle")}
                aria-label={t("settings.restoreThis")}
                onClick={() => setConfirmRestore(entry)}
                className="flex size-6 shrink-0 items-center justify-center rounded hover:bg-primary/10"
              >
                <RotateCcw className="size-3.5 text-muted-foreground" />
              </button>
              <button
                type="button"
                title={t("settings.deleteBackup")}
                aria-label={t("settings.deleteBackup")}
                onClick={() => void doDelete(entry)}
                className="flex size-6 shrink-0 items-center justify-center rounded hover:bg-destructive/10"
              >
                <Trash2 className="size-3.5 text-destructive" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        {t("settings.autoBackupDesc", { n: AUTO_BACKUP_KEEP })}
      </p>

      <AlertDialog
        open={confirmRestore !== null}
        onOpenChange={(v) => !v && setConfirmRestore(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.restoreTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.restoreConfirmDesc", { time: confirmRestore ? new Date(confirmRestore.at).toLocaleString() : "", size: confirmRestore?.size ?? 0 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmRestore(null)}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmRestore) void doRestore(confirmRestore)
              }}
            >
              {t("settings.restore")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

export function SettingsView() {
  const settings = useWorkspace((s) => s.settings)
  const { t } = useTranslation()
  const notificationLogs = useWorkspace((s) => s.notificationLogs)
  const contributions = useWorkspace((s) => s.contributions)
  // 软件使用时长：复用贡献账本派生（lib/contributions.ts），不另存字段（与 Profile 页同源）
  const usageFirstAt = firstContributionAt(contributions)
  // 时间走 useNow（外部时钟源）：渲染期直接调 Date.now() 会触发 react-hooks/purity
  const now = useNow()
  const usageText =
    usageFirstAt == null
      ? t("settings.noUsage")
      : formatUsageDuration(now - usageFirstAt, now)
  const updateSettings = useWorkspace((s) => s.updateSettings)
  const setShortcut = useWorkspace((s) => s.setShortcut)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const aiAvatarInputRef = useRef<HTMLInputElement>(null)
  const setConfigEditorOpen = useWorkspace((s) => s.setConfigEditorOpen)
  const setImagesOpen = useWorkspace((s) => s.setImagesOpen)
  const fileRef = useRef<HTMLInputElement>(null)
  // 待导入的已解包 ZIP 文件映射（选中 zip 后、弹出替换/合并选择前暂存）
  const [pendingFiles, setPendingFiles] = useState<Record<string, Uint8Array> | null>(null)
  // TODO 48：联系人 / 自定义节日已 store 持久化，yml 经此按钮手动灌入
  const setContacts = useWorkspace((s) => s.setContacts)
  const setCustomFestivals = useWorkspace((s) => s.setCustomFestivals)
  const [importingYaml, setImportingYaml] = useState(false)
  // TODO 41：导出分区选择，敏感分区默认不勾选
  const [exportOpen, setExportOpen] = useState(false)
  const [exportSel, setExportSel] = useState<BackupSections>(DEFAULT_EXPORT_SECTIONS)
  const [licenseOpen, setLicenseOpen] = useState(false)
  const [modelsOpen, setModelsOpen] = useState(false)
  const [personasOpen, setPersonasOpen] = useState(false)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteStep, setDeleteStep] = useState<"confirm" | "verify">("confirm")
  const [confirmName, setConfirmName] = useState("")
  const [repoInput, setRepoInput] = useState("")
  const [repoError, setRepoError] = useState("")
  const [activeSectionId, setActiveSectionId] = useState<(typeof SETTINGS_SECTIONS)[number]["id"]>(
    SETTINGS_SECTIONS[0].id,
  )

  // 头像选择（用户 / AI 两处共用）：压缩后写 settings；返回 Promise，
  // 调用处包 void 以满足 no-misused-promises（TODO 84）
  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>, target: "user" | "ai") {
    const f = e.target.files?.[0]
    e.target.value = ""
    if (!f) return
    try {
      const dataUrl = await compressAvatar(f)
      updateSettings(target === "user" ? { aiUserAvatar: dataUrl } : { aiAssistantAvatar: dataUrl })
    } catch {
      toast.error(t("settings.avatarFail"))
    }
  }

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

  const activeModelEntry =
    settings.aiModels.find((m) => m.id === settings.aiActiveModelId) ?? settings.aiModels[0]
  const modelLabel = activeModelEntry?.label ?? t("settings.unconfigured")

  async function onExport() {
    // 一个分区都没勾 → 不产出空备份
    if (!BACKUP_SECTION_META.some((m) => exportSel[m.id] === true)) {
      toast.error(t("settings.errNoSection"))
      return
    }
    try {
      const blob = await exportBackupZip(exportSel)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      // 文件名用用户本地时区的日期：避免 toISOString()（UTC）在 GMT+8 等时区下差一天
      const now = new Date()
      const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
      a.download = `workplace-backup-${stamp}.zip`
      a.click()
      URL.revokeObjectURL(url)
      setExportOpen(false)
      toast.success(t("settings.exportedZip"))
    } catch {
      toast.error(t("settings.exportFail"))
    }
  }

  async function onImportFile(file: File | undefined) {
    if (!file) return
    try {
      const parsed = await parseBackupFile(file)
      if (parsed.kind === "zip") {
        if (!parsed.files["workspace.json"]) {
          toast.error(t("settings.errNotBackup"))
          return
        }
        setPendingFiles(parsed.files)
      } else {
        // 旧版纯 JSON 备份：按替换方式导入
        const res = await importBackup(parsed.json)
        if (res.ok) {
          toast.success(t("settings.importedZip", { n: res.images }))
        } else {
          toast.error(t("settings.importFormatFail"))
        }
      }
    } catch {
      toast.error(t("settings.importReadFail"))
    }
  }

  async function doImport(mode: ImportMode) {
    if (!pendingFiles) return
    const files = pendingFiles
    setPendingFiles(null)
    try {
      const res = await importBackupZip(files, mode)
      if (res.ok) {
        toast.success(t(mode === "replace" ? "settings.importedReplace" : "settings.importedMerge", { n: res.images }))
      } else {
        toast.error(t("settings.importFailWith", { reason: res.reason ?? t("settings.parseFail") }))
      }
    } catch {
      toast.error(t("settings.importFormatFail"))
    }
  }

  // TODO 48：yml 手动导入；先清 fetch 缓存（否则拿到旧数据），两文件独立处理、任一失败不影响另一个
  async function importYamlData() {
    setImportingYaml(true)
    try {
      clearDataCache()
      const [book, fests] = await Promise.all([
        loadAddressBook(),
        loadPublicYaml<FestivalsFile>("custom_festivals.yml"),
      ])
      const parts: string[] = []
      if (book) {
        const people = withIds(book.people ?? [])
        setContacts(people)
        parts.push(t("settings.yamlPeople", { n: people.length }))
      } else {
        toast.error(t("settings.yamlPeopleFail"))
      }
      if (fests) {
        const defs = fests.festivals ?? []
        setCustomFestivals(defs)
        parts.push(t("settings.yamlFestivals", { n: defs.length }))
      } else {
        toast.error(t("settings.yamlFestivalsFail"))
      }
      if (parts.length > 0) toast.success(t("settings.yamlImported", { parts: parts.join("、") }))
    } finally {
      setImportingYaml(false)
    }
  }

  async function wipeAllData() {
    try {
      await clearVault()
    } catch {
      /* 保险库可能本就不存在，忽略 */
    }
    try {
      await clearAllImages()
    } catch {
      /* 图片库可能本就不存在，忽略 */
    }
    try {
      useWorkspace.persist.clearStorage()
    } catch {
      /* 忽略清理失败 */
    }
    toast.success(t("settings.dataDeleted"))
    // 重载后 store 以默认状态重新初始化；页面卸载前待刷新的持久化定时器不会触发
    window.location.reload()
  }

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
            {activeSectionId === "general" && (
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
            )}

            {activeSectionId === "shortcuts" && (
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
            )}

            {activeSectionId === "account" && (
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
                    onClick={() => avatarInputRef.current?.click()}
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
                  ref={avatarInputRef}
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

            <section className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">{t("settings.dataBackup")}</Label>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-2" onClick={() => setExportOpen(true)}>
                  <Download className="size-4" />
                  {t("settings.exportBackup")}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="size-4" />
                  {t("settings.importBackup")}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".zip,application/zip,application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    void onImportFile(e.target.files?.[0])
                    e.target.value = ""
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t("settings.backupDesc")}
              </p>
            </section>

            <AutoBackupManager />

            <section className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">
                {t("settings.yamlImport")}
              </Label>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => void importYamlData()}
                disabled={importingYaml}
              >
                <Upload className="size-4" />
                {importingYaml ? t("vocab.importing") : t("settings.yamlImportBtn")}
              </Button>
              <p className="text-xs text-muted-foreground">
                {t("settings.yamlMigrated")}
                {t("settings.yamlMigratedDesc")}
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <Label htmlFor="day-start-offset" className="text-xs font-medium text-muted-foreground">
                {t("settings.dayStartOffset")}
              </Label>
              <Input
                id="day-start-offset"
                type="time"
                step="60"
                value={settings.dayStartOffset}
                onChange={(e) => {
                  const v = e.target.value
                  // 编辑过程中 type=time 可能回空串：不写入（避免把默认值强行顶回去），只在拿到合法值时落库
                  if (v) updateSettings({ dayStartOffset: normalizeDayStartOffset(v) })
                }}
                className="w-40"
              />
              <p className="text-xs text-muted-foreground">
                {t("settings.dayStartOffsetDesc", { time: settings.dayStartOffset })}
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">{t("licenses.title")}</Label>
              <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setLicenseOpen(true)}>
                <Scale className="size-4" />
                {t("settings.viewLicenses")}
              </Button>
            </section>

            <section className="flex flex-col gap-2 border-t border-destructive/30 pt-4">
              <Label className="text-xs font-medium text-destructive">{t("settings.deleteData")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("settings.deleteDataDesc")}
              </p>
              <Button
                type="button"
                variant="destructive"
                className="w-full justify-start gap-2"
                onClick={() => {
                  setDeleteStep("confirm")
                  setConfirmName("")
                  setDeleteOpen(true)
                }}
              >
                <Trash2 className="size-4" />
                {t("settings.deleteAllData")}
              </Button>
            </section>
            </Section>
            )}

            {activeSectionId === "ai" && (
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
                      onClick={() => aiAvatarInputRef.current?.click()}
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
                    ref={aiAvatarInputRef}
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
            </Section>
            )}

            {activeSectionId === "advanced" && (
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
            )}

            {activeSectionId === "notifications" && (
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
            )}

            {activeSectionId === "news" && (
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
            )}

          <ModelManagerDialog open={modelsOpen} onOpenChange={setModelsOpen} />
          <PersonaManagerDialog open={personasOpen} onOpenChange={setPersonasOpen} />
          <SkillsToggleDialog open={skillsOpen} onOpenChange={setSkillsOpen} />
          <LicenseDialog open={licenseOpen} onOpenChange={setLicenseOpen} />

          <Dialog open={exportOpen} onOpenChange={setExportOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t("settings.exportTitle")}</DialogTitle>
                <DialogDescription>
                  {t("settings.exportSectionDesc")}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-1.5">
                {BACKUP_SECTION_META.map((m) => (
                  <label
                    key={m.id}
                    className={cn(
                      "flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm transition-colors",
                      m.available ? "cursor-pointer hover:bg-muted/70" : "cursor-not-allowed opacity-50",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-primary"
                      disabled={!m.available}
                      checked={exportSel[m.id] === true}
                      onChange={(e) =>
                        setExportSel((prev) => ({ ...prev, [m.id]: e.target.checked }))
                      }
                    />
                    <span className="flex flex-col gap-0.5">
                      <span>
                        {t(m.label)}
                        {!m.available && (
                          <span className="ml-2 text-xs text-muted-foreground">{t("settings.notExportable")}</span>
                        )}
                        {m.sensitive && m.available && (
                          <span className="ml-2 text-xs text-muted-foreground">{t("settings.sensitive")}</span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">{t(m.descKey)}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => void onExport()}>
                  <Download className="size-4" />
                  {t("settings.export")}
                </Button>
                <Button variant="ghost" onClick={() => setExportOpen(false)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={!!pendingFiles} onOpenChange={(v) => { if (!v) setPendingFiles(null) }}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>{t("settings.importModeTitle")}</DialogTitle>
                <DialogDescription>
                  {t("settings.importModeDesc")}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Button onClick={() => void doImport("replace")}>{t("settings.importReplace")}</Button>
                <Button variant="outline" onClick={() => void doImport("merge")}>
                  {t("settings.importMerge")}
                </Button>
                <Button variant="ghost" onClick={() => setPendingFiles(null)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={deleteOpen}
            onOpenChange={(v) => {
              if (!v) {
                setDeleteOpen(false)
                setDeleteStep("confirm")
                setConfirmName("")
              }
            }}
          >
            <DialogContent className="sm:max-w-md">
              {deleteStep === "confirm" ? (
                <>
                  <DialogHeader>
                    <DialogTitle>{t("settings.wipeTitle")}</DialogTitle>
                    <DialogDescription>
                      {t("settings.wipeDesc")}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-3">
                    <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
                      {t("settings.wipeUsage1")}
                      <span className="font-semibold text-destructive">
                        {usageText}
                      </span>
                    </div>
                    {settings.userName.trim() ? (
                      <p className="text-xs text-muted-foreground">
                        {t("settings.wipeVerify1")}
                        <span className="font-medium text-foreground">{settings.userName}</span>
                        {t("settings.wipeVerify2")}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {t("settings.wipeNoName")}
                      </p>
                    )}
                    <Button variant="outline" className="w-full gap-2" onClick={() => void onExport()}>
                      <Download className="size-4" />
                      {t("settings.wipeExportFirst")}
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="ghost" className="flex-1" onClick={() => setDeleteOpen(false)}>
                        {t("common.cancel")}
                      </Button>
                      <Button
                        variant="destructive"
                        className="flex-1"
                        onClick={() => {
                          if (settings.userName.trim()) {
                            setDeleteStep("verify")
                          } else {
                            void wipeAllData()
                          }
                        }}
                      >
                        {t("settings.wipeContinue")}
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle>{t("settings.wipeVerifyTitle")}</DialogTitle>
                    <DialogDescription>
                      {t("settings.wipeVerify3")}{" "}
                      <span className="font-semibold text-foreground">{settings.userName}</span>{" "}
                      {t("settings.wipeVerify4")}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-3">
                    <Input
                      autoFocus
                      value={confirmName}
                      placeholder={settings.userName}
                      onChange={(e) => setConfirmName(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          confirmName.trim() === settings.userName.trim()
                        ) {
                          void wipeAllData()
                        }
                      }}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        className="flex-1"
                        onClick={() => setDeleteStep("confirm")}
                      >
                        {t("common.back")}
                      </Button>
                      <Button
                        variant="destructive"
                        className="flex-1"
                        disabled={confirmName.trim() !== settings.userName.trim()}
                        onClick={() => void wipeAllData()}
                      >
                        {t("settings.wipeConfirm")}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

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
