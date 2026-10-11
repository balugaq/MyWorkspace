"use client"

// 内链 mark（TODO 28）：[[mw:...]] 标记升级后的富文本表示。
// renderHTML 输出 <a data-mw-internal="完整标记原文">，点击跳转由 RichTextView 容器
// 的事件委托统一定位处理（此处只负责 schema 表示与样式 class）。

import { Mark } from "@tiptap/core"
import { toast } from "sonner"
import { parseInternalLink } from "@/lib/internal-links"
import { useWorkspace } from "@/lib/store"

export const InternalLinkMark = Mark.create({
  name: "internalLink",
  /** 不与相邻文本自动延展（选中内链右侧继续输入不应带上链接） */
  inclusive: false,
  addAttributes() {
    return {
      /** 完整标记原文（[[mw:...]]），点击跳转时再解析 */
      link: { default: "" },
    }
  },
  parseHTML() {
    return [{ tag: "a[data-mw-internal]" }]
  },
  renderHTML({ mark }) {
    return [
      "a",
      {
        "data-mw-internal": mark.attrs.link,
        class: "mw-internal-link",
        title: "点击跳转",
      },
      0,
    ]
  },
})

/** 内链点击跳转：conv → AI 会话；node → 所在关系族 + 补选节点。目标已删则 toast 提示。 */
export function navigateInternalLink(raw: string): void {
  const m = MW_LINK_SINGLE_RE.exec(raw)
  MW_LINK_SINGLE_RE.lastIndex = 0
  if (!m) return
  const parts = parseInternalLink(m[1], m[2], m[3], m[0])
  if (!parts) return
  const s = useWorkspace.getState()

  if (parts.type === "conv") {
    const id = parts.ids[0]
    if (!s.conversations.some((c) => c.id === id)) {
      toast.error("该 AI 会话已不存在")
      return
    }
    s.goAIChat()
    s.selectConversation(id)
    return
  }

  const [familyId, nodeId] = parts.ids
  const fam = s.relationFamilies[familyId]
  if (!fam) {
    toast.error("该思维导图节点已不存在")
    return
  }
  s.setActiveCategory(fam.categoryId)
  s.setPendingFamilyId(fam.id)
  if (fam.nodes.some((n) => n.id === nodeId)) {
    s.setActiveItem(nodeId)
  } else {
    toast.warning("目标节点已不存在，已定位到所在图")
  }
}

/** 单标记匹配（非全局，用于点击时解析完整标记原文） */
const MW_LINK_SINGLE_RE = /\[\[mw:(conv|node):([\w-]+(?::[\w-]+)*)\|([^\]\n]+)\]\]/
