// 通知渠道（notifier）抽象（TODO 22）：sender 产生 NotificationItem 后，由这里按
// 用户在设置里勾选的渠道分发投递。未来新增渠道（如 webhook、邮件等）在本表登记一条即可。
import type { NotificationItem, Settings } from "@/lib/types"
import { emitNotificationToasts } from "./toast-bus"
import { sendQqNotification } from "./qq-channel"

export interface NotificationChannel {
  /** 渠道 id，对应 Settings.notificationChannels 的键 */
  id: string
  /** 展示名（设置页勾选项） */
  name: string
  /** 设置页勾选项下的说明文字 */
  description: string
  /** 投递一批通知；实现自身吞错（渠道不可用不影响其余渠道与扫描流程）；settings 供渠道读自己的配置 */
  deliver(items: NotificationItem[], settings: Settings): void | Promise<void>
}

export const NOTIFICATION_CHANNELS: NotificationChannel[] = [
  {
    id: "builtin",
    name: "内置通知",
    description: "右下角滑入弹窗（停留 5 秒，逐条排队）",
    deliver: (items) => emitNotificationToasts(items),
  },
  {
    id: "qq",
    name: "QQ 互联通知",
    description: "经本机 QQ 中转服务推送到 QQ 私信（机器人有每日额度，注意频率）",
    deliver: async (items, settings) => {
      for (const item of items) await sendQqNotification(item, settings.qqRelayUrl)
    },
  },
]

/** 按设置勾选的渠道分发一批新通知；任何渠道抛错都不影响其余渠道 */
export function dispatchNotifications(items: NotificationItem[], settings: Settings): void {
  const ch = settings.notificationChannels
  for (const channel of NOTIFICATION_CHANNELS) {
    if (!ch[channel.id as keyof typeof ch]) continue
    try {
      void Promise.resolve(channel.deliver(items, settings)).catch(() => {})
    } catch {
      // 渠道投递失败静默跳过
    }
  }
}
