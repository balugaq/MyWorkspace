"use client"

import { useEffect, useMemo, useState } from "react"
import { getImageURL } from "@/lib/image-store"
import { cn } from "@/lib/utils"

/**
 * 把正文纯文本渲染成富文本：支持
 *   - `{{img:<id>}}`：引用 IndexedDB 中保存的图片
 *   - `![](url)`：Markdown 图片（URL 图片协议）
 * 其余按换行显示。
 */
export function RichText({
  text,
  className,
  maxImages = 8,
}: {
  text: string
  className?: string
  maxImages?: number
}) {
  const segments = useMemo(() => splitSegments(text), [text])
  let imgCount = 0

  return (
    <div className={cn("whitespace-pre-wrap", className)}>
      {segments.map((seg, i) => {
        if (seg.type === "stored") {
          imgCount++
          if (imgCount > maxImages) return null
          return <StoredImg key={i} imgId={seg.id} />
        }
        if (seg.type === "url") {
          imgCount++
          if (imgCount > maxImages) return null
          return <MarkdownImg key={i} url={seg.url} />
        }
        return <span key={i}>{seg.text}</span>
      })}
    </div>
  )
}

type Segment =
  | { type: "text"; text: string }
  | { type: "stored"; id: string }
  | { type: "url"; url: string }

/** 解析正文：优先 `{{img:id}}`，其次 `![...](url)`，其余为文本 */
export function splitSegments(text: string): Segment[] {
  const out: Segment[] = []
  const re = /(\{\{img:([^}]+)\}\}|!\[[^\]]*?\]\((\S+?)\))/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ type: "text", text: text.slice(last, m.index) })
    if (m[2]) {
      out.push({ type: "stored", id: m[2].trim() })
    } else if (m[3]) {
      out.push({ type: "url", url: m[3] })
    }
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) })
  return out
}

function StoredImg({ imgId }: { imgId: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    getImageURL(imgId).then((u) => {
      if (!active) return
      setUrl(u)
      // 组件卸载时不主动 revoke（对象URL生命周期交给浏览器），避免竞态
    })
    return () => {
      active = false
    }
  }, [imgId])
  if (!url) return <span className="text-muted-foreground">[加载图片…]</span>
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 图片来自 IndexedDB blob URL，无法走 next/image 优化
    <img
      src={url}
      alt=""
      className="my-1 block max-h-56 max-w-full rounded-md border border-border object-contain"
    />
  )
}

function MarkdownImg({ url }: { url: string }) {
  if (!url) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 图片为任意远程 URL，无法走 next/image
    <img
      src={url}
      alt=""
      className="my-1 block max-h-56 max-w-full rounded-md border border-border object-contain"
    />
  )
}
