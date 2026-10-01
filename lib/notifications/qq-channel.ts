// QQ 互联通知渠道（TODO 22）：把通知推送到主人的 QQ 私信。
// 通道：本机常驻中转服务 POST <relayUrl>，body {"text":"..."}；地址可在设置页配置，
//       默认 http://localhost:18899/send（DEFAULT_QQ_RELAY_URL，留空 / 非法时回落）。
// 已实测：服务支持 CORS（ACAO:* + 允许 Content-Type），浏览器端可直接调用。
// 约束：正文以 [MyWorkspace] 开头标注来源；消息保持简短（机器人每日额度有限）；
//       超时 20 秒（服务转发较慢，短超时会误判失败）；失败静默（不打扰、不重试）。
// TODO 44：带 newsPack 的新闻包通知只发 1 条汇总消息（包标题 + 逐行新闻标题），
//       超长按行边界自动分段发送。
import type { NotificationItem } from "@/lib/types"
import { DEFAULT_QQ_RELAY_URL, GH_EVENT_LABEL } from "@/lib/types"
import { senderDisplayName } from "./senders"

/** 通知类型中文名（日志/推送共用） */
export const KIND_LABEL: Record<NotificationItem["kind"], string> = {
  commit: "提交",
  issue: "Issue",
  pr: "PR",
  release: "发布",
  news: "新闻",
}

/** 单条超长截断（QQ 消息保持精简） */
function clip(text: string, max = 60): string {
  const t = text.trim()
  return t.length > max ? t.slice(0, max - 1) + "…" : t
}

/** 单条 QQ 消息的最大长度（超过则按行边界分段发送） */
const QQ_MESSAGE_MAX = 800

/** 按行边界把长文本切成不超过 max 的若干段（单行超长时硬切） */
function splitText(text: string, max = QQ_MESSAGE_MAX): string[] {
  if (text.length <= max) return [text]
  const out: string[] = []
  let buf = ""
  for (const line of text.split("\n")) {
    if (line.length > max) {
      if (buf) {
        out.push(buf)
        buf = ""
      }
      for (let i = 0; i < line.length; i += max) out.push(line.slice(i, i + max))
      continue
    }
    if (buf.length + line.length + 1 > max) {
      out.push(buf)
      buf = line
    } else {
      buf = buf ? `${buf}\n${line}` : line
    }
  }
  if (buf) out.push(buf)
  return out
}

/** 推送一段文本到 QQ 私信；返回是否成功（失败由调用方静默处理） */
async function sendQqText(text: string, relayUrl: string): Promise<boolean> {
  const url = relayUrl.trim() || DEFAULT_QQ_RELAY_URL
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

/** 推送一条通知到 QQ 私信；返回是否成功（失败由调用方静默处理） */
export async function sendQqNotification(item: NotificationItem, relayUrl: string): Promise<boolean> {
  // 新闻包（TODO 44）：整包只发 1 条汇总消息——包标题 + 逐行「[领域] 新闻标题」
  if (item.newsPack && item.newsPack.length > 0) {
    const body =
      `${item.title}\n` +
      item.newsPack.map((d) => `［${d.field}］${clip(d.title ?? "（无标题）", 40)}`).join("\n")
    const header = `[MyWorkspace] 通知中心 · ${senderDisplayName(item.senderId)}\n`
    const segments = splitText(header + body)
    let ok = true
    for (const seg of segments) {
      if (!(await sendQqText(seg, relayUrl))) ok = false
    }
    return ok
  }
  // 状态变化事件在类型后标注（如「Issue（关闭）」）；open 不标注
  const ev = item.event ?? "open"
  const kindText =
    ev === "open" ? KIND_LABEL[item.kind] : `${KIND_LABEL[item.kind]}（${GH_EVENT_LABEL[ev]}）`
  // 新闻条目 repo 为空，改标领域（国内/国外）；第二行空段跳过
  const line2 = [kindText, item.kind === "news" ? (item.news?.field ?? "") : item.repo]
    .filter(Boolean)
    .join(" · ")
  const text =
    `[MyWorkspace] 通知中心 · ${senderDisplayName(item.senderId)}\n` +
    `${line2}\n` +
    `${clip(item.title)}\n` +
    item.url
  return sendQqText(text, relayUrl)
}
