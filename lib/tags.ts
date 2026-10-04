import type { Category, RelationFamily } from "./types"

/**
 * 汇总整个工作台所有已创建的标签（跨小说/通用分类章节 与 思维图节点共用）。
 * 返回去重后的标签名数组。
 */
export function collectAllTags(categories: Category[], families: RelationFamily[]): string[] {
  const set = new Set<string>()
  for (const cat of categories) {
    if (cat.chapters) {
      for (const ch of cat.chapters) {
        for (const t of ch.tags ?? []) if (t.trim()) set.add(t.trim())
      }
    }
  }
  // 思维图节点标签（TODO 54 起存于关系族）
  for (const fam of families) {
    for (const n of fam.nodes) {
      for (const t of n.tags ?? []) if (t.trim()) set.add(t.trim())
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "zh-CN"))
}

/**
 * 在 collectAllTags 基础上，并入全局标签库 knownTags（如联系人 roles 导入），
 * 返回去重并排序后的完整标签集合。供 TagPicker 作为可搜索标签库使用。
 */
export function collectAllTagsWithKnown(
  categories: Category[],
  families: RelationFamily[],
  knownTags: string[],
): string[] {
  const set = new Set<string>([
    ...collectAllTags(categories, families),
    ...knownTags.map((t) => t.trim()).filter(Boolean),
  ])
  return [...set].sort((a, b) => a.localeCompare(b, "zh-CN"))
}
