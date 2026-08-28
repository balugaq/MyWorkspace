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

/**
 * 备份 / 恢复（ZIP，读写均由 fflate 完成）。
 *
 * 导出（`exportBackupZip`）：
 *   workplace-backup-YYYY-MM-DD.zip
 *   ├── manifest.json      # 元信息（app / version / exportedAt）
 *   ├── workspace.json     # store 快照（分类/日历/设置，等同 localStorage 持久化数据）
 *   ├── vault.json         # 保险库加密数据（salt/iv/ciphertext 的 base64，主密码无关，可直接搬运）
 *   └── images/<id>.<ext>  # 全部用户图片（含暂存区；已是压缩格式，level 0 直存）
 *
 * 导入：`parseBackupFile` 识别 ZIP / 旧版纯 JSON；ZIP 经 `importBackupZip`
 * 按「替换 / 合并」两种模式恢复数据与图片；旧版 JSON 仍走 `importBackup`（替换）。
 */

const APP_KEY = "my-omni-workspace"

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

/** 导出为 ZIP（含 store 快照与全部用户图片） */
export async function exportBackupZip(): Promise<Blob> {
  const s = useWorkspace.getState()
  const workspaceJson = s.exportData() ?? "{}"
  const enc = new TextEncoder()
  const manifest = {
    app: APP_KEY,
    version: 3,
    exportedAt: new Date().toISOString(),
  }
  // JSON 走默认 deflate（压缩率高）；图片本身已是压缩格式，用 level 0 直存避免无谓 CPU
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    "manifest.json": enc.encode(JSON.stringify(manifest, null, 2)),
    "workspace.json": enc.encode(workspaceJson),
  }
  const all = await listImages(false)
  for (const img of all) {
    const bytes = new Uint8Array(await img.blob.arrayBuffer())
    files[`images/${img.id}.${mimeToExt(img.kind)}`] = [bytes, { level: 0 }]
  }
  // 保险库：加密数据整体打包（base64）；不存在则跳过
  const vault = await exportVault()
  if (vault) {
    files["vault.json"] = new TextEncoder().encode(JSON.stringify(vault, null, 2))
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
  const refs = collectReferencedImageIds(s.categories, s.calendar)
  const all = await listImages(false)
  return {
    all,
    referenced: refs,
  }
}

export { blobToDataURL }
