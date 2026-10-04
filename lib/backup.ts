import { zipSync, unzipSync } from "fflate"
import { useWorkspace } from "./store"
import {
  importImages,
  importImageBlobs,
  blobToDataURL,
  listImages,
} from "./image-store"
import { exportVault, importVault } from "./vault-store"
import { collectReferencedImageIds } from "./image-refs"
import type { BackupSectionId, BackupSections } from "./types"

/**
 * 备份 / 恢复（ZIP，读写均由 fflate 完成）。
 *
 * 导出（`exportBackupZip`）：
 *   workplace-backup-YYYY-MM-DD.zip
 *   ├── manifest.json      # 元信息（app / version / exportedAt / sections）
 *   ├── workspace.json     # store 快照（按所选分区携带；settings 始终携带，等同 localStorage 持久化数据）
 *   ├── vault.json         # 保险库加密数据（仅勾选 vault 分区时打包；salt/iv/ciphertext 的 base64，主密码无关，可直接搬运）
 *   └── images/<id>.<ext>  # 全部用户图片（含暂存区；已是压缩格式，level 0 直存）
 *
 * 分区（TODO 41）：随笔 / 日历 / AI 对话 / 贡献账本 / 通知 / GitHub 队列 / 联系人 / 密码保险库；
 * 联系人与密码保险库为敏感分区，默认不导出（联系人自 TODO 48 持久化起可导出）。
 * 自定义节日（TODO 48）随「日历数据」分区携带。
 * 导入：`parseBackupFile` 识别 ZIP / 旧版纯 JSON；ZIP 经 `importBackupZip`
 * 按「替换 / 合并」两种模式恢复——两种模式都只处理备份携带的分区，未携带的分区保留当前数据。
 */

const APP_KEY = "my-omni-workspace"

/** 分区元信息（TODO 41）：设置页导出弹窗按此渲染勾选项 */
export const BACKUP_SECTION_META: {
  id: BackupSectionId
  label: string
  description: string
  /** 敏感分区：默认不勾选（联系人 / 密码保险库） */
  sensitive: boolean
  /** 联系人数据尚未持久化（TODO 48），导出入口暂不可用 */
  available: boolean
}[] = [
  { id: "notes", label: "随笔数据", description: "全部分类、章节与思维图节点", sensitive: false, available: true },
  { id: "calendar", label: "日历数据", description: "按日期聚合的笔记 / 待办 / 事件", sensitive: false, available: true },
  { id: "ai", label: "AI 对话数据", description: "全部会话与消息上下文", sensitive: false, available: true },
  { id: "contributions", label: "贡献记录", description: "Profile 热力图与活动记录账本", sensitive: false, available: true },
  { id: "notifications", label: "通知数据", description: "通知中心条目、扫描日志与水位", sensitive: false, available: true },
  { id: "githubQueue", label: "GitHub 队列数据", description: "Issue / PR 看板队列卡片", sensitive: false, available: true },
  { id: "contacts", label: "联系人数据", description: "通讯录（含界面新建与 yml 导入的条目）", sensitive: true, available: true },
  { id: "vault", label: "密码保险库", description: "加密 blob（AES-256-GCM），恢复需主密码", sensitive: true, available: true },
]

/** 导出分区默认勾选：敏感分区（联系人 / 保险库）默认不携带 */
export const DEFAULT_EXPORT_SECTIONS: BackupSections = Object.fromEntries(
  BACKUP_SECTION_META.filter((m) => m.available).map((m) => [m.id, !m.sensitive]),
) as BackupSections

function mimeToExt(kind: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/bmp": "bmp",
    "image/avif": "avif",
  }
  return map[kind.toLowerCase()] ?? "png"
}

function extToMime(ext: string): string {
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    avif: "image/avif",
  }
  return map[ext.toLowerCase()] ?? "image/png"
}

/** 字节 → BlobPart：复制到独立 ArrayBuffer（规避 TS5.7+ Uint8Array 泛型与 BlobPart 不兼容） */
function asBlobPart(bytes: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(ab).set(bytes)
  return ab
}

/** 导出为 ZIP（含所选分区数据与全部用户图片）；sections 缺省 = 除敏感分区外全部分区 */
export async function exportBackupZip(sections?: BackupSections): Promise<Blob> {
  const s = useWorkspace.getState()
  const workspaceJson = s.exportData(sections)
  const wanted: BackupSectionId[] = sections
    ? BACKUP_SECTION_META.filter((m) => sections[m.id] === true).map((m) => m.id)
    : BACKUP_SECTION_META.filter((m) => m.available && !m.sensitive).map((m) => m.id)
  const enc = new TextEncoder()
  const manifest = {
    app: APP_KEY,
    // v5：分区导出（TODO 41）—— workspace.json 按所选分区携带数据，vault.json 仅勾选保险库分区时打包
    version: 5,
    exportedAt: new Date().toISOString(),
    sections: wanted,
  }
  // JSON 走默认 deflate（压缩率高）；图片本身已是压缩格式，用 level 0 直存避免无谓 CPU
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    "manifest.json": enc.encode(JSON.stringify(manifest, null, 2)),
    "workspace.json": enc.encode(workspaceJson ?? "{}"),
  }
  const all = await listImages(false)
  for (const img of all) {
    const bytes = new Uint8Array(await img.blob.arrayBuffer())
    files[`images/${img.id}.${mimeToExt(img.kind)}`] = [bytes, { level: 0 }]
  }
  // 保险库：仅勾选 vault 分区时打包加密数据（base64）；不存在则跳过
  if (sections?.vault === true) {
    const vault = await exportVault()
    if (vault) {
      files["vault.json"] = new TextEncoder().encode(JSON.stringify(vault, null, 2))
    }
  }
  const zip = zipSync(files)
  return new Blob([asBlobPart(zip)], { type: "application/zip" })
}

export type ParsedBackup =
  | { kind: "zip"; files: Record<string, Uint8Array> }
  | { kind: "json"; json: string }

/** 读取备份文件，识别是 ZIP 还是旧版纯 JSON */
export async function parseBackupFile(file: File): Promise<ParsedBackup> {
  const buf = new Uint8Array(await file.arrayBuffer())
  // ZIP 魔数：PK\x03\x04（本地头）/ PK\x05\x06（仅 EOCD 的空 zip）/ PK\x07\x08（分卷）
  const isZipFile =
    buf.length > 4 &&
    buf[0] === 0x50 &&
    buf[1] === 0x4b &&
    (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07)
  if (isZipFile) return { kind: "zip", files: unzipSync(buf) }
  return { kind: "json", json: new TextDecoder().decode(buf) }
}

export type ImportMode = "replace" | "merge"

/** 从已解包的 ZIP 文件映射导入；mode 决定「替换」还是「合并」 */
export async function importBackupZip(
  files: Record<string, Uint8Array>,
  mode: ImportMode,
): Promise<{ ok: boolean; images: number; reason?: string }> {
  const wsFile = files["workspace.json"]
  if (!wsFile) return { ok: false, images: 0, reason: "缺少 workspace.json" }
  const json = new TextDecoder().decode(wsFile)
  const s = useWorkspace.getState()
  const applied = mode === "replace" ? s.importData(json) : s.mergeData(json)
  if (!applied) return { ok: false, images: 0, reason: "数据解析失败" }

  // 图片：从 images/ 下提取，按 Blob 写回（幂等）
  const map: Record<string, Blob> = {}
  for (const path of Object.keys(files)) {
    if (!path.startsWith("images/")) continue
    const base = path.slice("images/".length)
    const dot = base.lastIndexOf(".")
    if (dot <= 0) continue
    const id = base.slice(0, dot)
    const ext = base.slice(dot + 1)
    map[id] = new Blob([asBlobPart(files[path])], { type: extToMime(ext) })
  }
  const images = await importImageBlobs(map)

  // 保险库：仅在「替换」模式下整体恢复加密 blob（合并模式下加密数据无法无密码合并，保持现有库不变）
  if (mode === "replace" && files["vault.json"]) {
    try {
      const vault = JSON.parse(new TextDecoder().decode(files["vault.json"])) as Parameters<
        typeof importVault
      >[0]
      await importVault(vault)
    } catch {
      // 保险库恢复失败不应阻断其余数据导入；此处静默忽略，仅日志记录
      console.warn("vault.json 解析或写入失败，已跳过保险库恢复")
    }
  }

  return { ok: true, images }
}

/** 旧版纯 JSON 备份兼容导入（仅替换模式） */
export async function importBackup(json: string): Promise<{ ok: boolean; images: number }> {
  const data = JSON.parse(json)
  if (!data || !Array.isArray(data.categories) || typeof data.calendar !== "object") {
    return { ok: false, images: 0 }
  }
  const ok = useWorkspace.getState().importData(JSON.stringify(data))
  if (!ok) return { ok: false, images: 0 }
  const images = await importImages(data.images ?? {})
  return { ok: true, images }
}

/** 供设置「缓存查看」用：返回全部图片及引用情况 */
export async function getImageInventory() {
  const s = useWorkspace.getState()
  const refs = collectReferencedImageIds(s.categories, Object.values(s.relationFamilies), s.calendar)
  const all = await listImages(false)
  return {
    all,
    referenced: refs,
  }
}

export { blobToDataURL }
