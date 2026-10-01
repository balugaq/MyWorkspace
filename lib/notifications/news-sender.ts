// 新闻精选 sender（TODO 23 / TODO 44）：手动触发（每天最多一次，18:00 为一天分界）拉取
// 多平台热榜，交给 AI 精选最有价值的条目并按固定 schema 输出 JSON，解析后生成「新闻包」通知。
//
// 工作流：
//   1. 通知中心「新闻精选」tab 的手动按钮调 triggerNewsManually()（TODO 44 起无自动触发）；
//   2. 周期判断：新闻周期 = 上次 18:00 → 本次 18:00，本周期内 newsLastFetchedAt 已落 → 拒绝触发；
//   3. 拉取 5 个平台的实时热榜（GET /api/v1/misc/hotboard?type=…，复用 lib/uapi.ts 公共底座
//      与「高级 → UAPI 令牌」，免费接口，令牌可选）；
//   4. 汇总条目喂给当前选中的 AI 模型：后台静默新建「新闻精选」会话（不打断当前会话/视图），
//      经全局请求队列流式回写（与普通对话同一条链路，AI 页里可回看完整问答）；
//   5. 轮询等待 AI 最终回复 → 解析 JSON 数组 → 生成 1 条新闻包 NotificationItem（newsPack，
//      幂等 id，store 去重）→ 走统一渠道分发（弹窗 / QQ 各 1 条）+ 写通知日志。
//
// 失败策略（TODO 44）：
//   - 热榜部分/全部失败 → 不发失败通知，仅写通知日志；全部失败时本轮不动时间戳；
//   - AI 已触发（enqueue 成功）即落 fetched 时间戳——本周期不再重复触发；
//   - AI 请求失败（含 HTTP 429）/ 回复超时 / 回复解析不出条目 → 生成一条「新闻精选运行失败」
//     通知（幂等 id news-fail:{cycle}，同周期去重），走正常渠道分发。

import { enqueue, type AIChatConfig } from "@/lib/ai/request-queue"
import { useWorkspace } from "@/lib/store"
import type { NotificationItem, NewsDetail } from "@/lib/types"
import { dispatchNotifications } from "./channels"
import { uapiGet, UapiError } from "@/lib/uapi"

/** 要拉取的热榜平台（todo 23 指定 5 个） */
export const NEWS_TYPES = ["bilibili", "zhihu", "zhihu-daily", "douyin", "thepaper"] as const

/** 每个平台最多带入 prompt 的条目数（控制上下文体积；热榜前排已足够 AI 挑选） */
const PER_SOURCE_LIMIT = 30

/** AI 最多精选条数（todo 23：在精不在多，可以不足 10 个） */
const MAX_PICKED = 10

const POLL_INTERVAL_MS = 3_000
const POLL_TIMEOUT_MS = 4 * 60 * 1000

/** 平台展示名（通知日志用） */
const TYPE_LABEL: Record<(typeof NEWS_TYPES)[number], string> = {
  bilibili: "哔哩哔哩",
  zhihu: "知乎",
  "zhihu-daily": "知乎日报",
  douyin: "抖音",
  thepaper: "澎湃新闻",
}

// ---- 热榜接口的最小类型面 ----

interface HotboardItem {
  title?: string
  url?: string
  hot_value?: string
  extra?: unknown
  index?: number
}

interface HotboardResponse {
  type?: string
  update_time?: string
  list?: HotboardItem[]
}

// ---- 周期判断 ----

/** 当前新闻周期起点：最近一次 ≤ now 的本地 18:00（18:00 之后算「新的一天」） */
export function newsCycleStart(now: number = Date.now()): number {
  const d = new Date(now)
  d.setHours(18, 0, 0, 0)
  return d.getTime() <= now ? d.getTime() : d.getTime() - 24 * 60 * 60 * 1000
}

/** 是否该触发本周期拉取（开关关着 → 永不触发；本周期已拉 → false） */
export function shouldFetchNews(now: number = Date.now()): boolean {
  const s = useWorkspace.getState()
  if (!s.settings.newsEnabled) return false
  const last = s.newsLastFetchedAt
  return last == null || last < newsCycleStart(now)
}

// ---- AI 配置（与 ai-chat.tsx 的选型逻辑同口径）----

function resolveAiConfig(): AIChatConfig | null {
  const { aiModels, aiActiveModelId } = useWorkspace.getState().settings
  const m = aiModels.find((x) => x.id === aiActiveModelId) ?? aiModels[0]
  if (!m || !m.apiKey.trim()) return null
  return {
    providerId: m.provider,
    apiKey: m.apiKey,
    baseURL: m.baseUrl || undefined,
    model: m.model || undefined,
  }
}

// ---- 热榜拉取 ----

interface HotEntry {
  source: (typeof NEWS_TYPES)[number]
  title: string
  url: string
  hotValue: string
  extra: string
}

/** 拉一个平台热榜；失败抛错由调用方跳过 */
async function fetchHotboard(type: (typeof NEWS_TYPES)[number], token: string): Promise<HotEntry[]> {
  const data = await uapiGet<HotboardResponse>("/api/v1/misc/hotboard", token, { type })
  const list = Array.isArray(data.list) ? data.list : []
  const out: HotEntry[] = []
  for (const raw of list) {
    const title = typeof raw.title === "string" ? raw.title.trim() : ""
    if (!title) continue
    out.push({
      source: type,
      title,
      url: typeof raw.url === "string" ? raw.url : "",
      hotValue: typeof raw.hot_value === "string" ? raw.hot_value : "",
      extra:
        raw.extra == null
          ? ""
          : typeof raw.extra === "string"
            ? raw.extra
            : JSON.stringify(raw.extra),
    })
    if (out.length >= PER_SOURCE_LIMIT) break
  }
  return out
}

// ---- prompt 与解析 ----

function buildNewsPrompt(entries: HotEntry[]): string {
  const dateStr = new Date().toLocaleDateString("zh-CN", { dateStyle: "long" })
  const data = entries.map((e) => ({
    source: e.source,
    title: e.title,
    url: e.url,
    hot_value: e.hotValue,
    extra: e.extra,
  }))
  return `今天是${dateStr}。下面是从多个平台热榜抓取的新闻条目（JSON）。请你作为资深新闻编辑，从中挑选**最多 ${MAX_PICKED} 条**（在精不在多，可以不足）最有价值、最值得关注的新闻事件，按下面的 schema 输出 JSON 数组。

要求：
- 只输出 JSON 数组，不要输出任何其他文字、解释或 markdown 代码块标记。
- field 字段取「国内」或「国外」。
- time / place / individuals / throughout / effect / spirit / essay_example 均为字符串，基于你的知识对所选新闻做简要而准确的补充（热榜只有标题，细节靠你已知的信息；不确定的细节宁可不写，写「详见链接」）。
- link 字段为字符串数组：把该新闻相关的热榜条目原始 url 放进来（1~3 个）。
- 标题 title 保留事件核心信息，不要照抄热搜话题格式（去掉「#」包裹等）。

输出 schema（数组每项）：
{
  "field": "国内/国外",
  "title": "事件标题",
  "time": "事件时间",
  "place": "地点",
  "individuals": "相关人物/群体",
  "throughout": "事件经过",
  "effect": "影响",
  "spirit": "精神启示",
  "essay_example": "作文素材示例（一段可直接引用的话）",
  "link": ["https://…"]
}

热榜数据：
${JSON.stringify(data)}`
}

/** 从 AI 回复中提取 JSON 数组（容忍 markdown 代码块包裹 / 前后杂文字） */
function extractJsonArray(text: string): unknown[] | null {
  const withoutFences = text.replace(/```(?:json)?/gi, "")
  const start = withoutFences.indexOf("[")
  const end = withoutFences.lastIndexOf("]")
  if (start === -1 || end <= start) return null
  try {
    const parsed: unknown = JSON.parse(withoutFences.slice(start, end + 1))
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** 原始 AI 条目 → NewsDetail（逐字段校验，坏条目跳过） */
function toNewsDetail(raw: unknown): NewsDetail | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const title = typeof r.title === "string" ? r.title.trim() : ""
  if (!title) return null
  const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "")
  const link = Array.isArray(r.link)
    ? r.link.filter((u): u is string => typeof u === "string" && u.trim() !== "").map((u) => u.trim())
    : []
  return {
    title,
    field: str(r.field) || "国内",
    time: str(r.time),
    place: str(r.place),
    individuals: str(r.individuals),
    throughout: str(r.throughout),
    effect: str(r.effect),
    spirit: str(r.spirit),
    essayExample: str(r.essay_example),
    link,
  }
}

// ---- 等待 AI 回复 ----

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * 轮询等待该会话出现最终助手回复。enqueue 的流式内容只进内存 live 快照，
 * 收尾（完成 / 失败 / 用户中止但有正文）才经 setConversationMessages 落入 store——
 * 因此「store 里出现非空 assistant 消息」即代表请求已终结。
 * 会话被用户手动删除 → 返回 null；超时 → 返回 null。
 */
async function waitForAssistantReply(conversationId: string): Promise<string | null> {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)
    const conv = useWorkspace.getState().conversations.find((c) => c.id === conversationId)
    if (!conv) return null
    const last = conv.messages[conv.messages.length - 1]
    if (last && last.role === "assistant" && last.content.trim()) return last.content
  }
  return null
}

/**
 * 判断 AI 最终回复是否为请求失败（request-queue 收尾时失败占位以「⚠️ 请求失败」开头），
 * 是则提取一行失败原因作为通知 brief。
 */
function extractRequestFailure(reply: string): string | null {
  const line = reply
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("⚠️ 请求失败"))
  if (!line) return null
  return line.replace(/^⚠️\s*/, "").slice(0, 80)
}

// ---- 通知构造 ----

/** 新闻包通知（幂等 id news:{cycle}:0）与失败通知（news-fail:{cycle}）的公共字段 */
function buildNewsItemBase(): Pick<
  NotificationItem,
  "senderId" | "kind" | "repo" | "url" | "actor" | "createdAt" | "foundAt"
> {
  return {
    senderId: "news",
    kind: "news",
    repo: "",
    url: "",
    actor: "",
    createdAt: new Date().toISOString(),
    foundAt: Date.now(),
  }
}

// ---- 主流程 ----

let running = false

/** 一轮新闻工作流的执行结果（手动触发时供 UI 反馈） */
export type NewsRunOutcome =
  | {
      status: "ok"
      /** AI 精选出的条数 */
      picked: number
      /** 实际新增入库的通知条数（去重后；成功与失败通知各 1 条封顶） */
      fresh: number
      /** 拉取失败的平台展示名 */
      failedSources: string[]
    }
  | { status: "no-ai" }
  | { status: "no-entries"; failedSources: string[] }
  | { status: "error" }

/**
 * 手动触发一轮新闻精选（通知中心「新闻精选」tab 的按钮）：
 * 受「本周期已拉取」门槛约束（本周期已拉 → 返回 "fetched"），
 * 仍尊重 newsEnabled 开关与防重入；投递链路见 dispatchNotifications（含 QQ 渠道）。
 */
export async function triggerNewsManually(): Promise<
  NewsRunOutcome | "running" | "disabled" | "fetched"
> {
  if (!useWorkspace.getState().settings.newsEnabled) return "disabled"
  if (running) return "running"
  if (!shouldFetchNews()) return "fetched"
  running = true
  try {
    return await runNewsCycle()
  } catch {
    return { status: "error" }
  } finally {
    running = false
  }
}

/** 生成一条通知 → 去重入库 → 渠道分发 → 写通知日志的公共收尾 */
function commitNotification(item: NotificationItem, logMessage: string): number {
  const existingIds = new Set(useWorkspace.getState().notifications.map((n) => n.id))
  let fresh = 0
  if (!existingIds.has(item.id)) {
    const s = useWorkspace.getState()
    s.addNotifications([item])
    dispatchNotifications([item], s.settings)
    fresh = 1
  }
  const s = useWorkspace.getState()
  s.appendNotificationLogs([
    {
      id: `news-scan:${item.foundAt}`,
      at: item.foundAt ?? Date.now(),
      kind: "scan",
      message: logMessage,
      notified: fresh > 0 && (s.settings.notificationChannels.builtin || s.settings.notificationChannels.qq),
    },
  ])
  return fresh
}

async function runNewsCycle(): Promise<NewsRunOutcome> {
  const state = useWorkspace.getState()
  const config = resolveAiConfig()
  if (!config) return { status: "no-ai" } // 未配置 AI 模型：不触发也不落时间戳（配置好后可再手动触发）

  // 1) 拉热榜（单平台失败跳过，不影响其余平台）
  const token = state.settings.uapiToken
  const results = await Promise.all(
    NEWS_TYPES.map(async (t) => {
      try {
        return { type: t, entries: await fetchHotboard(t, token) }
      } catch (e) {
        return { type: t, entries: [], error: e instanceof UapiError ? e.message : "拉取失败" }
      }
    }),
  )
  const entries = results.flatMap((r) => r.entries)
  const failed = results.filter((r) => r.entries.length === 0)
  const failedSources = failed.map((f) => TYPE_LABEL[f.type])
  if (entries.length === 0) {
    return { status: "no-entries", failedSources } // 全部平台失败：不动时间戳，可重试
  }

  const cycle = newsCycleStart()
  const at = Date.now()
  const state2 = useWorkspace.getState()

  // 2) 静默建会话 + 入队 AI 精选（成功触发即落时间戳，本周期不再重复）
  const title = `新闻精选 ${new Date(cycle).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}`
  const conversationId = state2.createConversationSilent(title)
  enqueue(conversationId, buildNewsPrompt(entries), config)
  state2.setNewsLastFetchedAt(at)

  // 3) 等 AI 最终回复并解析；失败三分支 → 失败通知（同周期幂等去重）
  const failedNote = failed.length
    ? `（${failed.map((f) => `${TYPE_LABEL[f.type]}失败`).join("、")}）`
    : ""
  const reply = await waitForAssistantReply(conversationId)

  if (reply === null) {
    // 回复超时（或会话被手动删除）：发失败通知
    const fresh = commitNotification(
      {
        ...buildNewsItemBase(),
        id: `news-fail:${cycle}`,
        title: "新闻精选运行失败",
        brief: "AI 回复超时或会话被删除，本轮未生成精选",
      },
      `新闻精选：AI 回复超时，本轮未生成通知${failedNote}`,
    )
    return { status: "ok", picked: 0, fresh, failedSources }
  }

  const requestFailure = extractRequestFailure(reply)
  if (requestFailure !== null) {
    // AI 请求失败（含 HTTP 429）：request-queue 收尾占位里带失败原因
    const fresh = commitNotification(
      {
        ...buildNewsItemBase(),
        id: `news-fail:${cycle}`,
        title: "新闻精选运行失败",
        brief: requestFailure,
      },
      `新闻精选：AI 请求失败（${requestFailure}），本轮未生成通知${failedNote}`,
    )
    return { status: "ok", picked: 0, fresh, failedSources }
  }

  const picked = extractJsonArray(reply)
  const details = (picked ?? [])
    .slice(0, MAX_PICKED)
    .map(toNewsDetail)
    .filter((x): x is NewsDetail => x !== null)

  if (details.length === 0) {
    // 有回复但解析不出条目：发失败通知
    const fresh = commitNotification(
      {
        ...buildNewsItemBase(),
        id: `news-fail:${cycle}`,
        title: "新闻精选运行失败",
        brief: "AI 回复无法解析出精选条目（可在 AI 助手对应会话查看原始输出）",
      },
      `新闻精选：AI 输出解析失败，本轮未生成通知${failedNote}`,
    )
    return { status: "ok", picked: 0, fresh, failedSources }
  }

  // 4) 成功：一轮只生成 1 条新闻包通知（幂等 id news:{cycle}:0，重放不重复入库）
  const packItem: NotificationItem = {
    ...buildNewsItemBase(),
    id: `news:${cycle}:0`,
    title: `新闻精选 · ${details.length} 条`,
    brief: details
      .slice(0, 3)
      .map((d) => d.title)
      .join("；"),
    newsPack: details,
  }
  const fresh = commitNotification(
    packItem,
    `新闻精选：已拉取 ${NEWS_TYPES.length - failed.length} 个平台共 ${entries.length} 条热榜，AI 精选 ${details.length} 条，生成新闻包通知${failedNote}`,
  )

  return { status: "ok", picked: details.length, fresh, failedSources }
}
