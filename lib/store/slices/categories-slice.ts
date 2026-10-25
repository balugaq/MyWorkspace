// 分类领域切片（TODO 85）：随笔分类（categories）及其章节 / 增删改与默认族构建
import type { StoreApi } from "zustand"
import type { WorkspaceState } from "../../store"
import type { Category, Chapter, RelationFamily } from "../../types"
import { uid, buildTitle, iconForTemplate } from "../shared"
import { DEFAULT_FAMILY_NAME } from "../../persist-merge"

type SetState = StoreApi<WorkspaceState>["setState"]

export type CategoriesSlice = Pick<
  WorkspaceState,
  | "categories"
  | "addCategory"
  | "removeCategory"
  | "renameCategory"
  | "moveCategory"
  | "moveChapter"
  | "addChapter"
  | "updateChapter"
  | "removeChapter"
>

export const createCategoriesSlice = (set: SetState): CategoriesSlice => ({
  categories: [],

  addCategory: (name, template, config, count = 0) => {
    const id = uid()
    const cat: Category = {
      id,
      name,
      template,
      icon: iconForTemplate(template),
      config,
      builtin: false,
    }
    let newFamilies: Record<string, RelationFamily> | null = null
    if (template === "relation") {
      // TODO 54：relation 分类建一个默认族「我的分类」（图数据在 relationFamilies）
      const famId = `fam_${uid()}`
      newFamilies = {
        [famId]: {
          id: famId,
          name: DEFAULT_FAMILY_NAME,
          categoryId: id,
          nodes: [],
          edges: [],
          view: "mindmap",
        },
      }
    } else {
      const chapters: Chapter[] = []
      if (template === "novel" && count > 0) {
        for (let i = 0; i < count; i++) {
          chapters.push({
            id: uid(),
            index: i + 1,
            title: buildTitle(config, i + 1),
            content: "",
            tags: [],
          })
        }
      }
      cat.chapters = chapters
    }
    set((s) => ({
      categories: [...s.categories, cat],
      ...(newFamilies ? { relationFamilies: { ...s.relationFamilies, ...newFamilies } } : {}),
      activeCategoryId: id,
      activeItemId: null,
      view: "workspace",
    }))
    return id
  },

  removeCategory: (id) =>
    set((s) => {
      const categories = s.categories.filter((c) => c.id !== id)
      const activeCategoryId =
        s.activeCategoryId === id
          ? (categories[0]?.id ?? null)
          : s.activeCategoryId
      // 关系族连带删除（TODO 54）：删整个关系型分类 = 连带删掉其下所有族，
      // 族内全部节点的贡献账本一并清理（口径与 removeNode 一致）
      const relationFamilies: Record<string, RelationFamily> = {}
      const nodeIds: string[] = []
      for (const [fid, fam] of Object.entries(s.relationFamilies)) {
        if (fam.categoryId === id) {
          for (const n of fam.nodes) nodeIds.push(n.id)
        } else {
          relationFamilies[fid] = fam
        }
      }
      let contributions = s.contributions
      if (nodeIds.length > 0) {
        const prefixes = nodeIds.map((n) => `${n}:`)
        const kept = s.contributions.filter(
          (x) => !prefixes.some((p) => x.id.startsWith(p))
        )
        // 未命中则保持原引用，避免无谓重渲染
        if (kept.length !== s.contributions.length) contributions = kept
      }
      return {
        categories,
        activeCategoryId,
        activeItemId: null,
        contributions,
        relationFamilies,
      }
    }),

  renameCategory: (id, name) =>
    set((s) => ({
      categories: s.categories.map((c) =>
        c.id === id ? { ...c, name } : c
      ),
    })),

  moveCategory: (fromIndex, toIndex) =>
    set((s) => {
      const arr = [...s.categories]
      if (fromIndex < 0 || fromIndex >= arr.length || toIndex < 0 || toIndex >= arr.length) return s
      if (fromIndex === toIndex) return s
      const [item] = arr.splice(fromIndex, 1)
      arr.splice(toIndex, 0, item)
      return { categories: arr }
    }),

  // 重排章节后重算序号；仅当标题仍等于默认命名时才跟随新序号更新标题，避免覆盖用户自定义标题
  moveChapter: (catId, fromIndex, toIndex) =>
    set((s) => ({
      categories: s.categories.map((c) => {
        if (c.id !== catId || !c.chapters) return c
        const arr = [...c.chapters]
        if (fromIndex < 0 || fromIndex >= arr.length || toIndex < 0 || toIndex >= arr.length) return c
        if (fromIndex === toIndex) return c
        const [item] = arr.splice(fromIndex, 1)
        arr.splice(toIndex, 0, item)
        const next = arr.map((ch, i) => {
          if (ch.title === buildTitle(c.config, i + 1)) {
            return { ...ch, index: i + 1, title: buildTitle(c.config, i + 1) }
          }
          return { ...ch, index: i + 1 }
        })
        return { ...c, chapters: next }
      }),
    })),

  addChapter: (catId) =>
    set((s) => ({
      categories: s.categories.map((c) => {
        if (c.id !== catId || !c.chapters) return c
        const index =
          c.chapters.reduce((m, ch) => Math.max(m, ch.index), 0) + 1
        const chapter: Chapter = {
          id: uid(),
          index,
          title: buildTitle(c.config, index),
          content: "",
          tags: [],
        }
        return { ...c, chapters: [...c.chapters, chapter] }
      }),
    })),

  updateChapter: (catId, chapterId, patch) =>
    set((s) => ({
      categories: s.categories.map((c) =>
        c.id === catId && c.chapters
          ? {
              ...c,
              chapters: c.chapters.map((ch) =>
                ch.id === chapterId ? { ...ch, ...patch } : ch
              ),
            }
          : c
      ),
    })),

  removeChapter: (catId, chapterId) =>
    set((s) => ({
      categories: s.categories.map((c) =>
        c.id === catId && c.chapters
          ? {
              ...c,
              chapters: c.chapters.filter((ch) => ch.id !== chapterId),
            }
          : c
      ),
      activeItemId: s.activeItemId === chapterId ? null : s.activeItemId,
    })),
})
