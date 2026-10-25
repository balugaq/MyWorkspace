// 标签库领域切片（TODO 85 / 67）：全局标签库 knownTags 与全站标签重命名 / 删除
import type { StoreApi } from "zustand"
import type { WorkspaceState } from "../../store"
import type { RelationFamily, Person } from "../../types"
import { dedupeTags } from "../shared"

type SetState = StoreApi<WorkspaceState>["setState"]
type GetState = StoreApi<WorkspaceState>["getState"]

export type TagsSlice = Pick<
  WorkspaceState,
  | "knownTags"
  | "addKnownTags"
  | "renameTag"
  | "deleteTag"
>

export const createTagsSlice = (set: SetState, get: GetState): TagsSlice => ({
  // 全局标签库：容纳从联系人 roles 等外部来源导入的标签，供 TagPicker 复用
  knownTags: [],

  // 全局标签库：并入去重后的标签，已存在则忽略
  addKnownTags: (tags) =>
    set((s) => {
      const existing = new Set(s.knownTags.map((t) => t.trim().toLowerCase()))
      const additions = tags
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && !existing.has(t.toLowerCase()))
      if (additions.length === 0) return {}
      return { knownTags: [...s.knownTags, ...additions] }
    }),

  // 全站重命名标签（TODO 67）：「先算后写」——在 set 外遍历四个数据域算出新值与计数，
  // 无任何变更时不触发 set。目标名已被其他标签占用时替换后去重，即自然合并。
  renameTag: (from, to) => {
    const s = get()
    const f = from.trim()
    const t = to.trim()
    if (!f || !t || f === t) return 0
    let changed = 0
    // 泛型保持入参类型：章节 tags 为必有 string[]，节点/联系人 roles 为可选项
    const swapTags = <T extends string[] | undefined>(tags: T): T => {
      if (!tags || !tags.some((x) => x === f)) return tags
      changed++
      return dedupeTags(tags.map((x) => (x === f ? t : x))) as T
    }
    let catsTouched = false
    const categories = s.categories.map((cat) => {
      if (!cat.chapters) return cat
      let touched = false
      const chapters = cat.chapters.map((ch) => {
        const tags = swapTags(ch.tags)
        if (tags === ch.tags) return ch
        touched = true
        return { ...ch, tags }
      })
      if (!touched) return cat
      catsTouched = true
      return { ...cat, chapters }
    })
    const relationFamilies: Record<string, RelationFamily> = { ...s.relationFamilies }
    let famsTouched = false
    for (const [fid, fam] of Object.entries(s.relationFamilies)) {
      let touched = false
      const nodes = fam.nodes.map((n) => {
        const tags = swapTags(n.tags)
        if (tags === n.tags) return n
        touched = true
        return { ...n, tags }
      })
      if (touched) {
        relationFamilies[fid] = { ...fam, nodes }
        famsTouched = true
      }
    }
    const contactsArr: Person[] = []
    let contactsTouched = false
    for (const p of s.contacts) {
      const roles = swapTags(p.roles)
      if (roles === p.roles) contactsArr.push(p)
      else {
        contactsArr.push({ ...p, roles })
        contactsTouched = true
      }
    }
    const knownHasTo = s.knownTags.some((x) => x === t)
    const knownTags = dedupeTags([...s.knownTags.filter((x) => x !== f), ...(knownHasTo ? [] : [t])])
    const knownTouched = s.knownTags.some((x) => x === f) || !knownHasTo
    if (!catsTouched && !famsTouched && !contactsTouched && !knownTouched) return changed
    set({
      ...(catsTouched ? { categories } : {}),
      ...(famsTouched ? { relationFamilies } : {}),
      ...(contactsTouched ? { contacts: contactsArr } : {}),
      ...(knownTouched ? { knownTags } : {}),
    })
    return changed
  },

  // 全站删除标签（TODO 67）：四个数据域移除该标签；计数口径 = 使用处（章节/节点/联系人），标签库条目静默移除
  deleteTag: (name) => {
    const s = get()
    const f = name.trim()
    if (!f) return 0
    let removed = 0
    // 泛型保持入参类型：章节 tags 为必有 string[]，节点/联系人 roles 为可选项
    const stripTags = <T extends string[] | undefined>(tags: T): T => {
      if (!tags || !tags.some((x) => x === f)) return tags
      removed++
      return tags.filter((x) => x !== f) as T
    }
    let catsTouched = false
    const categories = s.categories.map((cat) => {
      if (!cat.chapters) return cat
      let touched = false
      const chapters = cat.chapters.map((ch) => {
        const tags = stripTags(ch.tags)
        if (tags === ch.tags) return ch
        touched = true
        return { ...ch, tags }
      })
      if (!touched) return cat
      catsTouched = true
      return { ...cat, chapters }
    })
    const relationFamilies: Record<string, RelationFamily> = { ...s.relationFamilies }
    let famsTouched = false
    for (const [fid, fam] of Object.entries(s.relationFamilies)) {
      let touched = false
      const nodes = fam.nodes.map((n) => {
        const tags = stripTags(n.tags)
        if (tags === n.tags) return n
        touched = true
        return { ...n, tags }
      })
      if (touched) {
        relationFamilies[fid] = { ...fam, nodes }
        famsTouched = true
      }
    }
    const contactsArr: Person[] = []
    let contactsTouched = false
    for (const p of s.contacts) {
      const roles = stripTags(p.roles)
      if (roles === p.roles) contactsArr.push(p)
      else {
        contactsArr.push({ ...p, roles })
        contactsTouched = true
      }
    }
    const knownTouched = s.knownTags.some((x) => x === f)
    const knownTags = s.knownTags.filter((x) => x !== f)
    if (!catsTouched && !famsTouched && !contactsTouched && !knownTouched) return removed
    set({
      ...(catsTouched ? { categories } : {}),
      ...(famsTouched ? { relationFamilies } : {}),
      ...(contactsTouched ? { contacts: contactsArr } : {}),
      ...(knownTouched ? { knownTags } : {}),
    })
    return removed
  },
})
