import { pinyin } from "pinyin-pro"

/**
 * 拼音搜索共享工具（联系人 / 全局搜索 / 节日 / GitHub 队列 / 保险库 / 通知 / 标签）。
 *
 * 语义：
 * - query 为纯 ASCII 字母 → 命中 = 文本的全拼包含 query，或首字母序列包含 query
 *   （如 "lxs" 命中「李先生」，"lixiansheng" 同样命中）
 * - query 含非 ASCII（中文等）→ 退回普通小写 includes（拼音不参与）
 * - 空文本 / 空 query 恒不命中（由调用方先行短路）
 *
 * 性能：转换结果按原文缓存（Map），长文本只转换一次；超长文本（>2000 字符）
 * 跳过拼音匹配（避免极长章节全文转拼音的卡顿，普通 includes 仍生效——但纯字母
 * query 下这类超长文本将不参与命中，属可接受取舍）。
 */

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

/**
 * 拼音增强的文本匹配：在普通 includes 之外，纯字母 query 追加全拼/首字母命中。
 * 调用方直接用本函数替换原来的 `text.toLowerCase().includes(q)` 即可。
 */
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
