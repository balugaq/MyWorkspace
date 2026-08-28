"use client"

import { createElement, useMemo, type ReactNode } from "react"
import { marked } from "marked"
import { cn } from "@/lib/utils"
import { StoredImg, MarkdownImg } from "@/components/rich-text"

/**
 * Markdown 预览渲染器。
 *
 * 设计约束（来自需求）：
 * - **不接入外部「呈现库」**：这里只用 `marked` 的 `lexer`（纯解析器）把文本变成 token 树，
 *   所有渲染都由本组件用 React 元素完成，确保对输出 100% 可控。
 * - **兼容原有图片协议**：正文里的 `{{img:<id>}}`（IndexedDB 图片）与 `![alt](url)`
 *   （URL 图片）照常识别并渲染；`{{img:}}` 在文本 token 中按原样拆分后走 `StoredImg`。
 * - 不渲染原始 HTML token（避免 XSS，也契合已加的严格 CSP）。
 */

// marked 的 token 是联合类型，这里抽一个最小结构自己用，避免散落 any。
interface MdToken {
  type: string
  text?: string
  depth?: number
  tokens?: MdToken[]
  href?: string
  title?: string | null
  items?: MdToken[]
  ordered?: boolean
  checked?: boolean | null
  lang?: string
}

const IMG_RE = /\{\{img:([^}]+)\}\}/g

const HEADING_CLS: Record<number, string> = {
  1: "mt-3 mb-1 text-2xl font-bold",
  2: "mt-3 mb-1 text-xl font-semibold",
  3: "mt-2 mb-1 text-lg font-semibold",
  4: "mt-2 mb-1 text-base font-semibold",
  5: "mt-2 mb-1 text-sm font-semibold",
  6: "mt-2 mb-1 text-sm font-semibold",
}

const INLINE_CODE_CLS = "rounded bg-muted px-1 py-0.5 font-mono text-xs"
const LINK_CLS = "text-primary underline underline-offset-2"

/** 仅放行安全链接协议，拦截 javascript: 等 */
function safeHref(href?: string): string | undefined {
  if (!href) return undefined
  if (/^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i.test(href)) return href
  if (/^data:image\//i.test(href)) return href
  return undefined
}

function textNode(text?: string): MdToken {
  return { type: "text", text: text ?? "" }
}

/** 取节点的内联子 token；没有则退回纯文本 */
function inlineOf(node: MdToken): MdToken[] {
  return node.tokens && node.tokens.length ? node.tokens : [textNode(node.text)]
}

/** 把一段文本按 `{{img:id}}` 拆成「文字 + 存储图片」 */
function splitImg(text: string, fullSize?: boolean): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let key = 0
  let m: RegExpExecArray | null
  IMG_RE.lastIndex = 0
  while ((m = IMG_RE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(<StoredImg key={`img-${key++}`} imgId={m[1].trim()} fullSize={fullSize} />)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function renderInline(tokens: MdToken[], fullSize?: boolean): ReactNode[] {
  return tokens.map((t, i) => {
    switch (t.type) {
      case "text":
      case "escape":
        return <span key={i}>{splitImg(t.text ?? "", fullSize)}</span>
      case "codespan":
        return (
          <code key={i} className={INLINE_CODE_CLS}>
            {t.text}
          </code>
        )
      case "strong":
        return <strong key={i}>{renderInline(inlineOf(t), fullSize)}</strong>
      case "em":
        return <em key={i}>{renderInline(inlineOf(t), fullSize)}</em>
      case "del":
        return <del key={i}>{renderInline(inlineOf(t), fullSize)}</del>
      case "link": {
        const href = safeHref(t.href)
        return (
          <a key={i} href={href} target="_blank" rel="noreferrer noopener" className={LINK_CLS}>
            {renderInline(inlineOf(t), fullSize)}
          </a>
        )
      }
      case "image":
        return <MarkdownImg key={i} url={t.href ?? ""} fullSize={fullSize} />
      case "br":
        return <br key={i} />
      case "html":
        // 不渲染原始 HTML，避免 XSS
        return null
      default:
        return <span key={i}>{splitImg(t.text ?? "", fullSize)}</span>
    }
  })
}

function renderBlock(tokens: MdToken[], keyPrefix: string, fullSize?: boolean): ReactNode[] {
  return tokens.map((t, i) => {
    const key = `${keyPrefix}-${i}`
    switch (t.type) {
      case "heading": {
        const depth = Math.min(6, Math.max(1, t.depth ?? 1))
        return createElement(
          `h${depth}`,
          { key, className: HEADING_CLS[depth] },
          renderInline(inlineOf(t), fullSize),
        )
      }
      case "paragraph":
        return (
          <p key={key} className="my-1">
            {renderInline(inlineOf(t), fullSize)}
          </p>
        )
      case "code":
        return (
          <pre
            key={key}
            className="my-1 overflow-auto rounded-md bg-muted p-2 text-xs font-mono"
          >
            <code className="whitespace-pre">{t.text}</code>
          </pre>
        )
      case "blockquote":
        return (
          <blockquote key={key} className="my-1 border-l-2 pl-3 text-muted-foreground">
            {renderBlock(t.tokens ?? [], key, fullSize)}
          </blockquote>
        )
      case "list": {
        const items = (t.items ?? []).map((it, j) => {
          const isTask = it.checked !== null && it.checked !== undefined
          return (
            <li key={j} className="my-0.5">
              {isTask && (
                <input
                  type="checkbox"
                  checked={!!it.checked}
                  readOnly
                  className="mr-1 align-middle"
                />
              )}
              {renderBlock(it.tokens ?? [], `${key}-${j}`, fullSize)}
            </li>
          )
        })
        return createElement(
          t.ordered ? "ol" : "ul",
          {
            key,
            className: t.ordered ? "my-1 list-decimal pl-5" : "my-1 list-disc pl-5",
          },
          items,
        )
      }
      case "hr":
        return <hr key={key} className="my-2 border-t" />
      case "space":
      case "html":
      case "table":
        return null
      default:
        if (t.text) {
          return (
            <p key={key} className="my-1">
              {splitImg(t.text, fullSize)}
            </p>
          )
        }
        return null
    }
  })
}

export function MarkdownView({
  text,
  className,
  fullSize = false,
}: {
  text: string
  className?: string
  fullSize?: boolean
}) {
  const tokens = useMemo(
    () => marked.lexer(text) as unknown as MdToken[],
    [text],
  )
  return (
    <div className={cn("text-sm leading-relaxed", className)}>
      {renderBlock(tokens, "b", fullSize)}
    </div>
  )
}
