import type { MindEdge, MindNode } from "./types"

/** 「完全新的节点」= 仅含 title、其它显示内容全空且无子节点；满足时删除无需二次确认。 */
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
