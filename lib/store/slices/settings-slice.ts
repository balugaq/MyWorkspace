// 设置领域切片（TODO 85）：settings 及其更新 actions
import type { StoreApi } from "zustand"
import type { WorkspaceState } from "../../store"
import { DEFAULT_SETTINGS } from "../../types"

export type SettingsSlice = Pick<
  WorkspaceState,
  "settings" | "updateSettings" | "setShortcut"
>

type SetState = StoreApi<WorkspaceState>["setState"]

export const createSettingsSlice = (set: SetState): SettingsSlice => ({
  settings: DEFAULT_SETTINGS,

  updateSettings: (patch) =>
    set((s) => ({ settings: { ...s.settings, ...patch } })),

  setShortcut: (action, binding) =>
    set((s) => ({
      settings: {
        ...s.settings,
        shortcuts: { ...s.settings.shortcuts, [action]: binding },
      },
    })),
})
