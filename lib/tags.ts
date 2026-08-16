import type { Category } from "./types"

/**
 * 汇总整个工作台所有已创建的标签（跨小说/通用分类章节 与 思维图节点共用）。
 * 返回去重后的标签名数组。
 */
export function collectAllTags(categories: Category[]): string[] {
  const set = new Set<string>()
  for (const cat of categories) {
    if (cat.chapters) {
      for (const ch of cat.chapters) {
        for (const t of ch.tags ?? []) if (t.trim()) set.add(t.trim())
      }
    }
    if (cat.relation) {
      for (const n of cat.relation.nodes) {
        for (const t of n.tags ?? []) if (t.trim()) set.add(t.trim())
      }
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "zh-CN"))
}
