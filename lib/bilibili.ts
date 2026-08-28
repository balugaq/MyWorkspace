"use client"

/**
 * B 站视频链接解析。
 *
 * 浏览器侧无法稳定抓取 B 站 Open Graph 缩略图（api.bilibili.com 有 CORS 限制，
 * 且 og:image 直链同样跨域），因此预览卡采用官方嵌入式播放器 iframe 作为视觉预览
 * （player.bilibili.com 专为嵌入设计，允许被框架嵌套），而非静态缩略图。
 * 标题等元数据暂不强求（CORS 不可靠），卡片以「链接 + 播放器预览」呈现，原始链接文字保留可点击。
 */

const BILI_RE =
  /https?:\/\/(?:www\.|m\.)?bilibili\.com\/video\/(BV[0-9A-Za-z]+)(?:[\/?#].*)?|https?:\/\/b23\.tv\/[A-Za-z0-9]+/i

/** 从任意 B 站链接中提取 BV 号（短链 b23.tv/xxx 无法直接得到，返回 null 走纯链接降级） */
export function parseBilibiliUrl(url: string): { bv: string | null; url: string } | null {
  const m = BILI_RE.exec(url.trim())
  if (!m) return null
  return { bv: m[1] ?? null, url: url.trim() }
}

export function isBilibiliUrl(url: string): boolean {
  return parseBilibiliUrl(url) !== null
}

/** 官方嵌入播放器地址（autoplay=0 不自动播放，danmaku=0 关弹幕） */
export function bilibiliEmbedSrc(bv: string): string {
  return `https://player.bilibili.com/player.html?bvid=${bv}&danmaku=0&high_quality=1&autoplay=0`
}
