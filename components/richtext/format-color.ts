"use client"

// 富文本 16 色标签扩展（TODO 32）：把 <blue>…</blue> 这类 Minecraft 风格色标签解析为 mark
// （DOM 形态 <span data-format-color>），序列化还原为标签。解析链路：markdown-it 内联规则拆出
// 自定义 token → 渲染为带 data-format-color 的 span → TipTap parseHTML 归为 mark；html:false
// 只关掉源文本里的原始 HTML，不影响本扩展渲染的 span，代码里的标签保持字面量。

import { Mark, mergeAttributes } from "@tiptap/core"
import type MarkdownIt from "markdown-it"
import type { MarkdownSerializerState } from "prosemirror-markdown"
import type { Mark as ProseMirrorMark } from "prosemirror-model"
import { FORMAT_COLOR_MAP, FORMAT_COLOR_TAG_PREFIX } from "@/lib/format-colors"

// tiptap-markdown 每次 parse 都会重跑 parse.setup，而 ruler.before 不去重——WeakSet 保证规则只注册一次。
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

  renderHTML({ HTMLAttributes, mark }) {
    // 颜色样式在此单点输出（色值唯一来源：lib/format-colors.ts 的 FORMAT_COLOR_MAP）；此前只有 data 属性、无 CSS 消费，渲染永远无色（TODO 68 补漏）
    const hex = FORMAT_COLOR_MAP[String(mark.attrs.color)]
    return [
      "span",
      mergeAttributes(HTMLAttributes, hex ? { style: `color: ${hex}` } : {}),
      0,
    ]
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
            // 内联规则放在 emphasis 之前：escape / backticks / autolink 更早，转义与代码场景照常生效
            md.inline.ruler.before("emphasis", "format_color", (state, silent) => {
              if (state.src[state.pos] !== "<") return false
              // 前缀匹配：当前位置起是色标签即命中（TODO 68——全锚定会让中间的开标签永不命中、
              // 末尾闭标签脱离配对孤立命中，表现为 </blue> 被吞）
              const m = FORMAT_COLOR_TAG_PREFIX.exec(state.src.slice(state.pos, state.pos + 32))
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
