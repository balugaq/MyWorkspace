// AI 会话标题（TODO 74）：生成标题的清洗纯函数。无 store / DOM 依赖，可被 node test 直接测。
// 触发与调用逻辑在 lib/ai/request-queue.ts（finalize 后静默触发）。

/** 清洗 AI 生成的会话标题：去引号 → 取首行 → 截断到 max 字（默认 10）→ 去尾部句读。
 * 先截断再清尾，保证第 max 字恰为句读时不残留；空返回空串（调用方据此跳过改名）。 */
export function sanitizeGeneratedTitle(raw: string, max = 10): string {
  let t = raw.trim()
  // 取首行（AI 偶尔会输出多行解释）
  t = t.split("\n")[0].trim()
  t = t.replace(/^[「『"'“‘]+/, "").replace(/[」』"'”’]+$/, "")
  t = t.slice(0, max)
  t = t.replace(/[。．.!?！？、…~～\s]+$/, "")
  return t
}
