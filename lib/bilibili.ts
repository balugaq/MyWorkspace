"use client"

/**
 * B 站视频链接解析与封面获取（TODO 35）：预览卡不内嵌 player.bilibili.com 播放器 iframe——
 * 那是常驻的活播放器，长期占用 GPU/内存，改为封面图占位 + 点击整卡跳转。封面经公开接口获取
 * （允许跨域），失败静默降级；结果按 BV 号缓存，失败记 null 负缓存不重试，避免重渲染下重复外呼。
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

/** 封面缓存：bv → 封面 URL；null = 已尝试且失败（不重试）；缺省 = 从未尝试 */
const coverCache = new Map<string, string | null>()

/** 已缓存的封面（undefined = 尚未请求过） */
export function getCachedBilibiliCover(bv: string): string | null | undefined {
  return coverCache.get(bv)
}

/**
 * 拉取视频封面：GET api.bilibili.com/x/web-interface/view?bvid=… → data.pic。
 * code!==0（视频不存在 / 限流 -412 等）与网络异常一律返回 null 并记入负缓存。
 * signal 中止（组件卸载）不写缓存，避免污染其他挂载点的重试机会。
 */
export async function fetchBilibiliCover(bv: string, signal?: AbortSignal): Promise<string | null> {
  if (coverCache.has(bv)) return coverCache.get(bv) ?? null
  try {
    const res = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bv)}`, {
      signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = (await res.json()) as { code?: number; data?: { pic?: string } }
    const pic = json.code === 0 ? (json.data?.pic ?? null) : null
    const url = pic ? pic.replace(/^http:/, "https:") : null
    coverCache.set(bv, url)
    return url
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return coverCache.get(bv) ?? null
    coverCache.set(bv, null)
    return null
  }
}
