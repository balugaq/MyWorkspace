"use client"

// 富文本 16 色标签扩展（TODO 32）：把 <blue>…</blue> 这类 Minecraft 风格色标签
// 解析为 ProseMirror mark（DOM 形态为 <span data-format-color="blue">），序列化时还原为标签。
//
// 解析链路：tiptap-markdown 先用 markdown-it 把 markdown 渲染成 HTML；本扩展在
// parse.setup 里注册内联规则，把 <色名> / </色名> 拆成自定义 token 并渲染为带
// data-format-color 的 span，TipTap DOMParser 再经 parseHTML 把 span 归为 formatColor mark。
// Markdown.configure 的 html:false 只关掉「源文本里的原始 HTML」，不影响本扩展自己
// 渲染出的 span；代码块/行内代码规则先于本规则执行，代码里的标签保持字面量。
// 序列化链路：storage.markdown.serialize 把 mark 输出回 <色名>…</色名>，getMarkdown 往返无损。

import { Mark, mergeAttributes } from "@tiptap/core"
import type MarkdownIt from "markdown-it"
import type { MarkdownSerializerState } from "prosemirror-markdown"
import type { Mark as ProseMirrorMark } from "prosemirror-model"
import { FORMAT_COLOR_MAP, FORMAT_COLOR_TAG_AT } from "@/lib/format-colors"

// tiptap-markdown 每次 parse 都会对同一 markdown-it 实例重跑各扩展的 parse.setup，
// 而 ruler.before 不去重——用 WeakSet 保证规则只注册一次，避免累积。
const patchedMarkdownIt = new WeakSet<object>()

export const FormatColor = Mark.create({
  name: "formatColor",

  // 光标移出色尾后继续输入不自动延续颜色，避免误染后续文字
  inclusive: false,

  addAttributes() {
    return {
      color: {
        default: "blue",
        parseHTML: (element) => element.getAttribute("data-format-color") ?? "blue",
        renderHTML: (attributes) => ({ "data-format-color": attributes.color }),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "span[data-format-color]",
        // 仅认调色板内的颜色；未知值丢弃该 mark
        getAttrs: (element) => {
          const color = element.getAttribute("data-format-color") ?? ""
          return color in FORMAT_COLOR_MAP ? null : false
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0]
  },

  addStorage() {
    return {
      markdown: {
        serialize: {
          open: (_state: MarkdownSerializerState, mark: ProseMirrorMark) =>
            `<${String(mark.attrs.color)}>`,
          close: (_state: MarkdownSerializerState, mark: ProseMirrorMark) =>
            `</${String(mark.attrs.color)}>`,
        },
        parse: {
          setup(md: MarkdownIt) {
            if (patchedMarkdownIt.has(md)) return
            patchedMarkdownIt.add(md)
            // 内联规则：把 <色名> / </色名> 拆成自定义 token。
            // 放在 emphasis 之前：escape / backticks 规则更早，转义与代码场景照常生效；
            // autolink 的 <https://…> 不匹配色名正则，自然落到 link 规则。
            md.inline.ruler.before("emphasis", "format_color", (state, silent) => {
              if (state.src[state.pos] !== "<") return false
              const m = FORMAT_COLOR_TAG_AT.exec(state.src.slice(state.pos, state.pos + 32))
              if (!m) return false
              if (!silent) {
                const token = state.push(m[1] ? "format_color_close" : "format_color_open", "", 0)
                token.meta = { color: m[2] }
              }
              state.pos += m[0].length
              return true
            })
            md.renderer.rules.format_color_open = (tokens, idx) =>
              `<span data-format-color="${md.utils.escapeHtml(String(tokens[idx].meta?.color ?? ""))}">`
            md.renderer.rules.format_color_close = () => "</span>"
          },
        },
      },
    }
  },
})
