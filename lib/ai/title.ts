// AI 会话标题（TODO 74）：生成标题的清洗纯函数。无 store / DOM 依赖，可被 node test 直接测。
// 触发与调用逻辑在 lib/ai/request-queue.ts（finalize 后静默触发）。

/** 清洗 AI 生成的会话标题：去首尾引号 → 取首行 → 截断到 max 字（默认 10）→ 去尾部句读。
 * 先截断再清尾：保证第 10 字恰为句读时不会残留在标题尾部。空返回空串（调用方据此跳过改名）。 */
export function sanitizeGeneratedTitle(raw: string, max = 10): string {
  let t = raw.trim()
  // 取首行（AI 偶尔会输出多行解释）
  t = t.split("\n")[0].trim()
  // 去首尾成对/不成对引号（中英日）
  t = t.replace(/^[「『"'“‘]+/, "").replace(/[」』"'”’]+$/, "")
  // 截断
  t = t.slice(0, max)
  // 去尾部句读与空白（中文句号 / 英文句点 / 问叹号 / 顿号 / 省略号）
  t = t.replace(/[。．.!?！？、…~～\s]+$/, "")
  return t
}
