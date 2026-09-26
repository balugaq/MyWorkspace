// 通知 sender 展示元信息注册表（TODO 20 / TODO 23）。
//
// 通知数据层（NotificationItem.senderId）与展示层解耦：sender 产生消息时只带
// senderId，展示名等元信息在此登记。通知中心的筛选 tab、弹窗标题都从这张表取。
//
// sender 启停管理口径（TODO 23）：
//   - github：由「设置 → GitHub 集成」的仓库列表驱动（未配仓库即不扫描），无独立开关；
//   - news：由「设置 → 新闻精选」的 newsEnabled 开关驱动（默认开启）。
// 新增 sender 时在此追加一条，并在设置页为其增加各自配置分区。
// 注：TODO 22 的「通知通道（内置弹窗 / QQ 通知等）」是另一维度的抽象（notifier），
// 不要与 sender 混在同一张表里。

export interface SenderMeta {
  /** 展示名（弹窗标题行 / 通知中心卡片用） */
  name: string
  /** 一句话说明（通知中心筛选区 tooltip / 设置分区引导用） */
  description: string
}

export const SENDER_META: Record<string, SenderMeta> = {
  github: {
    name: "GitHub",
    description: "扫描配置仓库的 commit / Issue / PR / Release 动态",
  },
  news: {
    name: "新闻精选",
    description: "每日热榜聚合 → AI 精选解读（每天最多一次，18:00 为一天分界）",
  },
}

/** sender 展示名：未登记的 senderId 原样返回（优雅降级，不白屏） */
export function senderDisplayName(senderId: string): string {
  return SENDER_META[senderId]?.name ?? senderId
}
