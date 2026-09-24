// 通知 sender 展示元信息注册表（TODO 20）。
//
// 通知数据层（NotificationItem.senderId）与展示层解耦：sender 产生消息时只带
// senderId，展示名等元信息在此登记。未来新增 sender（如新闻、RSS 等）时在此
// 追加一条即可，通知中心与弹窗自动获得正确的展示名。
// 注：TODO 22 规划中的「通知通道（内置弹窗 / QQ 通知等）」是另一维度的抽象
// （notifier），不要与 sender 混在同一张表里。

export interface SenderMeta {
  /** 展示名（弹窗标题行 / 通知中心卡片用） */
  name: string
}

export const SENDER_META: Record<string, SenderMeta> = {
  github: { name: "GitHub" },
}

/** sender 展示名：未登记的 senderId 原样返回（优雅降级，不白屏） */
export function senderDisplayName(senderId: string): string {
  return SENDER_META[senderId]?.name ?? senderId
}
