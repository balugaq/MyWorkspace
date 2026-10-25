"use client"

// 设置-账户分区的数据管理块：备份导出/导入 / 自动备份 / yml 灌入 / 日起点 / 许可证 / 全量清空

import { useRef, useState } from "react"
import { toast } from "sonner"
import { Download, Upload, Scale, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"
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
import { loadPublicYaml, clearDataCache } from "@/lib/fetch-data"
import { loadAddressBook, withIds } from "@/lib/address-book"
import type { FestivalsFile } from "@/lib/festivals"
import type { BackupSections } from "@/lib/types"
import { normalizeDayStartOffset, firstContributionAt, formatUsageDuration } from "@/lib/contributions"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LicenseDialog } from "@/components/license-dialog"
import { AutoBackupManager } from "./auto-backup-manager"

export function DataSectionContent() {
  const { t } = useTranslation()
  const settings = useWorkspace((s) => s.settings)
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
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteStep, setDeleteStep] = useState<"confirm" | "verify">("confirm")
  const [confirmName, setConfirmName] = useState("")

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
    <>
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
    </>
  )
}
