"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { parseBilibiliUrl, bilibiliEmbedSrc } from "@/lib/bilibili"

/**
 * B 站视频预览卡节点（与 GitHub 卡同风格的链接预览）。
 * - 块级 atom 节点，承载一个 B 站视频链接。
 * - 渲染：顶部官方嵌入播放器作为视觉预览（自动播放关闭），底部保留原始链接文字 + 跳转 B 站。
 * - 短链（b23.tv/xxx）无法解析出 BV 号时降级为纯链接卡片（仍保留原始链接文字）。
 * - 数据：仅前端解析，无跨域请求；元数据暂不强求。
 * - 序列化：markdown 输出为裸链接文本，由 upgradeLinkCards 在加载/粘贴时再升级回卡片。
 */
function BilibiliCardView({ node }: NodeViewProps) {
  const url = (node.attrs.url as string | null | undefined) ?? ""
  const parsed = parseBilibiliUrl(url)
  const bv = parsed?.bv ?? null

  return (
    <NodeViewWrapper className="my-2">
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="block overflow-hidden rounded-lg border bg-background transition-colors hover:bg-muted/40"
      >
        {bv ? (
          <iframe
            src={bilibiliEmbedSrc(bv)}
            className="h-44 w-full border-0 bg-black"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="B 站视频预览"
          />
        ) : (
          <div className="flex h-32 w-full items-center justify-center bg-muted text-4xl">📺</div>
        )}
        <div className="space-y-1.5 p-3">
          <p className="text-sm font-medium leading-snug">B 站视频</p>
          {/* 保留原始链接文字，可点击跳转 */}
          <p className="truncate text-xs text-muted-foreground">{url} ↗</p>
        </div>
      </a>
    </NodeViewWrapper>
  )
}

export const BilibiliCard = Node.create({
  name: "bilibiliCard",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      url: { default: "" },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-bilibili-card]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-bilibili-card": "" })]
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: { write: (s: string) => void }, node: { attrs: { url?: string | null } }) {
          state.write(node.attrs.url ?? "")
        },
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(BilibiliCardView)
  },
})
