// AI 对话领域切片（TODO 85）：会话（conversations）及其创建 / 选中 / 增删改，以及跨视图跳转触发
import type { StoreApi } from "zustand"
import type { WorkspaceState } from "../../store"
import type { Conversation } from "../../types"
import { uid } from "../shared"
import { parseDayStartOffset, todayKey } from "../../contributions"

type SetState = StoreApi<WorkspaceState>["setState"]
type GetState = StoreApi<WorkspaceState>["getState"]

export type AiSlice = Pick<
  WorkspaceState,
  | "conversations"
  | "activeConversationId"
  | "pendingAiQuery"
  | "todayTodoAi"
  | "createConversation"
  | "createConversationSilent"
  | "selectConversation"
  | "deleteConversation"
  | "renameConversation"
  | "togglePinConversation"
  | "setConversationMessages"
  | "askAiAbout"
  | "clearPendingAiQuery"
  | "askAiToday"
>

export const createAiSlice = (set: SetState, get: GetState): AiSlice => ({
  // AI 助手：默认无会话（视图挂载时若无会话则创建一个），不预置 activeConversationId
  conversations: [],
  activeConversationId: null,
  // 外部（如日历 DayDetail）触发的"打开 AI 闲聊并自动询问"：携带待发送 query；消费后清空（不持久化）。
  pendingAiQuery: null,
  // Profile「问 AI 今日待办」的会话存档（按 dayStartOffset 翻篇时间划分"今天"）：
  // 记录今天那次询问所在的会话 id，当天内重复点击直接复用该会话，跨天/会话被删后重建。
  todayTodoAi: null,

  createConversation: () => {
    const id = uid()
    const now = Date.now()
    const conv: Conversation = {
      id,
      title: "新对话",
      messages: [],
      createdAt: now,
      updatedAt: now,
    }
    set((s) => ({
      conversations: [conv, ...s.conversations],
      activeConversationId: id,
    }))
    return id
  },
  selectConversation: (id) => set({ activeConversationId: id }),
  // 后台静默新建会话（TODO 23 新闻精选用）：不切换 activeConversationId，不打断当前会话
  createConversationSilent: (title) => {
    const id = uid()
    const now = Date.now()
    const conv: Conversation = {
      id,
      title,
      messages: [],
      createdAt: now,
      updatedAt: now,
    }
    set((s) => ({ conversations: [conv, ...s.conversations] }))
    return id
  },
  deleteConversation: (id) =>
    set((s) => {
      const conversations = s.conversations.filter((c) => c.id !== id)
      const activeConversationId =
        s.activeConversationId === id
          ? (conversations[0]?.id ?? null)
          : s.activeConversationId
      return { conversations, activeConversationId }
    }),
  renameConversation: (id, title) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id
          ? { ...c, title: title.trim().slice(0, 10) || "新对话", updatedAt: Date.now() }
          : c,
      ),
    })),
  togglePinConversation: (id) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, pinned: !c.pinned } : c,
      ),
    })),
  setConversationMessages: (id, messages) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, messages, updatedAt: Date.now() } : c,
      ),
    })),
  // 由 AIChatWorkspace 在会话就绪后消费（send 后再 clearPendingAiQuery）
  askAiAbout: (text) => {
    get().createConversation()
    set({ view: "ai-chat", activeCategoryId: null, pendingAiQuery: text })
  },
  clearPendingAiQuery: () => set({ pendingAiQuery: null }),

  // Profile「问 AI 今日待办」：当天已有对应会话则直接打开该会话；否则新建会话发送并记录（按翻篇时间划分"今天"）
  askAiToday: (text) => {
    const s = get()
    const dayKey = todayKey(parseDayStartOffset(s.settings.dayStartOffset))
    const rec = s.todayTodoAi
    if (rec && rec.dayKey === dayKey && s.conversations.some((c) => c.id === rec.conversationId)) {
      s.selectConversation(rec.conversationId)
      set({ view: "ai-chat", activeCategoryId: null })
      return
    }
    const id = s.createConversation()
    set({
      view: "ai-chat",
      activeCategoryId: null,
      pendingAiQuery: text,
      todayTodoAi: { dayKey, conversationId: id },
    })
  },
})
