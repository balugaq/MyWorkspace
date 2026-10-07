// 词汇问答出题逻辑（TODO 64 批 2）：随机 + 错词加权抽样，纯函数无 DOM 依赖（tests 可测）。
// 主人拍板口径：随机出题，错词（wrong/partial 累计）加权更常出现。

import type { VocabEntry } from "./types"

/**
 * 加权不重复抽样：权重 = 1 + wrongCount * 2。
 * 返回 min(count, entries.length) 个，顺序即出题顺序。
 * rand 注入便于测试（默认 Math.random）。
 */
export function pickQuizEntries(
  entries: VocabEntry[],
  count: number,
  rand: () => number = Math.random,
): VocabEntry[] {
  const pool = [...entries]
  const picked: VocabEntry[] = []
  const n = Math.max(0, Math.min(Math.floor(count), pool.length))
  for (let i = 0; i < n; i++) {
    const weights = pool.map((e) => 1 + (e.review?.wrongCount ?? 0) * 2)
    const total = weights.reduce((a, b) => a + b, 0)
    let r = rand() * total
    let idx = 0
    for (; idx < weights.length - 1; idx++) {
      r -= weights[idx]
      if (r < 0) break
    }
    picked.push(pool.splice(idx, 1)[0]!)
  }
  return picked
}
