// 内链标记（TODO 28）：跨视图跳转的文本标记协议，格式 [[mw:conv:{会话id}|标题]] / [[mw:node:{族id}:{节点id}|标题]]；只读渲染由 richtext/upgrade.ts 升级为可点击，编辑态保持原样不激活。
// 保持纯函数（无 DOM / store 依赖），供 node:test 直接测试。

/** 标记正则：id 段允许 [\w-]，多段用冒号分隔；标题不允许 ] 与换行 */
export const MW_LINK_RE = /\[\[mw:(conv|node):([\w-]+(?::[\w-]+)*)\|([^\]\n]+)\]\]/g

export interface MwLinkParts {
  type: "conv" | "node"
  /** conv: [会话id]；node: [族id, 节点id] */
  ids: string[]
  title: string
  /** 完整标记原文（升级成 mark 时原样携带，点击时再解析跳转） */
  raw: string
}

/** 类型与 id 段数不符（conv 1 段 / node 2 段）或段为空返回 null。 */
export function parseInternalLink(
  type: string,
  idsRaw: string,
  title: string,
  raw: string,
): MwLinkParts | null {
  const ids = idsRaw.split(":")
  if (type === "conv") {
    if (ids.length !== 1 || !ids[0] || !title) return null
    return { type: "conv", ids, title, raw }
  }
  if (type === "node") {
    if (ids.length !== 2 || !ids[0] || !ids[1] || !title) return null
    return { type: "node", ids, title, raw }
  }
  return null
}
