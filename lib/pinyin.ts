import { pinyin } from "pinyin-pro"

// 拼音搜索共享工具（联系人 / 全局搜索 / 节日 / GitHub 队列 / 保险库 / 通知 / 标签）。
// 语义：纯 ASCII 字母 query 命中「全拼包含或首字母序列包含」（"lxs" 命中「李先生」）；含非 ASCII 退回小写 includes；空文本/空 query 恒不命中。超长文本（>2000 字符）跳过拼音转换防卡顿（普通 includes 仍生效），转换结果按原文缓存。

const PINYIN_MAX_LEN = 2000

const indexCache = new Map<string, { full: string; initials: string }>()

function getPinyinIndex(text: string): { full: string; initials: string } | null {
  if (text.length > PINYIN_MAX_LEN) return null
  const hit = indexCache.get(text)
  if (hit) return hit
  const full = pinyin(text, { toneType: "none", type: "array", nonZh: "consecutive" })
    .join("")
    .toLowerCase()
  const initials = pinyin(text, { pattern: "first", toneType: "none", type: "array", nonZh: "consecutive" })
    .join("")
    .toLowerCase()
  const idx = { full, initials }
  indexCache.set(text, idx)
  return idx
}

/** 是否纯 ASCII 字母（拼音匹配的触发条件） */
function isAsciiLetters(s: string): boolean {
  return /^[a-z]+$/i.test(s)
}

/** 拼音增强的 includes：普通 includes 之外，纯字母 query 追加全拼/首字母命中；可直接替换 `text.toLowerCase().includes(q)`。 */
export function matchTextPinyin(text: string | undefined | null, query: string): boolean {
  if (!text) return false
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  if (!q) return false
  if (t.includes(q)) return true
  if (!isAsciiLetters(q)) return false
  const idx = getPinyinIndex(text)
  if (!idx) return false
  return idx.full.includes(q) || idx.initials.includes(q)
}
