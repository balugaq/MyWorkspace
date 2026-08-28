/**
 * 旧图片协议 {{img:<id>}} 的兼容归一化。
 *
 * 新协议把图片改为标准 markdown 图片 `![alt](imgref:<id>)`（详见 stored-image.tsx）。
 * 旧存档里仍可能存在 `{{img:<id>}}` 文本，加载进编辑器前先转成新形式，
 * 做到「读取时兼容、零批量迁移」——正文仍是 markdown 字符串，不动 store 历史数据。
 */
export function normalizeLegacyImg(md: string): string {
  if (!md) return md
  return md.replace(/\{\{img:([^}]+)\}\}/g, (_m, id) => `![图片](imgref:${String(id).trim()})`)
}

/** 判断 src 是否为 IndexedDB 内文图协议（imgref:<id>） */
export const IMGREF_PREFIX = "imgref:"

export function isImgref(src?: string | null): src is string {
  return !!src && src.startsWith(IMGREF_PREFIX)
}

/** 从 imgref:<id> 取出图片 id */
export function imgrefId(src: string): string {
  return src.slice(IMGREF_PREFIX.length)
}
