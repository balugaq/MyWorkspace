"use client"

import Image from "@tiptap/extension-image"
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { StoredImg, MarkdownImg } from "@/components/rich-text"
import { isImgref, imgrefId } from "./normalize"

/**
 * 自研图片节点，派生自 TipTap 标准 image 扩展。src 两种来源：imgref:<id> → IndexedDB 内文图（StoredImg，
 * 对原 {{img:<id>}} 协议的重构）；普通 http(s)/data URL → 远程/内联图（MarkdownImg）。
 * 序列化天然产出 ![alt](imgref:<id>)，与现有备份/引用扫描/搜索链路兼容。
 */
function StoredImageView({ node }: NodeViewProps) {
  const src = (node.attrs.src as string | null | undefined) ?? ""
  if (isImgref(src)) {
    return (
      <NodeViewWrapper className="my-1 block">
        <StoredImg imgId={imgrefId(src)} fullSize />
      </NodeViewWrapper>
    )
  }
  return (
    <NodeViewWrapper className="my-1 block">
      <MarkdownImg url={src} fullSize />
    </NodeViewWrapper>
  )
}

export const StoredImage = Image.extend({
  name: "image",
  draggable: true,
  addNodeView() {
    return ReactNodeViewRenderer(StoredImageView)
  },
})
