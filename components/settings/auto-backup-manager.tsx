"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { History, RotateCcw, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import {
  listAutoBackups,
  saveAutoBackup,
  deleteAutoBackup,
  restoreAutoBackup,
  AUTO_BACKUP_KEEP,
  type AutoBackupEntry,
} from "@/lib/auto-backup"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
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

export function AutoBackupManager() {
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