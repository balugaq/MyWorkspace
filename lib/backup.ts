import { useWorkspace } from "./store"
import { exportImages, importImages, blobToDataURL, listImages } from "./image-store"
import { collectReferencedImageIds } from "./image-refs"

/**
 * 备份 / 恢复（含 IndexedDB 图片）。
 *
 * 由于图片存在 IndexedDB（异步），这里提供 async 的导出/导入：
 * - 导出：store 快照 + 全库被引用的图片 → 单个 JSON（图片以 dataURL 内嵌）。
 * - 导入：解析后先恢复 store（经 importData），再批量写回图片（幂等）。
 */

export async function exportBackup(): Promise<string> {
  const s = useWorkspace.getState()
  const refs = collectReferencedImageIds(s.categories, s.calendar)
  const images = await exportImages([...refs])
  return JSON.stringify(
    {
      version: 2,
      exportedAt: new Date().toISOString(),
      categories: s.categories,
      calendar: s.calendar,
      settings: s.settings,
      // calendarScripts: s.calendarScripts, // 日历标记脚本（已弃用停用）
      images,
    },
    null,
    2,
  )
}

export async function importBackup(json: string): Promise<{ ok: boolean; images: number }> {
  const data = JSON.parse(json)
  if (!data || !Array.isArray(data.categories) || typeof data.calendar !== "object") {
    return { ok: false, images: 0 }
  }
  // 先恢复 store 的 JSON 部分
  const ok = useWorkspace.getState().importData(JSON.stringify(data))
  if (!ok) return { ok: false, images: 0 }
  // 再恢复图片
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
