// 语音朗读（TODO 17）：浏览器自带 speechSynthesis（系统 TTS），免费离线零依赖。Chrome 对超长 utterance 有「读到十几秒静默中断」的已知 bug，按句切块（每块 ≤180 字符）排队规避；token 计数让 stopSpeaking 后旧回调不再触发 onEnd。
// 注意：本模块顶层不触碰 window（node:test 可直接 import 纯函数）。

import { stripFormatColorTags } from "./format-colors.ts"

const CHUNK_LIMIT = 180

/** 从 markdown 消息提取可朗读的纯文本（代码块以占位符代替，链接只读标题） */
export function extractSpeakableText(md: string): string {
  let s = md
  // 格式色标签 <blue>…</blue> 等 → 纯文字（复用 16 色管线同一份剥离逻辑）
  s = stripFormatColorTags(s)
  // 代码块 → 占位（朗读 token 流没有意义）
  s = s.replace(/```[\s\S]*?(?:```|$)/g, "（代码已省略）")
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
  // 裸 URL 剥除（逐字符朗读是噪音）
  s = s.replace(/https?:\/\/\S+/g, "")
  // 行内代码去反引号（内容保留，通常是变量/命令名）
  s = s.replace(/`([^`]*)`/g, "$1")
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, "")
  s = s.replace(/^\s{0,3}[-*+]\s+/gm, "")
  s = s.replace(/^\s{0,3}>\s?/gm, "")
  s = s.replace(/(\*\*\*|\*\*|\*|__|_|~~)/g, "")
  s = s.replace(/\|/g, " ")
  // 空白压缩（保留换行结构）
  s = s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n")
  return s.trim()
}

/** 按句读切块（贪心合并到 ≤limit 字符；超长单句硬切），供排队朗读规避 Chrome 长文本 bug */
export function chunkForSpeech(text: string, limit = CHUNK_LIMIT): string[] {
  const sentences = text.split(/(?<=[。！？!?；;\n])/)
  const chunks: string[] = []
  let cur = ""
  for (const piece of sentences) {
    if (piece.length > limit) {
      if (cur) {
        chunks.push(cur)
        cur = ""
      }
      for (let i = 0; i < piece.length; i += limit) chunks.push(piece.slice(i, i + limit))
      continue
    }
    if (cur.length + piece.length > limit) {
      if (cur) chunks.push(cur)
      cur = piece
    } else {
      cur += piece
    }
  }
  if (cur) chunks.push(cur)
  return chunks.filter((c) => c.trim().length > 0)
}

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window
}

let queueToken = 0

/** 开始朗读：先 cancel 上一轮再按块排队；全部读完回调 onEnd(true)，被打断/出错后的旧队列由 token guard 忽略。不支持语音返回 false；lang 固定 zh-CN，中英混排由系统 TTS 自行处理。 */
export function startSpeaking(text: string, onEnd?: (finished: boolean) => void): boolean {
  if (!isSpeechSupported()) return false
  stopSpeaking()
  const token = ++queueToken
  const chunks = chunkForSpeech(text)
  if (chunks.length === 0) {
    onEnd?.(true)
    return true
  }
  let remaining = chunks.length
  for (const chunk of chunks) {
    const u = new SpeechSynthesisUtterance(chunk)
    u.lang = "zh-CN"
    u.onend = () => {
      if (token !== queueToken) return
      remaining -= 1
      if (remaining === 0) onEnd?.(true)
    }
    u.onerror = () => {
      if (token !== queueToken) return
      remaining = 0
      onEnd?.(false)
    }
    window.speechSynthesis.speak(u)
  }
  return true
}

/** 停止朗读（cancel 会触发旧 utterance 的回调，token guard 保证不外泄） */
export function stopSpeaking(): void {
  queueToken++
  if (isSpeechSupported()) window.speechSynthesis.cancel()
}
