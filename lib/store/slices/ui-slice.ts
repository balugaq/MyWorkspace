// UI / 导航领域切片（TODO 85）：视图切换、当前选中、弹窗开关、侧边栏/工具栏状态
import { format } from "date-fns"
import type { StoreApi } from "zustand"
import type { WorkspaceState } from "../../store"

export type UiSlice = Pick<
  WorkspaceState,
  | "view"
  | "activeCategoryId"
  | "activeItemId"
  | "selectedDate"
  | "addCategoryOpen"
  | "configEditorOpen"
  | "imagesOpen"
  | "calendarDetailWidth"
  | "sidebarWidth"
  | "sidebarCollapsed"
  | "sidebarToggleY"
  | "toolbarCollapsed"
  | "setActiveCategory"
  | "setActiveItem"
  | "goCalendar"
  | "goWorkspace"
  | "goContacts"
  | "goVault"
  | "goAIChat"
  | "goProfile"
  | "goSettings"
  | "goNotifications"
  | "goGithubQueue"
  | "goVocabulary"
  | "setSelectedDate"
  | "setAddCategoryOpen"
  | "setConfigEditorOpen"
  | "setImagesOpen"
  | "setCalendarDetailWidth"
  | "setSidebarWidth"
  | "setSidebarCollapsed"
  | "setSidebarToggleY"
  | "setToolbarCollapsed"
>

type SetState = StoreApi<WorkspaceState>["setState"]

export const createUiSlice = (set: SetState): UiSlice => ({
  view: "workspace",
  activeCategoryId: null,
  activeItemId: null,
  selectedDate: format(new Date(), "yyyy-MM-dd"),

  addCategoryOpen: false,
  configEditorOpen: false,
  imagesOpen: false,

  calendarDetailWidth: 384,

  sidebarWidth: 288,

  sidebarCollapsed: false,
  sidebarToggleY: null,
  toolbarCollapsed: false,

  setActiveCategory: (id) =>
    set({ activeCategoryId: id, activeItemId: null, view: "workspace" }),
  setActiveItem: (id) => set({ activeItemId: id, view: "workspace" }),
  goCalendar: () => set({ view: "calendar", activeCategoryId: null }),
  goWorkspace: () => set({ view: "workspace" }),
  goContacts: () => set({ view: "contacts", activeCategoryId: null }),
  goVault: () => set({ view: "vault", activeCategoryId: null }),
  goAIChat: () => set({ view: "ai-chat", activeCategoryId: null }),
  goProfile: () => set({ view: "profile", activeCategoryId: null }),
  goSettings: () => set({ view: "settings", activeCategoryId: null }),
  goNotifications: () =>
    set({ view: "notifications", activeCategoryId: null, lastReadNotificationsAt: Date.now() }),
  goGithubQueue: () => set({ view: "github-queue", activeCategoryId: null }),
  goVocabulary: () => set({ view: "vocabulary", activeCategoryId: null }),

  setSelectedDate: (date) => set({ selectedDate: date }),

  setAddCategoryOpen: (v) => set({ addCategoryOpen: v }),
  setConfigEditorOpen: (v) => set({ configEditorOpen: v }),
  setImagesOpen: (v) => set({ imagesOpen: v }),

  setCalendarDetailWidth: (w) => set({ calendarDetailWidth: w }),

  setSidebarWidth: (w) => set({ sidebarWidth: w }),

  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  setSidebarToggleY: (y) => set({ sidebarToggleY: y }),

  setToolbarCollapsed: (v) => set({ toolbarCollapsed: v }),
})
