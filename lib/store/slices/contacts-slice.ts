// 通讯录 / 自定义节日领域切片（TODO 85 / 48）：联系人（contacts）与自定义节日（customFestivals）
import type { StoreApi } from "zustand"
import type { WorkspaceState } from "../../store"
import type { Person } from "../../types"
import { uid } from "../shared"

type SetState = StoreApi<WorkspaceState>["setState"]

export type ContactsSlice = Pick<
  WorkspaceState,
  | "contacts"
  | "customFestivals"
  | "setContacts"
  | "setCustomFestivals"
  | "addContact"
  | "updateContact"
  | "removeContact"
>

export const createContactsSlice = (set: SetState): ContactsSlice => ({
  // 通讯录 / 自定义节日（TODO 48）：由设置页「从 yml 导入」或界面新建填充
  contacts: [],
  customFestivals: [],

  // yml 导入：整表替换联系人
  setContacts: (items) => set({ contacts: items }),
  // yml 导入：整表替换自定义节日
  setCustomFestivals: (items) => set({ customFestivals: items }),
  // 新建联系人（空模板）：返回新条目 id，界面编辑器据此定位
  addContact: () => {
    const id = uid()
    set((s) => ({ contacts: [...s.contacts, { id, name: "新联系人" }] }))
    return id
  },
  updateContact: (id, patch) =>
    set((s) => ({
      contacts: s.contacts.map((p: Person) => (p.id === id ? { ...p, ...patch } : p)),
    })),
  removeContact: (id) =>
    set((s) => ({ contacts: s.contacts.filter((p: Person) => p.id !== id) })),
})
