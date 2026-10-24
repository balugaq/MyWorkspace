"use client"

import { getI18n } from "@/lib/i18n"
import { useEffect, useState } from "react"
import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { fetchBilibiliCover, getCachedBilibiliCover, parseBilibiliUrl } from "@/lib/bilibili"

/**
 * B 站视频预览卡节点（块级 atom，与 GitHub 卡同风格）。渲染：文字在上、封面在下（TODO 35：不内嵌播放器 iframe）。
 * 序列化输出裸链接，由 upgradeLinkCards 在加载/粘贴时再升级回卡片。
 */
function BilibiliCardView({ node }: NodeViewProps) {
  const url = (node.attrs.url as string | null | undefined) ?? ""
  const parsed = parseBilibiliUrl(url)
  const bv = parsed?.bv ?? null
  const [cover, setCover] = useState<string | null>(() => (bv ? (getCachedBilibiliCover(bv) ?? null) : null))

  // 封面缓存/拉取在 lib/bilibili 模块级实现：命中即用，卸载中止且不污染缓存
  useEffect(() => {
    if (!bv) return
    let alive = true
    const ctrl = new AbortController()
    // 延迟一拍：effect 体内同步 setState 会触发 react-hooks/set-state-in-effect
    const t = window.setTimeout(() => {
      const cached = getCachedBilibiliCover(bv)
      if (cached !== undefined) {
        if (alive) setCover(cached)
        return
      }
      void fetchBilibiliCover(bv, ctrl.signal).then((c) => {
        if (alive) setCover(c)
      })
    }, 0)
    return () => {
      alive = false
      ctrl.abort()
      window.clearTimeout(t)
    }
  }, [bv])

  return (
    <NodeViewWrapper className="my-2">
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="block overflow-hidden rounded-lg border bg-background transition-colors hover:bg-muted/40"
      >
        {/* TODO 21：与 GitHub 卡统一顺序 */}
        <div className="space-y-1.5 p-3">
          <p className="text-sm font-medium leading-snug">{getI18n().t("rt.biliTitle")}</p>
          <p className="truncate text-xs text-muted-foreground">{url} ↗</p>
        </div>
        {bv ? (
          cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- B 站外链封面，静态导出无法走 next/image 优化
            <img
              src={cover}
              alt="B 站视频封面"
              referrerPolicy="no-referrer"
              loading="lazy"
              className="h-44 w-full bg-muted object-cover"
            />
          ) : (
            <div className="relative flex h-44 w-full items-center justify-center bg-gradient-to-br from-muted to-muted/40">
              <span className="flex size-12 items-center justify-center rounded-full bg-background/80 text-xl shadow-sm">
                ▶
              </span>
              <span className="absolute bottom-2 right-3 text-xs text-muted-foreground">bilibili</span>
            </div>
          )
        ) : (
          <div className="flex h-32 w-full items-center justify-center bg-muted text-4xl">📺</div>
        )}
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
