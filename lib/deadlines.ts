import type { Category, MindNode } from "./types"

/** 一组分布在某个日期上的思维导图节点截止任务 */
export interface DueEntry {
  nodeId: string
  title: string
  categoryId: string
  categoryName: string
  longTerm: boolean
}

/**
 * 汇总所有关系分类中「有截止日期且在日历生效」的 Todo 节点，
 * 返回按日期 yyyy-MM-dd 分组的映射。
 * - dueDate 为空（null/undefined）或 longTerm=true 的节点不计入日历。
 */
export function collectDueNodes(categories: Category[]): Record<string, DueEntry[]> {
  const map: Record<string, DueEntry[]> = {}
  for (const cat of categories) {
    if (cat.template !== "relation" || !cat.relation) continue
    for (const n of cat.relation.nodes) {
      if (!n.dueDate || n.longTerm) continue
      if (!map[n.dueDate]) map[n.dueDate] = []
      map[n.dueDate].push({
        nodeId: n.id,
        title: n.title || "未命名",
        categoryId: cat.id,
        categoryName: cat.name,
        longTerm: !!n.longTerm,
      })
    }
  }
  return map
}

/** 判断一个思维导图节点是否应显示在日历上 */
export function isScheduledNode(n: MindNode): boolean {
  return !!n.dueDate && !n.longTerm
}
