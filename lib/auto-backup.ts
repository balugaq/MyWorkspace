// 自动备份（TODO 60）：每天关机（页面隐藏/关闭）时自动保存 1 份全量 store 快照，保留最近 5 份；
// 启动时比较当前数据量与最新备份数据量，相差超过 50% 时提示可能存在数据丢失。
//
// 存储：IndexedDB（与 image-store 同套路）。备份数据量可能远超 localStorage 5MB 限额，故不落 localStorage。
// 备份内容：exportData 全分区（除保险库——加密数据独立存储，与 IndexedDB 同生共死，快照里无恢复价值）。
// 「一天」口径：沿用 settings.dayStartOffset（默认 04:00 翻篇，与贡献账本/签到一致）。
// 恢复：设置 → 账户与同步 → 自动备份，替换模式导入（图片不随快照携带，正文 imgref 引用的图片仍在图片库中）。

import { useWorkspace } from "./store"
import { parseDayStartOffset, todayKey } from "./contributions"
import type { BackupSections } from "./types"

const DB_NAME = "workspace-autobackup"
const STORE = "backups"
const DB_VERSION = 1

/** 保留最近 5 条备份（主人 TODO 60 口径） */
export const AUTO_BACKUP_KEEP = 5

/** 当前数据量与备份数据量相差超过 50% 时弹窗提醒（主人 TODO 60 口径） */
export const AUTO_BACKUP_DIFF_RATIO = 0.5

/** 自动备份携带的分区：除保险库外全部（联系人等敏感数据同样备份——备份不出本机） */
const AUTO_BACKUP_SECTIONS: BackupSections = {
  notes: true,
  calendar: true,
  ai: true,
  contributions: true,
  notifications: true,
  githubQueue: true,
  contacts: true,
  vault: false,
}

export interface AutoBackupEntry {
  /** 备份时的「天」键（dayStartOffset 翻篇口径），同一天重复关机只保留一份 */
  dayKey: string
  /** 备份时间（epoch ms） */
  at: number
  /** 快照 JSON 字符长度（数据量比较口径） */
  size: number
  json: string
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "dayKey" })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** 生成当前快照；失败返回 null（如 exportData 异常） */
function snapshot(): { json: string; size: number } | null {
  const json = useWorkspace.getState().exportData(AUTO_BACKUP_SECTIONS)
  if (!json) return null
  return { json, size: json.length }
}

/** 列出全部自动备份，按备份时间倒序（最新在前） */
export async function listAutoBackups(): Promise<AutoBackupEntry[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll()
    req.onsuccess = () => {
      const list = (req.result as AutoBackupEntry[]).sort((a, b) => b.at - a.at)
      resolve(list)
    }
    req.onerror = () => reject(req.error)
  })
}

/**
 * 写一份备份（同一天已有备份且非 force 时跳过；写完滚动删除超出保留数的旧份）。
 * 返回是否实际写入了新备份。
 */
export async function saveAutoBackup(force = false): Promise<boolean> {
  const s = useWorkspace.getState()
  const dayKey = todayKey(parseDayStartOffset(s.settings.dayStartOffset))
  const snap = snapshot()
  if (!snap) return false
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite")
    const store = tx.objectStore(STORE)
    if (force) {
      store.put({ dayKey, at: Date.now(), size: snap.size, json: snap.json } satisfies AutoBackupEntry)
    } else {
      // 非 force（关机时机）：当天已有备份则跳过（put 语义按 dayKey 覆盖，get 先探）
      const getReq = store.get(dayKey)
      getReq.onsuccess = () => {
        if (!getReq.result) {
          store.put({ dayKey, at: Date.now(), size: snap.size, json: snap.json } satisfies AutoBackupEntry)
        }
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  // 滚动保留最近 N 条
  const list = await listAutoBackups()
  const stale = list.slice(AUTO_BACKUP_KEEP)
  if (stale.length > 0) {
    const del = db
      .transaction(STORE, "readwrite")
      .objectStore(STORE)
    for (const entry of stale) del.delete(entry.dayKey)
    await new Promise<void>((resolve, reject) => {
      del.transaction.oncomplete = () => resolve()
      del.transaction.onerror = () => reject(del.transaction.error)
    })
  }
  return true
}

/** 关机时机入口：页面隐藏/关闭时调用；任何异常静默吞掉（关机路径不允许抛错打断） */
export function maybeAutoBackupOnShutdown(): void {
  saveAutoBackup(false).catch(() => {})
}

/** 删除指定备份 */
export async function deleteAutoBackup(dayKey: string): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite")
    tx.objectStore(STORE).delete(dayKey)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** 恢复指定备份（替换模式导入快照） */
export async function restoreAutoBackup(json: string): Promise<boolean> {
  return useWorkspace.getState().importData(json)
}

export interface DataLossCheck {
  /** 相差比例（0.5 = 50%），基于备份大小 */
  ratio: number
  /** 当前数据量（字符数） */
  currentSize: number
  /** 备份数据量（字符数） */
  backupSize: number
  /** 备份时间 */
  backupAt: number
}

/**
 * 数据量差检查：取最新备份与当前快照比较，相差（以备份大小为基数）超过阈值时返回检查结果，否则 null。
 * 双向比较——数据量骤减（可能丢数据）与骤增（可能误导入）都值得提醒。
 */
export async function checkDataLoss(): Promise<DataLossCheck | null> {
  const list = await listAutoBackups()
  const latest = list[0]
  if (!latest) return null
  const cur = snapshot()
  if (!cur || latest.size <= 0) return null
  const ratio = Math.abs(cur.size - latest.size) / latest.size
  if (ratio <= AUTO_BACKUP_DIFF_RATIO) return null
  return { ratio, currentSize: cur.size, backupSize: latest.size, backupAt: latest.at }
}
