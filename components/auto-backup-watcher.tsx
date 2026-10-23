"use client"

// 自动备份全局挂载件（TODO 60）：页面隐藏 / 关闭时各试一次关机备份（lib 内按
// dayStartOffset 翻篇口径当天去重）；启动稳定后比较快照与最新备份数据量，相差超 50% 弹窗提醒。

import { useTranslation } from "react-i18next"
import { useEffect, useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { checkDataLoss, maybeAutoBackupOnShutdown, type DataLossCheck } from "@/lib/auto-backup"

/** 字符数 → 可读大小（快照 JSON 长度 ≈ UTF-16 下的一半字节数，仅量级提示） */
function fmtSize(n: number): string {
  if (n < 1024) return `${n}`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} K`
  return `${(n / 1024 / 1024).toFixed(2)} M`
}

export function AutoBackupWatcher() {
  const { t } = useTranslation()
  const [loss, setLoss] = useState<DataLossCheck | null>(null)

  // 两条退出路径都挂；lib 内当天去重，重复触发无副作用
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") maybeAutoBackupOnShutdown()
    }
    const onUnload = () => maybeAutoBackupOnShutdown()
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("beforeunload", onUnload)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("beforeunload", onUnload)
    }
  }, [])

  // 启动数据量检查：延迟等 hydrate 与首屏稳定；每次启动最多提醒一次
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      checkDataLoss()
        .then((r) => {
          if (!cancelled && r) setLoss(r)
        })
        .catch(() => {})
    }, 3000)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  return (
    <AlertDialog open={loss !== null} onOpenChange={(v) => !v && setLoss(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("autoBk.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("autoBk.desc1", { cur: fmtSize(loss?.currentSize ?? 0) })}
            {t("autoBk.desc2", { bk: fmtSize(loss?.backupSize ?? 0), time: loss ? new Date(loss.backupAt).toLocaleString() : "" })}
            {t("autoBk.desc3", { pct: loss ? Math.round(loss.ratio * 100) : 0 })}
            {t("autoBk.desc4")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction>{t("autoBk.gotIt")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
