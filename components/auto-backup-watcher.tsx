"use client"

// 自动备份全局挂载件（TODO 60）：
// 1. 关机备份——页面隐藏（visibilitychange → hidden）与关闭（beforeunload）时各试一次，
//    lib 内按「当天（dayStartOffset 翻篇口径）已备份」去重，双保险覆盖不同退出路径。
// 2. 数据量异常提醒——启动稳定后比较当前快照与最新备份的数据量，相差超 50% 弹窗提醒。

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

/** 字符数 → 人类可读大小（快照 JSON 长度 ≈ UTF-16 下的一半字节数，仅作量级提示） */
function fmtSize(n: number): string {
  if (n < 1024) return `${n}`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} K`
  return `${(n / 1024 / 1024).toFixed(2)} M`
}

export function AutoBackupWatcher() {
  const [loss, setLoss] = useState<DataLossCheck | null>(null)

  // 关机备份监听（两条路径都挂，lib 内当天去重，重复触发无副作用）
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

  // 启动数据量检查：延迟等 persist hydrate 与首屏渲染稳定；每次启动最多提醒一次
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
          <AlertDialogTitle>数据量与备份差异较大</AlertDialogTitle>
          <AlertDialogDescription>
            当前数据量（{fmtSize(loss?.currentSize ?? 0)} 字符）与最近一次自动备份
            （{fmtSize(loss?.backupSize ?? 0)} 字符，{loss ? new Date(loss.backupAt).toLocaleString() : ""}）
            相差 {(loss ? Math.round(loss.ratio * 100) : 0)}%。可能有数据丢失或误导入，
            请到 设置 → 账户与同步 → 自动备份 核对备份列表，必要时恢复备份。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction>知道了</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
