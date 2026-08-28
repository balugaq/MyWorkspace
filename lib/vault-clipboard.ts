// 保险库剪贴板加固：复制保险库里的明文值后，30 秒内自动清空剪贴板。
// 仅清「来自保险库」的复制内容——若在 30s 内又复制了别处内容，则取消待清计划，
// 避免误清用户后续复制的非保险库文本。

const CLEAR_DELAY = 30_000

let timer: ReturnType<typeof setTimeout> | null = null

function clearNow() {
  timer = null
  // 清空剪贴板需在安全上下文且有焦点；失败则静默（最坏情况只是没清掉）
  navigator.clipboard?.writeText("").catch(() => {})
}

/** 安排一次「30s 后清空剪贴板」，重复调用会重置计时（从最后一次复制起算） */
export function scheduleVaultClipboardClear() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(clearNow, CLEAR_DELAY)
}

/** 取消待执行的清空（用于用户在窗口期内复制了非保险库内容） */
export function cancelVaultClipboardClear() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}
