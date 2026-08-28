"use client"

import type { Editor } from "@tiptap/react"
import type { JSONContent } from "@tiptap/core"

const GH_RE = /https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(?:issues|pull)\/\d+/i
const BILI_RE =
  /https?:\/\/(?:www\.|m\.)?bilibili\.com\/video\/(BV[0-9A-Za-z]+)(?:[\/?#].*)?|https?:\/\/b23\.tv\/[A-Za-z0-9]+/i

type Replacer = { re: RegExp; type: "githubCard" | "bilibiliCard" }

const REPLACERS: Replacer[] = [
  { re: GH_RE, type: "githubCard" },
  { re: BILI_RE, type: "bilibiliCard" },
]

/**
 * 把正文里「裸的 GitHub Issue/PR 或 B 站视频链接文本」升级为对应预览卡节点。
 *
 * 因为预览卡在 markdown 里序列化为裸 URL 文本（见 github-card.tsx / bilibili-card.tsx），
 * 重新加载/粘贴含链接的内容时需要这一步才能再次呈现预览卡。
 * 文本节点被替换成卡片后不再含裸 URL，因此不会死循环；加 guard 上限防意外。
 *
 * 替换内容使用 JSONContent 数组（而非 ProseMirror Node 实例）传给 insertContentAt，
 * 因为 TipTap 内部对数组走 Fragment.fromJSON 路径，Node 实例会被错误序列化。
 *
 * 注：本环境下 prosemirror 的 Node 类型被推断为 never（@tiptap/pm 类型解析问题），
 * 因此 descendants 回调形参与 found 在此处桥接为 any（仅此一处），原始 text/size 直接以基础字段捕获。
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
