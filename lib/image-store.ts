/**
 * 图片存储层（IndexedDB）。
 *
 * 用于存放「粘贴/上传」的图片二进制，正文里用引用 token `{{img:<id>}}` 指向某张图。
 * 这样正文保持纯文本，图片可独立管理（缓存查看、无引用进暂存区、导出导入打包）。
 */

const DB_NAME = "workspace-images"
const STORE = "images"
const DB_VERSION = 1

export interface StoredImage {
  id: string
  blob: Blob
  kind: string
  createdAt: number
  /** true = 已无任何文本引用，置于暂存区；仍保留记录，供用户决定删除 */
  staged: boolean
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** 新增一张图片，返回其 id */
export async function addImage(blob: Blob, kind = "image/png"): Promise<string> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2, 10)
    const rec: StoredImage = { id, blob, kind, createdAt: Date.now(), staged: false }
    const tx = db.transaction(STORE, "readwrite")
    tx.objectStore(STORE).put(rec)
    tx.oncomplete = () => resolve(id)
    tx.onerror = () => reject(tx.error)
  })
}

/** 读取一张图，返回 objectURL；不存在则返回 null（调用方负责 revokeObjectURL） */
export async function getImageURL(id: string): Promise<string | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id)
    req.onsuccess = () => {
      const rec = req.result as StoredImage | undefined
      if (!rec) {
        resolve(null)
        return
      }
      resolve(URL.createObjectURL(rec.blob))
    }
    req.onerror = () => reject(req.error)
  })
}

export async function getImageBlob(id: string): Promise<Blob | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id)
    req.onsuccess = () => {
      const rec = req.result as StoredImage | undefined
      resolve(rec?.blob ?? null)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function deleteImage(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite")
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** 列出全部图片（用于扫描引用/暂存区管理）。默认只列出未暂存的；stagedOnly 列出暂存区 */
export async function listImages(stagedOnly = false): Promise<StoredImage[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll()
    req.onsuccess = () => {
      const all = (req.result as StoredImage[]) ?? []
      resolve(stagedOnly ? all.filter((i) => i.staged) : all)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function setStaged(id: string, staged: boolean): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite")
    const store = tx.objectStore(STORE)
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      const rec = getReq.result as StoredImage | undefined
      if (rec) store.put({ ...rec, staged })
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** 导出：把指定图片 id 批量转成 base64 数据（供备份 JSON 打包） */
export async function exportImages(ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const id of ids) {
    const blob = await getImageBlob(id)
    if (!blob) continue
    out[id] = await blobToDataURL(blob)
  }
  return out
}

/** 导入：把 {id: dataURL} 批量写回 IndexedDB（跳过已存在，幂等） */
export async function importImages(map: Record<string, string>): Promise<number> {
  let count = 0
  for (const id of Object.keys(map)) {
    const existing = await getImageBlob(id)
    if (existing) continue // 已存在则跳过（幂等）
    const blob = dataURLToBlob(map[id])
    if (!blob) continue
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite")
      tx.objectStore(STORE).put({
        id,
        blob,
        kind: blob.type || "image/png",
        createdAt: Date.now(),
        staged: false,
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    count++
  }
  return count
}

export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(blob)
  })
}

export function dataURLToBlob(data: string): Blob | null {
  // 形如 data:mime;base64,.... 或 data:mime,<percent-encoded>
  const comma = data.indexOf(",")
  if (comma === -1) return null
  const header = data.slice(0, comma)
  const payload = data.slice(comma + 1)
  const m = /^data:([^;,]+)?(;base64)?$/.exec(header)
  if (!m) return null
  const mime = m[1] || "image/png"
  const base64 = !!m[2]
  let binary: string
  if (base64) {
    binary = atob(payload)
  } else {
    binary = decodeURIComponent(payload)
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/** 从 ctrl-v 的 DataTransfer 里取第一张图片 blob */
export function imageBlobFromClipboard(dt: DataTransfer): Blob | null {
  for (const item of dt.items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const f = item.getAsFile()
      if (f) return f
    }
  }
  // 兜底：直接看 dt.files
  for (const f of Array.from(dt.files)) {
    if (f.type.startsWith("image/")) return f
  }
  return null
}
