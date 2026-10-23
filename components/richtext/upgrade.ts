"use client"

import type { Editor } from "@tiptap/react"
import type { JSONContent } from "@tiptap/core"
import { MW_LINK_RE } from "@/lib/internal-links"

const GH_RE =
  /https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(?:issues|pull)\/\d+|https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/releases\/(?:tag\/[^/?#]+|\d+)(?=[/?#]|$)/i
const BILI_RE =
  /https?:\/\/(?:www\.|m\.)?bilibili\.com\/video\/(BV[0-9A-Za-z]+)(?:[\/?#].*)?|https?:\/\/b23\.tv\/[A-Za-z0-9]+/i

type Replacer = { re: RegExp; type: "githubCard" | "bilibiliCard" }

const REPLACERS: Replacer[] = [
  { re: GH_RE, type: "githubCard" },
  { re: BILI_RE, type: "bilibiliCard" },
]

/**
 * 把正文里裸的 GitHub Issue/PR 或 B 站视频链接文本升级为预览卡节点（卡片序列化为裸 URL，加载/粘贴时
 * 需此步重新呈现；替换后不再含裸 URL，不会死循环，guard 上限防意外）。
 * 传 insertContentAt 须用 JSONContent 数组而非 PM Node 实例（后者会被 TipTap 内部错误序列化）；
 * any 仅在此桥接：本环境下 prosemirror 的 Node 类型被推断为 never（@tiptap/pm 类型解析问题）。
 */
export function upgradeLinkCards(editor: Editor): void {
  if (!(editor.schema.nodes as Record<string, unknown>).githubCard) return
  if (!(editor.schema.nodes as Record<string, unknown>).bilibiliCard) return
  let guard = 0
  while (guard++ < 200) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let found: any = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(editor.state.doc as any).descendants((node: any, pos: number) => {
      if (found) return false
      if (node.isText) {
        const txt: string = node.textContent
        for (const r of REPLACERS) {
          const m = txt.match(r.re)
          if (m && m.index !== undefined) {
            found = {
              pos,
              text: txt,
              size: node.nodeSize,
              start: m.index,
              end: m.index + m[0].length,
              url: m[0],
              type: r.type,
            }
            break
          }
        }
      }
      return true
    })
    if (!found) break
    const { pos, text, size, start, end, url, type } = found as {
      pos: number
      text: string
      size: number
      start: number
      end: number
      url: string
      type: "githubCard" | "bilibiliCard"
    }
    const before = text.slice(0, start)
    const after = text.slice(end)
    const nodes: JSONContent[] = []
    if (before) nodes.push({ type: "text", text: before })
    nodes.push({ type, attrs: { url } })
    if (after) nodes.push({ type: "text", text: after })
    editor.chain().insertContentAt({ from: pos, to: pos + size }, nodes).run()
  }
}

/**
 * 延后到下一个 macrotask 执行 upgradeLinkCards：insertContentAt 内部走 flushSync，
 * 在 React 生命周期内同步执行会报错；加 isDestroyed 守卫，返回取消函数供 effect 清理。
 * 传 suppressRef 时升级期间置 true，阻止 onUpdate 把规范化后的 markdown 回写 onChange（保护原文空白）。
 */
export function scheduleUpgradeLinkCards(
  editor: Editor,
  opts?: { suppressRef?: { current: boolean } },
): () => void {
  const id = window.setTimeout(() => {
    if (editor.isDestroyed) return
    if (opts?.suppressRef) opts.suppressRef.current = true
    upgradeLinkCards(editor)
    if (opts?.suppressRef) opts.suppressRef.current = false
  }, 0)
  return () => window.clearTimeout(id)
}

/**
 * 把正文里的 [[mw:...]] 内链标记（TODO 28）升级为 internalLink mark（可点击跳转），只在只读渲染（RichTextView）调用——
 * 编辑态标记保持原样文本，不产生文档改写与回写。替换后不再含标记、不会死循环，guard 上限防意外；
 * 原文本节点的 marks（格式色等）在新文本上原样保留。
 */
export function upgradeInternalLinks(editor: Editor): void {
  if (!(editor.schema.marks as Record<string, unknown>).internalLink) return
  let guard = 0
  while (guard++ < 200) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let found: any = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(editor.state.doc as any).descendants((node: any, pos: number) => {
      if (found) return false
      if (node.isText) {
        MW_LINK_RE.lastIndex = 0
        const m = MW_LINK_RE.exec(node.textContent)
        if (m && m.index !== undefined) {
          found = {
            pos,
            size: node.nodeSize,
            text: node.textContent,
            start: m.index,
            end: m.index + m[0].length,
            rawLink: m[0],
            marks: node.marks as JSONContent["marks"],
          }
        }
      }
      return true
    })
    if (!found) break
    const { pos, size, text, start, end, rawLink, marks } = found as {
      pos: number
      size: number
      text: string
      start: number
      end: number
      rawLink: string
      marks: JSONContent["marks"]
    }
    const title = rawLink.slice(rawLink.indexOf("|") + 1, -2)
    const before = text.slice(0, start)
    const after = text.slice(end)
    const nodes: JSONContent[] = []
    if (before) nodes.push({ type: "text", text: before, marks })
    nodes.push({
      type: "text",
      text: title,
      marks: [...(marks ?? []), { type: "internalLink", attrs: { link: rawLink } }],
    })
    if (after) nodes.push({ type: "text", text: after, marks })
    editor.chain().insertContentAt({ from: pos, to: pos + size }, nodes).run()
  }
}
