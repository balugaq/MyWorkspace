import type { MindEdge, MindNode } from "./types"

/**
 * 判断一个节点是否为「完全新的节点」：仅含 title，其它显示内容均为空，且没有子节点。
 * 满足时删除该节点无需二次确认。
 *
 * @param node  待判断的节点
 * @param edges 该分类下的全部连线（用于判断节点是否有子节点）
 */
export function isPristineNode(node: MindNode, edges: MindEdge[]): boolean {
  const hasChildNodes =
    edges.some((e) => e.source === node.id) || (node.sub?.length ?? 0) > 0
  return (
    !hasChildNodes &&
    (node.content ?? "") === "" &&
    (node.cause ?? "") === "" &&
    (node.leadTo ?? "") === "" &&
    (node.result ?? "") === "" &&
    (node.tags?.length ?? 0) === 0 &&
    node.solution == null &&
    !node.dueDate &&
    !node.longTerm &&
    !node.done &&
    !node.hidden
  )
}
