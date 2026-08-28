"use client"

import { useEffect, useState } from "react"
import { getImageURL } from "@/lib/image-store"
import { cn } from "@/lib/utils"
import { isImgref, imgrefId } from "./richtext/normalize"

/**
 * 图片渲染组件（供 Markdown 预览 `MarkdownView` 复用）。
 *
 * 支持两种图片协议：
 *   - `{{img:<id>}}` → `StoredImg`：引用 IndexedDB 中保存的图片
 *   - `![alt](url)`  → `MarkdownImg`：远程/URL 图片
 */

const IMG_FIT = "my-1 block rounded-md border border-border object-contain"
const IMG_FULL = "my-1 block h-auto max-w-full rounded-md border border-border"

export function StoredImg({ imgId, fullSize }: { imgId: string; fullSize?: boolean }) {
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
    <img src={url} alt="" className={fullSize ? IMG_FULL : cn(IMG_FIT, "max-h-56 max-w-full")} />
  )
}

export function MarkdownImg({ url, fullSize }: { url: string; fullSize?: boolean }) {
  if (!url) return null
  // 支持 imgref:<id> 协议（本项目重构后的内文图），走 IndexedDB
  if (isImgref(url)) return <StoredImg imgId={imgrefId(url)} fullSize={fullSize} />
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 图片为任意远程 URL，无法走 next/image
    <img src={url} alt="" className={fullSize ? IMG_FULL : cn(IMG_FIT, "max-h-56 max-w-full")} />
  )
}
