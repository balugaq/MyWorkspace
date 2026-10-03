// QQ 互联通知渠道（TODO 22）：把通知推送到主人的 QQ 私信。
// 通道：本机常驻中转服务 POST <relayUrl>，body {"text":"..."}；地址可在设置页配置，
//       默认 http://localhost:18899/send（DEFAULT_QQ_RELAY_URL，留空 / 非法时回落）。
// 已实测：服务支持 CORS（ACAO:* + 允许 Content-Type），浏览器端可直接调用。
// 约束：正文以 [MyWorkspace] 开头标注来源；消息保持简短（机器人每日额度有限）；
//       超时 20 秒（服务转发较慢，短超时会误判失败）；失败静默（不打扰、不重试）。
// TODO 44：带 newsPack 的新闻包通知只发 1 条汇总消息。
// 改版（主人定稿）：整包**所有新闻的完整文字内容**拼成一条长消息一次发完
//       （每条：序号 + [领域] 标题 + 时间/地点/人物/经过/影响/精神/作文素材/链接），
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
  // 新闻包：整包所有新闻的完整文字内容拼成一条长消息一次发完（超长由 splitText 按行边界分段）
  if (item.newsPack && item.newsPack.length > 0) {
    const body =
      `${item.title}\n` +
      item.newsPack
        .map((d, i) => {
          const lines = [`【${i + 1}】［${d.field || "新闻"}］${d.title || "（无标题）"}`]
          if (d.time) lines.push(`时间：${d.time}`)
          if (d.place) lines.push(`地点：${d.place}`)
          if (d.individuals) lines.push(`人物：${d.individuals}`)
          if (d.throughout) lines.push(`经过：${d.throughout}`)
          if (d.effect) lines.push(`影响：${d.effect}`)
          if (d.spirit) lines.push(`精神：${d.spirit}`)
          if (d.essayExample) lines.push(`作文素材：${clip(d.essayExample, 300)}`)
          if (d.link?.length) lines.push(`链接：${d.link.join(" ")}`)
          return lines.join("\n")
        })
        .join("\n\n")
    const header = `[MyWorkspace] 通知 · ${senderDisplayName(item.senderId)}\n`
    const segments = splitText(header + body)
    let ok = true
    for (const seg of segments) {
      if (!(await sendQqText(seg, relayUrl))) ok = false
    }
    return ok
  }
  // 状态变化事件在类型后标注（如「Issue #123（关闭）」）；open 不标注事件；issue/PR 带编号
  const ev = item.event ?? "open"
  const numText = item.number != null ? ` #${item.number}` : ""
  const kindText =
    ev === "open"
      ? `${KIND_LABEL[item.kind]}${numText}`
      : `${KIND_LABEL[item.kind]}${numText}（${GH_EVENT_LABEL[ev]}）`
  // 新闻条目 repo 为空，改标领域（国内/国外）；第二行空段跳过
  const line2 = [kindText, item.kind === "news" ? (item.news?.field ?? "") : item.repo]
    .filter(Boolean)
    .join(" · ")
  const text =
    `[MyWorkspace] 通知 · ${senderDisplayName(item.senderId)}\n` +
    `${line2}\n` +
    `${clip(item.title)}\n` +
    item.url
  return sendQqText(text, relayUrl)
}
