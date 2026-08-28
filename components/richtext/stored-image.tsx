"use client"

import Image from "@tiptap/extension-image"
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { StoredImg, MarkdownImg } from "@/components/rich-text"
import { isImgref, imgrefId } from "./normalize"

/**
 * 自研图片节点：在 TipTap 标准 `image` 扩展之上派生。
 *
 * 图片来源分两种，统一用 `src` 区分：
 *  - `imgref:<id>` → IndexedDB 内文图（经由 StoredImg 取 blob）；这是本项目对原 `{{img:<id>}}` 协议的重构形态。
 *  - 普通 http(s)/data URL → 远程/内联图（MarkdownImg）。
 *
 * 序列化：tiptap-markdown 对标准 image 节点默认产出 `![alt](src)`，
 * 因此 `imgref:<id>` 会以 `![alt](imgref:<id>)` 形式落回 markdown 字符串，与现有备份/引用扫描/搜索链路兼容。
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
