/**
 * persist merge 迁移（TODO 83）：把 localStorage 旧存档快照迁移为当前 schema。
 * 从 store.ts 抽出的纯数据变换——不碰 DOM / 存储 / React，可被 node:test 直接测
 * （AGENTS.md 红线 #1「新增字段必须过 merge」的机械检查见 tests/persist-merge.test.ts）。
 * store.ts 的 persist(merge) 与备份导入（importData / mergeData）共用这里的迁移函数。
 */
import type {
  Category,
  MindNode,
  MindEdge,
  MindmapViewport,
  RelationFamily,
  Settings,
  AIModelEntry,
  Conversation,
  Contribution,
  IssueQueueItem,
  Person,
  FestivalDef,
} from "./types"
import {
  DEFAULT_SETTINGS,
  normalizeNotificationRepos,
  normalizeNotificationChannels,
  normalizeQqRelayUrl,
  normalizeProfileWidgetOrder,
  normalizeBirthdayBannerDays,
  BUILTIN_TODO_RELATIONS_CATEGORY_ID,
  type AIPersona,
} from "./types.ts"
import { AI_PROVIDERS } from "./ai/providers.ts"
import { normalizeDayStartOffset } from "./contributions.ts"
// 仅类型依赖（运行时擦除）：merge 的 current/返回值为完整 store 状态
import type { WorkspaceState } from "./store"

/** 人设迁移：旧存档单一 `aiPersona` 升级为多人人设列表；已有 aiPersonas 原样保留，选中 id 无效时复位 null（仅用基础提示词）。 */
export function migratePersona(rawSettings: Record<string, unknown>): {
  aiPersonas: AIPersona[]
  aiActivePersonaId: string | null
} {
  let aiPersonas: AIPersona[] = Array.isArray(rawSettings.aiPersonas)
    ? (rawSettings.aiPersonas as AIPersona[])
    : []
  let aiActivePersonaId: string | null =
    typeof rawSettings.aiActivePersonaId === "string" ? rawSettings.aiActivePersonaId : null

  if (aiPersonas.length === 0) {
    const legacy =
      typeof rawSettings.aiPersona === "string" ? rawSettings.aiPersona.trim() : ""
    if (legacy) {
      const id = `p_${Date.now().toString(36)}`
      aiPersonas = [{ id, name: "默认人设", content: legacy }]
      aiActivePersonaId = id
    }
  }
  if (aiActivePersonaId && !aiPersonas.some((p) => p.id === aiActivePersonaId)) {
    aiActivePersonaId = null
  }
  return { aiPersonas, aiActivePersonaId }
}

// 旧版思维导图节点无 createdAt / completedAt 字段；统一默认时间（用户指定：2026/8/31 02:00:00 GMT+8）。
export const LEGACY_NODE_TIME = new Date("2026-08-31T02:00:00+08:00").getTime()

// 为旧存档/旧备份中缺失 createdAt / completedAt 的节点补齐默认值（并在加载时写回持久化）。
// 约定：字段为 undefined = 旧数据缺失 → 补齐 LEGACY_NODE_TIME；字段为 null = 明确「未完成」→ 保留。
function normalizeMindNodes(raw: unknown): MindNode[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((n) => n && typeof n === "object" && typeof (n as MindNode).id === "string")
    .map((n) => {
      const node = { ...(n as MindNode) }
      if (typeof node.createdAt !== "number") {
        node.createdAt = LEGACY_NODE_TIME
      }
      if (node.completedAt === undefined) {
        node.completedAt = LEGACY_NODE_TIME
      }
      return node
    })
}

/** 迁移 / 新建默认族的统一命名 */
export const DEFAULT_FAMILY_NAME = "我的分类"

/** 默认族稳定 id：`fam_${categoryId}`（同一分类的迁移/兜底默认族固定此 id，避免重复补建） */
function defaultFamilyId(categoryId: string): string {
  return `fam_${categoryId}`
}

function isValidViewport(v: unknown): v is MindmapViewport {
  if (!v || typeof v !== "object") return false
  const p = v as Record<string, unknown>
  return (
    typeof p.x === "number" && Number.isFinite(p.x) &&
    typeof p.y === "number" && Number.isFinite(p.y) &&
    typeof p.zoom === "number" && Number.isFinite(p.zoom)
  )
}

function makeEmptyFamily(categoryId: string, name = DEFAULT_FAMILY_NAME): RelationFamily {
  return { id: defaultFamilyId(categoryId), name, categoryId, nodes: [], edges: [], view: "mindmap" }
}

/** 族规范化：id 必须非空字符串、categoryId 必须可归属，坏值兜底（nodes/edges/view/name/viewport） */
export function normalizeFamily(raw: unknown, fallbackCategoryId: string): RelationFamily | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== "string" || !r.id) return null
  const categoryId =
    typeof r.categoryId === "string" && r.categoryId ? r.categoryId : fallbackCategoryId
  if (!categoryId) return null
  const viewport = isValidViewport(r.viewport) ? r.viewport : undefined
  return {
    id: r.id,
    name: typeof r.name === "string" && r.name.trim() ? r.name : DEFAULT_FAMILY_NAME,
    categoryId,
    nodes: normalizeMindNodes(r.nodes),
    edges: Array.isArray(r.edges) ? (r.edges as MindEdge[]) : [],
    view: r.view === "list" ? "list" : "mindmap",
    ...(viewport ? { viewport } : {}),
  }
}

/** 关系族总迁移（TODO 54）：persist merge / 备份导入三处共用；新格式逐条规范化，旧格式 categories[].relation +
 * mindmapViewports 迁移为每分类一个默认族（id 稳定 `fam_${catId}`）后废弃原键。 */
export function migrateRelationState(
  rawCategories: unknown,
  rawFamilies: unknown,
  legacyViewports: unknown,
): { categories: Category[]; relationFamilies: Record<string, RelationFamily> } {
  const categories: Category[] = Array.isArray(rawCategories)
    ? (rawCategories as Category[]).filter(
        (c) => c && typeof c === "object" && typeof c.id === "string"
      )
    : []
  const families: Record<string, RelationFamily> = {}
  if (rawFamilies && typeof rawFamilies === "object" && !Array.isArray(rawFamilies)) {
    for (const val of Object.values(rawFamilies as Record<string, unknown>)) {
      const fam = normalizeFamily(val, "")
      if (fam) families[fam.id] = fam
    }
  }
  const catIds = new Set(categories.map((c) => c.id))
  // 孤儿族（归属分类已不存在）丢弃，避免占据存储且无处显示
  for (const [id, fam] of Object.entries(families)) {
    if (!catIds.has(fam.categoryId)) delete families[id]
  }
  // 旧格式迁移：Category.relation 单图 → 默认族（viewport 取 mindmapViewports[catId]）
  for (const c of categories) {
    const raw = c as unknown as Record<string, unknown>
    if (!("relation" in raw)) continue
    const legacy = raw.relation
    const famId = defaultFamilyId(c.id)
    if (legacy && typeof legacy === "object" && !families[famId]) {
      const l = legacy as Record<string, unknown>
      const lv =
        legacyViewports && typeof legacyViewports === "object"
          ? (legacyViewports as Record<string, unknown>)[c.id]
          : undefined
      const migrated = normalizeFamily(
        { id: famId, name: DEFAULT_FAMILY_NAME, categoryId: c.id, nodes: l.nodes, edges: l.edges, view: l.view, viewport: lv },
        c.id
      )
      if (migrated) families[famId] = migrated
    }
    delete raw.relation
  }
  // 兜底：每个 relation 分类至少一个族（空分类 / 迁移失败补默认空族）
  for (const c of categories) {
    if (c.template !== "relation") continue
    if (!Object.values(families).some((f) => f.categoryId === c.id)) {
      families[defaultFamilyId(c.id)] = makeEmptyFamily(c.id)
    }
  }
  // 内建「待办事项」relation 分类缺失则补建（含默认族「我的分类」）
  if (!catIds.has(BUILTIN_TODO_RELATIONS_CATEGORY_ID)) {
    categories.push({
      id: BUILTIN_TODO_RELATIONS_CATEGORY_ID,
      name: "待办事项",
      template: "relation",
      icon: "Workflow",
      config: {},
      builtin: true,
    })
  }
  if (
    !Object.values(families).some((f) => f.categoryId === BUILTIN_TODO_RELATIONS_CATEGORY_ID)
  ) {
    families[defaultFamilyId(BUILTIN_TODO_RELATIONS_CATEGORY_ID)] = makeEmptyFamily(
      BUILTIN_TODO_RELATIONS_CATEGORY_ID
    )
  }
  return { categories, relationFamilies: families }
}

/**
 * zustand persist 的 merge：旧存档 → 当前 schema 的总迁移入口。
 * 约定（AGENTS.md 红线 #1）：新增持久化字段必须在此给出「旧存档缺此字段」的兜底，
 * 回归断言见 tests/persist-merge.test.ts。
 */
export function mergePersistedState(
  persisted: unknown,
  current: WorkspaceState
): WorkspaceState {
  const p = { ...(persisted ?? {}) } as Partial<WorkspaceState> &
    Record<string, unknown>
  // TODO 54：旧版顶层 mindmapViewports 已迁入族 viewport，整体废弃不入 state
  delete p.mindmapViewports
  // 迁移：旧版「单一模型配置」（aiProvider/aiApiKey/aiBaseUrl/aiModel）转为多模型数组。
  // 旧快照里这些字段存在但 aiModels 不存在；新用户则 aiModels 为空、由首次配置补齐。
  const rawSettings = (p.settings as Record<string, unknown> | undefined) ?? {}
  let aiModels: AIModelEntry[] = Array.isArray(rawSettings.aiModels)
    ? (rawSettings.aiModels as AIModelEntry[])
    : []
  let aiActiveModelId: string | null =
    typeof rawSettings.aiActiveModelId === "string"
      ? rawSettings.aiActiveModelId
      : null
  if (aiModels.length === 0) {
    const legacyProvider = rawSettings.aiProvider as Settings["aiModels"][number]["provider"] | undefined
    const entry: AIModelEntry = {
      id: `m_${Date.now().toString(36)}`,
      label:
        legacyProvider && AI_PROVIDERS[legacyProvider]
          ? AI_PROVIDERS[legacyProvider].label
          : "默认模型",
      provider: legacyProvider ?? "zcode",
      apiKey: typeof rawSettings.aiApiKey === "string" ? rawSettings.aiApiKey : "",
      baseUrl: typeof rawSettings.aiBaseUrl === "string" ? rawSettings.aiBaseUrl : "",
      model: typeof rawSettings.aiModel === "string" ? rawSettings.aiModel : "",
    }
    aiModels = [entry]
    aiActiveModelId = entry.id
  }
  // 迁移：旧版单一人设字符串（aiPersona）升级为多人人设列表 + 全局选中。
  const persona = migratePersona(rawSettings)
  // 关系族（TODO 54）：规范化 / 迁移（旧格式 relation + mindmapViewports → 默认族），内建「待办事项」分类缺失时补建
  const relationState = migrateRelationState(p.categories, p.relationFamilies, persisted ? (persisted as Record<string, unknown>).mindmapViewports : undefined)
  return {
    ...current,
    ...p,
    categories: relationState.categories,
    relationFamilies: relationState.relationFamilies,
    // 跨组件跳族标记：不持久化生效
    pendingFamilyId: null,
    conversations: (p.conversations as Conversation[] | undefined) ?? [],
    activeConversationId:
      (p.activeConversationId as string | null | undefined) ?? null,
    // 贡献账本：旧存档无此字段 → 空数组（存量由 Profile 页「补算历史」补齐）
    contributions: Array.isArray(p.contributions)
      ? (p.contributions as Contribution[])
      : [],
    // GitHub 队列：旧存档无此字段 → 空数组
    issueQueue: Array.isArray(p.issueQueue)
      ? (p.issueQueue as IssueQueueItem[])
      : [],
    // 通讯录 / 自定义节日（TODO 48）：旧存档无此字段 → 空数组（TODO 48 前数据在 public/*.yml，由设置页按钮导入）
    contacts: Array.isArray(p.contacts) ? (p.contacts as Person[]) : [],
    customFestivals: Array.isArray(p.customFestivals)
      ? (p.customFestivals as FestivalDef[])
      : [],
    // 「问 AI 今日待办」会话存档：旧存档无此字段 / 坏值 → null（下次点击重新建会话）
    todayTodoAi:
      !!p.todayTodoAi &&
      typeof p.todayTodoAi === "object" &&
      typeof (p.todayTodoAi as Record<string, unknown>).dayKey === "string" &&
      typeof (p.todayTodoAi as Record<string, unknown>).conversationId === "string"
        ? (p.todayTodoAi as { dayKey: string; conversationId: string })
        : null,
    settings: {
      ...DEFAULT_SETTINGS,
      ...(rawSettings as Partial<Settings>),
      aiModels,
      aiActiveModelId,
      aiPersonas: persona.aiPersonas,
      aiActivePersonaId: persona.aiActivePersonaId,
      // 兜底：缺失 / 非法 → "04:00"
      dayStartOffset: normalizeDayStartOffset(rawSettings.dayStartOffset),
      // 兜底：旧存档 string[] 或坏值 → NotificationRepoConfig[]（每仓库套默认扫描类型）
      notificationRepos: normalizeNotificationRepos(rawSettings.notificationRepos),
      // 兜底：旧存档无此字段 / 坏值 → 默认（builtin 开、qq 关）
      notificationChannels: normalizeNotificationChannels(rawSettings.notificationChannels),
      // 兜底（TODO 49）：缺失 / 非布尔值 → 开启（仅显式 false 才关闭）
      scanAdaptive: rawSettings.scanAdaptive !== false,
      // 兜底：旧存档无此字段 / 非法 → 默认 QQ 中转地址
      qqRelayUrl: normalizeQqRelayUrl(rawSettings.qqRelayUrl),
      // 兜底（TODO 52）：缺失 / 非法 → 默认组件顺序（合法 id 去重 + 缺失补齐）
      profileWidgetOrder: normalizeProfileWidgetOrder(rawSettings.profileWidgetOrder),
      // 兜底（TODO 61）：缺失 / 非法 / 越界 → 默认 7 天
      birthdayBannerDays: normalizeBirthdayBannerDays(rawSettings.birthdayBannerDays),
      // 兜底（TODO 75）：缺失 / 非布尔值 → 开启（仅显式 false 才关闭）
      auroraBackground: rawSettings.auroraBackground !== false,
      // 兜底（TODO 40）：界面语言非法 → 默认中文
      uiLanguage: rawSettings.uiLanguage === "en" ? "en" : "zh",
    },
  }
}
