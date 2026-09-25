// QQ 互联通知渠道（TODO 22）：把通知推送到主人的 QQ 私信。
// 通道：本机常驻中转服务 POST <relayUrl>，body {"text":"..."}；地址可在设置页配置，
//       默认 http://localhost:18899/send（DEFAULT_QQ_RELAY_URL，留空 / 非法时回落）。
// 已实测：服务支持 CORS（ACAO:* + 允许 Content-Type），浏览器端可直接调用。
// 约束：正文以 [MyWorkspace] 开头标注来源；消息保持简短（机器人每日额度有限）；
//       超时 20 秒（服务转发较慢，短超时会误判失败）；失败静默（不打扰、不重试）。
import type { NotificationItem } from "@/lib/types"
import { DEFAULT_QQ_RELAY_URL } from "@/lib/types"
import { senderDisplayName } from "./senders"

/** 通知类型中文名（日志/推送共用） */
export const KIND_LABEL: Record<NotificationItem["kind"], string> = {
  commit: "提交",
  issue: "Issue",
  pr: "PR",
  release: "发布",
}

/** 单条超长截断（QQ 消息保持精简） */
function clip(text: string, max = 60): string {
  const t = text.trim()
  return t.length > max ? t.slice(0, max - 1) + "…" : t
}

/** 推送一条通知到 QQ 私信；返回是否成功（失败由调用方静默处理） */
export async function sendQqNotification(item: NotificationItem, relayUrl: string): Promise<boolean> {
  const url = relayUrl.trim() || DEFAULT_QQ_RELAY_URL
  const text =
    `[MyWorkspace] 通知中心 · ${senderDisplayName(item.senderId)}\n` +
    `${KIND_LABEL[item.kind]} · ${item.repo}\n` +
    `${clip(item.title)}\n` +
    item.url
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(20_000),
    })
    return res.ok
  } catch {
    // 中转服务未运行 / 超时：静默失败，不影响扫描与其余渠道
    return false
  }
}
