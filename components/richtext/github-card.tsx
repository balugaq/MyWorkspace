"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { useEffect, useState } from "react"
import { useWorkspace } from "@/lib/store"
import { fetchGithubCard, getOgImageSrc, type GithubCardData } from "@/lib/gh-card"

/**
 * GitHub 预览卡节点（QQ/Discord 式的链接预览卡）。
 * - 块级 atom 节点，承载一个 GitHub Issue/PR 链接。
 * - 渲染：左/上 OG 缩略图 + 标题 + 状态徽标 + 标签 + 「在 GitHub 打开」。
 * - 数据：fetchGithubCard 负责 REST 元数据 + OG 直链图，并缓存到 IndexedDB（见 lib/gh-card.ts）。
 * - 序列化：markdown 输出为裸 URL 文本（getMarkdown），由 upgradeGithubUrls 在加载/粘贴时再升级回卡片，
 *   保证存量与新增内容都能呈现预览。
 */
function GitHubCardView({ node }: NodeViewProps) {
  const url = (node.attrs.url as string | null | undefined) ?? ""
  const token = useWorkspace((s) => s.settings.githubToken)
  const [data, setData] = useState<GithubCardData | null>(null)
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!url) return
    let active = true
    setFailed(false)
    fetchGithubCard(url, token)
      .then((d) => {
        if (!active) return
        setData(d)
        return getOgImageSrc(d.ogImage)
      })
      .then((src) => {
        if (active && src) setImgSrc(src)
      })
      .catch(() => active && setFailed(true))
    return () => {
      active = false
    }
  }, [url, token])

  if (!url) return <NodeViewWrapper className="my-2" />
  if (failed) {
    return (
      <NodeViewWrapper className="my-2">
        <a href={url} target="_blank" rel="noreferrer noopener" className="text-primary underline underline-offset-2">
          {url}
        </a>
      </NodeViewWrapper>
    )
  }
  if (!data) {
    return (
      <NodeViewWrapper className="my-2">
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <span className="size-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
          加载 GitHub 预览…
        </div>
      </NodeViewWrapper>
    )
  }

  const stateLabel = data.state === "open" ? "进行中" : data.state === "closed" ? "已关闭" : "未知"
  const stateCls =
    data.state === "open"
      ? "bg-emerald-500/15 text-emerald-600"
      : data.state === "closed"
        ? "bg-rose-500/15 text-rose-600"
        : "bg-muted text-muted-foreground"

  return (
    <NodeViewWrapper className="my-2">
      <a
        href={data.htmlUrl || url}
        target="_blank"
        rel="noreferrer noopener"
        className="block overflow-hidden rounded-lg border bg-background transition-colors hover:bg-muted/40"
      >
        <div className="flex gap-3 p-3">
          {imgSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- OG 图来自 GitHub CDN 热链，无法走 next/image
            <img
              src={imgSrc}
              alt=""
              className="h-20 w-20 shrink-0 rounded-md border object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border bg-muted text-2xl">
              🐙
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${stateCls}`}>{stateLabel}</span>
              {data.labels.slice(0, 3).map((l) => (
                <span
                  key={l.name}
                  className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                  style={{ backgroundColor: `#${l.color}22`, color: `#${l.color}` }}
                >
                  {l.name}
                </span>
              ))}
            </div>
            <p className="mt-1 line-clamp-2 text-sm font-medium leading-snug">{data.title || url}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">在 GitHub 打开 ↗</p>
          </div>
        </div>
      </a>
    </NodeViewWrapper>
  )
}

export const GitHubCard = Node.create({
  name: "githubCard",
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
    return [{ tag: "div[data-github-card]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-github-card": "" })]
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
    return ReactNodeViewRenderer(GitHubCardView)
  },
})
