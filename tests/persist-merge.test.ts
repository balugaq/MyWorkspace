// persist merge 迁移的回归测试（TODO 83）：把 AGENTS.md 红线 #1「新增字段必须过 merge」
// 从文字约定变成机械检查。覆盖：旧版（v-1）存档全字段迁移 / 新存档 passthrough /
// settings 各 normalize 兜底 / 关系族旧格式迁移 / 坏值防御。
// 纯逻辑、无 DOM：mergePersistedState 及其依赖均已抽到 lib/persist-merge.ts（store.ts 仅做装配）。
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  mergePersistedState,
  migratePersona,
  normalizeFamily,
  migrateRelationState,
  LEGACY_NODE_TIME,
} from "../lib/persist-merge.ts"
import {
  DEFAULT_SETTINGS,
  DEFAULT_NOTIFICATION_SCAN_TYPES,
  DEFAULT_QQ_RELAY_URL,
  LEGACY_REPO_SCAN_SINCE,
  BUILTIN_TODO_RELATIONS_CATEGORY_ID,
} from "../lib/types.ts"
import { DEFAULT_DAY_START_OFFSET } from "../lib/contributions.ts"
import { AI_PROVIDERS } from "../lib/ai/providers.ts"

/** merge 的 current 参数：最小桩（避免测试 import store 本体；WorkspaceState 全量装配无意义） */
function makeCurrent() {
  return {
    settings: DEFAULT_SETTINGS,
    view: "ai-chat",
    hydrated: false,
    categories: [],
    relationFamilies: {},
  } as unknown as Parameters<typeof mergePersistedState>[1]
}

/** 旧版（v-1）综合存档：覆盖全部历史迁移路径的单一 fixture */
function makeLegacyArchive() {
  return {
    categories: [
      { id: "cat-novel", name: "小说", template: "novel", icon: "BookOpen", config: {}, builtin: false },
      {
        id: "cat-rel",
        name: "旧关系分类",
        template: "relation",
        icon: "Workflow",
        config: {},
        builtin: false,
        // 旧格式：分类内嵌单图 relation（TODO 54 前）
        relation: {
          nodes: [{ id: "n1", text: "旧节点" }],
          edges: [],
          view: "mindmap",
        },
      },
    ],
    // 旧版顶层视口表（TODO 54 后迁入族 viewport）
    mindmapViewports: { "cat-rel": { x: 10, y: 20, zoom: 0.5 } },
    settings: {
      theme: "dark",
      // 旧版单一模型配置四件套（无 aiModels）
      aiProvider: "deepseek",
      aiApiKey: "sk-legacy",
      aiBaseUrl: "https://api.deepseek.com/v1",
      aiModel: "deepseek-chat",
      // 旧版单一人设字符串
      aiPersona: "你是一个严谨的助手",
      dayStartOffset: "25:99", // 非法 → 默认 04:00
      notificationRepos: ["owner/repo"], // 旧版 string[] → config[]
      notificationChannels: { builtin: false, qq: true },
      scanAdaptive: false, // 显式 false 保留
      qqRelayUrl: "not-a-url", // 非法 → 默认中转地址
      profileWidgetOrder: ["bogus", "focus"], // 非法 id 丢弃 + 缺失补齐
      birthdayBannerDays: 999, // 越界 → 7
      auroraBackground: false, // 显式 false 保留
      uiLanguage: "fr", // 非法 → zh
    },
    // 坏值：dayKey 非字符串 → null
    todayTodoAi: { dayKey: 123 },
    // 故意缺失：conversations / contributions / issueQueue / contacts / customFestivals / relationFamilies
  }
}

describe("persist merge：旧版（v-1）存档迁移（TODO 83 / AGENTS.md 红线 #1）", () => {
  const result = mergePersistedState(makeLegacyArchive(), makeCurrent())

  it("顶层 mindmapViewports 废弃，不出现在 state", () => {
    assert.equal("mindmapViewports" in result, false)
  })

  it("旧格式 categories[].relation 迁为默认族（id 稳定 fam_<catId>），relation 键被删除", () => {
    const rel = result.categories.find((c) => c.id === "cat-rel")
    assert.ok(rel)
    assert.equal("relation" in rel, false)
    const fam = result.relationFamilies["fam_cat-rel"]
    assert.ok(fam, "默认族应存在")
    assert.equal(fam.categoryId, "cat-rel")
    assert.equal(fam.name, "我的分类")
    assert.equal(fam.nodes.length, 1)
    // 旧节点缺 createdAt/completedAt → 补齐 LEGACY_NODE_TIME
    assert.equal(fam.nodes[0].createdAt, LEGACY_NODE_TIME)
    assert.equal(fam.nodes[0].completedAt, LEGACY_NODE_TIME)
    // 顶层 mindmapViewports[catId] 迁入族 viewport
    assert.deepEqual(fam.viewport, { x: 10, y: 20, zoom: 0.5 })
  })

  it("内建「待办事项」分类与默认族在旧存档中补建", () => {
    assert.ok(result.categories.some((c) => c.id === BUILTIN_TODO_RELATIONS_CATEGORY_ID))
    const fam = result.relationFamilies[`fam_${BUILTIN_TODO_RELATIONS_CATEGORY_ID}`]
    assert.ok(fam)
    assert.equal(fam.categoryId, BUILTIN_TODO_RELATIONS_CATEGORY_ID)
    assert.deepEqual(fam.nodes, [])
  })

  it("孤儿族（归属分类不存在）被丢弃", () => {
    const out = migrateRelationState(
      [{ id: "cat-a", name: "A", template: "relation", icon: "W", config: {}, builtin: false }],
      { fam_ghost: { id: "fam_ghost", categoryId: "cat-gone", nodes: [], edges: [], view: "mindmap" } },
      undefined
    )
    assert.equal(out.relationFamilies["fam_ghost"], undefined)
    assert.ok(out.relationFamilies["fam_cat-a"])
  })

  it("旧版单一模型配置迁移为多模型数组（字段原样保留，active 指向新条目）", () => {
    assert.equal(result.settings.aiModels.length, 1)
    const m = result.settings.aiModels[0]
    assert.equal(m.provider, "deepseek")
    assert.equal(m.apiKey, "sk-legacy")
    assert.equal(m.baseUrl, "https://api.deepseek.com/v1")
    assert.equal(m.model, "deepseek-chat")
    assert.equal(m.label, AI_PROVIDERS.deepseek.label)
    assert.equal(result.settings.aiActiveModelId, m.id)
  })

  it("旧版单一人设字符串迁移为人设列表 + 全局选中", () => {
    assert.equal(result.settings.aiPersonas.length, 1)
    assert.equal(result.settings.aiPersonas[0].content, "你是一个严谨的助手")
    assert.equal(result.settings.aiActivePersonaId, result.settings.aiPersonas[0].id)
  })

  it("旧存档缺失的数组/引用字段回退为空默认", () => {
    assert.deepEqual(result.conversations, [])
    assert.equal(result.activeConversationId, null)
    assert.deepEqual(result.contributions, [])
    assert.deepEqual(result.issueQueue, [])
    assert.deepEqual(result.contacts, [])
    assert.deepEqual(result.customFestivals, [])
    // 不持久化生效的跨组件跳族标记
    assert.equal(result.pendingFamilyId, null)
  })

  it("todayTodoAi 坏值 → null", () => {
    assert.equal(result.todayTodoAi, null)
  })

  it("settings 各兜底：非法值归一，合法值保留", () => {
    const s = result.settings
    assert.equal(s.dayStartOffset, DEFAULT_DAY_START_OFFSET)
    assert.deepEqual(s.notificationRepos, [
      {
        repo: "owner/repo",
        scanTypes: { ...DEFAULT_NOTIFICATION_SCAN_TYPES },
        commitMonitorOnly: false,
        scanSince: LEGACY_REPO_SCAN_SINCE,
      },
    ])
    assert.deepEqual(s.notificationChannels, { builtin: false, qq: true })
    assert.equal(s.scanAdaptive, false)
    assert.equal(s.qqRelayUrl, DEFAULT_QQ_RELAY_URL)
    assert.deepEqual(s.profileWidgetOrder, ["focus", "weather", "date", "usage"])
    assert.equal(s.birthdayBannerDays, 7)
    assert.equal(s.auroraBackground, false)
    assert.equal(s.uiLanguage, "zh")
    // 未被迁移规则触及的原值透传
    assert.equal(s.theme, "dark")
  })

  it("current 中 persisted 未覆盖的字段保留", () => {
    assert.equal(result.view, "ai-chat")
  })
})

describe("persist merge：新存档 passthrough（迁移不得误伤合法新数据）", () => {
  const newArchive = {
    categories: [
      { id: "cat-a", name: "A", template: "relation", icon: "W", config: {}, builtin: false },
    ],
    relationFamilies: {
      fam_x: { id: "fam_x", categoryId: "cat-a", name: "自有族", nodes: [], edges: [], view: "list" as const },
    },
    settings: {
      ...DEFAULT_SETTINGS,
      aiModels: [{ id: "m1", label: "我的模型", provider: "zcode", apiKey: "k", baseUrl: "u", model: "mo" }],
      aiActiveModelId: "m1",
      aiPersonas: [{ id: "p1", name: "人设", content: "内容" }],
      aiActivePersonaId: "p1",
      dayStartOffset: "05:30",
      uiLanguage: "en",
      scanAdaptive: true,
      birthdayBannerDays: 14,
    },
    conversations: [{ id: "c1", title: "会话", messages: [], createdAt: 1, updatedAt: 1 }],
    activeConversationId: "c1",
    contributions: [{ id: "k1", amount: 2, type: "checkin", content: "签到", at: 1 }],
  }
  const result = mergePersistedState(newArchive, makeCurrent())

  it("已有 aiModels 原样保留，不合成新条目", () => {
    assert.equal(result.settings.aiModels.length, 1)
    assert.equal(result.settings.aiModels[0].id, "m1")
    assert.equal(result.settings.aiActiveModelId, "m1")
  })

  it("已有 aiPersonas 与选中保留", () => {
    assert.equal(result.settings.aiPersonas.length, 1)
    assert.equal(result.settings.aiActivePersonaId, "p1")
  })

  it("合法 settings 值不被兜底逻辑改写", () => {
    assert.equal(result.settings.dayStartOffset, "05:30")
    assert.equal(result.settings.uiLanguage, "en")
    assert.equal(result.settings.scanAdaptive, true)
    assert.equal(result.settings.birthdayBannerDays, 14)
  })

  it("conversations / contributions 原样透传", () => {
    assert.equal(result.conversations.length, 1)
    assert.equal(result.activeConversationId, "c1")
    assert.equal(result.contributions.length, 1)
  })

  it("新格式关系族原样保留（含自有族）", () => {
    assert.ok(result.relationFamilies["fam_x"])
    assert.equal(result.relationFamilies["fam_x"].view, "list")
  })
})

describe("migratePersona 单测", () => {
  it("旧字符串 → 单条人设 + 选中", () => {
    const out = migratePersona({ aiPersona: "旧人设" })
    assert.equal(out.aiPersonas.length, 1)
    assert.equal(out.aiPersonas[0].content, "旧人设")
    assert.equal(out.aiActivePersonaId, out.aiPersonas[0].id)
  })

  it("选中 id 不在列表中 → 复位 null", () => {
    const out = migratePersona({
      aiPersonas: [{ id: "p1", name: "x", content: "y" }],
      aiActivePersonaId: "ghost",
    })
    assert.equal(out.aiActivePersonaId, null)
  })

  it("无人设数据 → 空列表 + null", () => {
    const out = migratePersona({})
    assert.deepEqual(out.aiPersonas, [])
    assert.equal(out.aiActivePersonaId, null)
  })
})

describe("normalizeFamily 单测", () => {
  it("id 非字符串 → null", () => {
    assert.equal(normalizeFamily({ id: 42 }, "cat"), null)
    assert.equal(normalizeFamily(null, "cat"), null)
  })

  it("viewport 非法结构被丢弃", () => {
    const fam = normalizeFamily({ id: "f", categoryId: "c", viewport: { x: "a" } }, "c")
    assert.ok(fam)
    assert.equal("viewport" in fam, false)
  })

  it("nodes 非数组 → 空数组", () => {
    const fam = normalizeFamily({ id: "f", categoryId: "c", nodes: "nope" }, "c")
    assert.ok(fam)
    assert.deepEqual(fam.nodes, [])
  })
})
