// 关系族领域切片（TODO 85 / 54）：relationFamilies 及其节点 / 连线 / 视口 / 族的增删改
import type { StoreApi } from "zustand"
import type { WorkspaceState } from "../../store"
import type {
  MindNode,
  MindEdge,
  ConnectResult,
  RelationFamily,
} from "../../types"
import { uid } from "../shared"
import { imageIdsInText } from "../../image-refs"
import { CONTRIBUTION_AMOUNT } from "../../types"
import { DEFAULT_FAMILY_NAME } from "../../persist-merge"

type SetState = StoreApi<WorkspaceState>["setState"]
type GetState = StoreApi<WorkspaceState>["getState"]

export type RelationsSlice = Pick<
  WorkspaceState,
  | "relationFamilies"
  | "pendingFamilyId"
  | "addNode"
  | "addChildNode"
  | "updateNode"
  | "removeNode"
  | "setNodeSolution"
  | "connectNodes"
  | "removeEdge"
  | "removeSub"
  | "setFamilyView"
  | "setFamilyViewport"
  | "addRelationFamily"
  | "renameRelationFamily"
  | "deleteRelationFamily"
  | "moveRelationFamily"
  | "moveNodesToFamily"
  | "setPendingFamilyId"
>

export const createRelationsSlice = (set: SetState, get: GetState): RelationsSlice => ({
  // 关系族（TODO 54）：初始空（内建「待办事项」与旧数据迁移由 merge 的 migrateRelationState 补建）
  relationFamilies: {},
  // 跨组件跳转到指定族（如搬迁后跳转目标族）：消费后由组件置空；onRehydrateStorage 置 null（刷新不残留）
  pendingFamilyId: null,

  addNode: (familyId, position, title) => {
    const id = uid()
    const now = Date.now()
    const nodeTitle = title ?? "新节点"
    set((s) => {
      const fam = s.relationFamilies[familyId]
      // 目标族不存在：不建节点（保留 activeItemId 行为）
      if (!fam) return { activeItemId: id }
      const node: MindNode = {
        id,
        title: nodeTitle,
        content: "",
        cause: "",
        leadTo: "",
        result: "",
        sub: [],
        solution: null,
        position: position ?? {
          x: 200 + Math.random() * 200,
          y: 120 + Math.random() * 160,
        },
        createdAt: now,
        completedAt: null,
      }
      return {
        relationFamilies: {
          ...s.relationFamilies,
          [familyId]: { ...fam, nodes: [...fam.nodes, node] },
        },
        contributions: [
          ...s.contributions,
          {
            id: `${id}:created`,
            at: now,
            amount: CONTRIBUTION_AMOUNT["mindmap-node-created"],
            type: "mindmap-node-created",
            content: nodeTitle,
          },
        ],
        activeItemId: id,
      }
    })
    return id
  },

  // 末尾显式 setActiveItem(childId)：右键菜单路径下仅靠 addNode 的赋值会被菜单关闭后的焦点/点击时序覆盖
  addChildNode: (familyId, parentId) => {
    const s = get()
    const fam = s.relationFamilies[familyId]
    if (!fam) return null
    const parent = fam.nodes.find((n) => n.id === parentId)
    if (!parent) return null
    const base = parent.title?.trim() || "新节点"
    const existing = new Set(fam.nodes.map((n) => (n.title ?? "").trim()))
    let seq = 1
    while (existing.has(`${base} ${seq}`)) seq++
    const pos = parent.position ?? { x: 200, y: 120 }
    const childId = s.addNode(familyId, { x: pos.x + 300, y: pos.y }, `${base} ${seq}`)
    s.connectNodes(familyId, parentId, childId, "flow")
    s.setActiveItem(childId)
    return childId
  },

  updateNode: (familyId, nodeId, patch) =>
    set((s) => {
      const fam = s.relationFamilies[familyId]
      if (!fam) return {}
      const prev = fam.nodes.find((n) => n.id === nodeId)
      if (!prev) return {}

      const next = { ...prev, ...patch }
      // 切换完成态时同步记录完成时间：完成 = 现在，未完成 = null
      if ("done" in patch) {
        next.completedAt = patch.done ? Date.now() : null
      }
      // 单图缩放清理：内容变动后若图片不再恰好为 1 张，缩放失效并删除
      if (patch.content !== undefined) {
        if (imageIdsInText(patch.content).size !== 1) {
          delete next.imageZoom
        }
      }

      const relationFamilies = {
        ...s.relationFamilies,
        [familyId]: {
          ...fam,
          nodes: fam.nodes.map((n) => (n.id === nodeId ? next : n)),
        },
      }

      // 记账：仅当完成态「真正跃迁」时才写账本（拖拽 position / 图片缩放等 patch 不触发）
      let contributions = s.contributions
      if ("done" in patch && !!prev.done !== !!next.done) {
        const doneId = `${nodeId}:done`
        const withoutDone = contributions.filter((x) => x.id !== doneId)
        contributions = next.done
          ? [
              ...withoutDone,
              {
                id: doneId,
                at: Date.now(),
                amount: CONTRIBUTION_AMOUNT["mindmap-node-done"],
                type: "mindmap-node-done",
                content: next.title,
              },
            ]
          : withoutDone
      }

      return { relationFamilies, contributions }
    }),

  removeNode: (familyId, nodeId) =>
    set((s) => {
      const fam = s.relationFamilies[familyId]
      if (!fam) return {}
      return {
        relationFamilies: {
          ...s.relationFamilies,
          [familyId]: {
            ...fam,
            nodes: fam.nodes
              .filter((n) => n.id !== nodeId)
              .map((n) =>
                n.sub.includes(nodeId)
                  ? { ...n, sub: n.sub.filter((x) => x !== nodeId) }
                  : n
              ),
            edges: fam.edges.filter(
              (e) => e.source !== nodeId && e.target !== nodeId
            ),
          },
        },
        // 记账：删除节点 → 清掉该节点全部条（id 形如 `${nodeId}:created` / `${nodeId}:done`）。
        // 注：removeNode 非递归，子节点会存活（仅从父节点 sub 解绑），故只清本节点记录。
        contributions: s.contributions.filter((x) => !x.id.startsWith(`${nodeId}:`)),
        activeItemId: s.activeItemId === nodeId ? null : s.activeItemId,
      }
    }),

  setNodeSolution: (familyId, nodeId, content, status) =>
    set((s) => {
      const fam = s.relationFamilies[familyId]
      if (!fam) return {}
      return {
        relationFamilies: {
          ...s.relationFamilies,
          [familyId]: {
            ...fam,
            nodes: fam.nodes.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    solution: content.trim()
                      ? { content, status }
                      : null,
                  }
                : n
            ),
          },
        },
      }
    }),

  connectNodes: (familyId, source, target, kind) => {
    let result: ConnectResult = "invalid"
    set((s) => {
      const fam = s.relationFamilies[familyId]
      if (!fam) return s
      if (source === target) {
        result = "invalid"
        return s
      }
      const exists = fam.edges.some(
        (e) => e.source === source && e.target === target
      )
      if (exists) {
        result = "exists"
        return s
      }
      const edge: MindEdge = { id: uid(), source, target, kind }
      let nodes = fam.nodes
      if (kind === "sub") {
        nodes = nodes.map((n) =>
          n.id === source && !n.sub.includes(target)
            ? { ...n, sub: [...n.sub, target] }
            : n
        )
      }
      result = "created"
      return {
        relationFamilies: {
          ...s.relationFamilies,
          [familyId]: { ...fam, edges: [...fam.edges, edge], nodes },
        },
      }
    })
    return result
  },

  removeEdge: (familyId, edgeId) =>
    set((s) => {
      const fam = s.relationFamilies[familyId]
      if (!fam) return s
      const edge = fam.edges.find((e) => e.id === edgeId)
      const nodes =
        edge && edge.kind === "sub"
          ? fam.nodes.map((n) =>
              n.id === edge.source
                ? { ...n, sub: n.sub.filter((x) => x !== edge.target) }
                : n
            )
          : fam.nodes
      return {
        relationFamilies: {
          ...s.relationFamilies,
          [familyId]: {
            ...fam,
            edges: fam.edges.filter((e) => e.id !== edgeId),
            nodes,
          },
        },
      }
    }),

  removeSub: (familyId, nodeId, subId) =>
    set((s) => {
      const fam = s.relationFamilies[familyId]
      if (!fam) return {}
      return {
        relationFamilies: {
          ...s.relationFamilies,
          [familyId]: {
            ...fam,
            nodes: fam.nodes.map((n) =>
              n.id === nodeId
                ? { ...n, sub: n.sub.filter((x) => x !== subId) }
                : n
            ),
            edges: fam.edges.filter(
              (e) =>
                !(
                  e.kind === "sub" &&
                  e.source === nodeId &&
                  e.target === subId
                )
            ),
          },
        },
      }
    }),

  setFamilyView: (familyId, view) =>
    set((s) => {
      const fam = s.relationFamilies[familyId]
      if (!fam) return {}
      return {
        relationFamilies: {
          ...s.relationFamilies,
          [familyId]: { ...fam, view },
        },
      }
    }),

  setFamilyViewport: (familyId, viewport) =>
    set((s) => {
      const fam = s.relationFamilies[familyId]
      if (!fam) return {}
      // 值等守卫：视口数值没变就不写 store（xyflow 的 panZoom end / fitView 可能重复
      // 触发 onMoveEnd，无条件重建对象会让每次事件都变成一次重渲染，是死循环燃料）
      const prev = fam.viewport
      if (
        prev &&
        prev.x === viewport.x &&
        prev.y === viewport.y &&
        prev.zoom === viewport.zoom
      ) {
        return {}
      }
      return {
        relationFamilies: {
          ...s.relationFamilies,
          [familyId]: { ...fam, viewport },
        },
      }
    }),

  // 新建族：返回新族 id（默认命名「我的分类」）
  addRelationFamily: (categoryId, name) => {
    const id = `fam_${uid()}`
    set((s) => {
      // 名字防重（主人口径：同分类内不重名，重名自动追加「 n」，n 为最小正整数）
      // + 20 字上限；默认名同样参与防重
      const base = (name?.trim() || DEFAULT_FAMILY_NAME).slice(0, 20)
      const taken = new Set(
        Object.values(s.relationFamilies)
          .filter((f) => f.categoryId === categoryId)
          .map((f) => f.name),
      )
      let final = base
      for (let n = 2; taken.has(final); n++) final = `${base} ${n}`
      return {
        relationFamilies: {
          ...s.relationFamilies,
          [id]: {
            id,
            name: final,
            categoryId,
            nodes: [],
            edges: [],
            view: "mindmap",
          },
        },
      }
    })
    return id
  },

  renameRelationFamily: (familyId, name) =>
    set((s) => {
      const fam = s.relationFamilies[familyId]
      const next = name.trim().slice(0, 20)
      if (!fam || !next) return {}
      return {
        relationFamilies: {
          ...s.relationFamilies,
          [familyId]: { ...fam, name: next },
        },
      }
    }),

  // 删除族：清理族内全部节点的贡献账本记录
  deleteRelationFamily: (familyId) =>
    set((s) => {
      const fam = s.relationFamilies[familyId]
      if (!fam) return {}
      const relationFamilies: Record<string, RelationFamily> = {}
      for (const [fid, f] of Object.entries(s.relationFamilies)) {
        if (fid !== familyId) relationFamilies[fid] = f
      }
      // 清理族内全部节点的贡献账本记录（口径与 removeNode / removeCategory 一致）
      const prefixes = fam.nodes.map((n) => `${n.id}:`)
      const contributions = s.contributions.filter(
        (x) => !prefixes.some((p) => x.id.startsWith(p))
      )
      const activeItemId = fam.nodes.some((n) => n.id === s.activeItemId)
        ? null
        : s.activeItemId
      return { relationFamilies, contributions, activeItemId }
    }),

  // 调整族位置（TODO 69）：同分类族重排，其余分类族的 key 位置原样保留。
  // 顺序由 relationFamilies 的 key 插入顺序承载（消费方均按 categoryId 过滤），无需额外顺序字段。
  moveRelationFamily: (familyId, toIndex) =>
    set((s) => {
      const fam = s.relationFamilies[familyId]
      if (!fam) return {}
      const siblings = Object.entries(s.relationFamilies).filter(
        ([, f]) => f.categoryId === fam.categoryId
      )
      const fromIndex = siblings.findIndex(([fid]) => fid === familyId)
      if (fromIndex === -1) return {}
      const clamped = Math.max(0, Math.min(Math.trunc(toIndex), siblings.length))
      // toIndex 以原数组口径表述：向后插时移除自身后目标位左移一格
      const target = clamped > fromIndex ? clamped - 1 : clamped
      if (target === fromIndex) return {}
      const [moved] = siblings.splice(fromIndex, 1)
      siblings.splice(target, 0, moved)
      const relationFamilies: Record<string, RelationFamily> = {}
      let cursor = 0
      for (const [fid, f] of Object.entries(s.relationFamilies)) {
        if (f.categoryId === fam.categoryId) {
          const [nid, nf] = siblings[cursor++]
          relationFamilies[nid] = nf
        } else {
          relationFamilies[fid] = f
        }
      }
      return { relationFamilies }
    }),

  // 搬迁节点：只搬节点 + 两端都在搬移集合内的边（跨分类搬迁不改族归属字段以外的东西）
  moveNodesToFamily: (familyId, nodeIds, targetFamilyId) =>
    set((s) => {
      if (familyId === targetFamilyId) return {}
      const src = s.relationFamilies[familyId]
      const dst = s.relationFamilies[targetFamilyId]
      if (!src || !dst) return {}
      const moving = new Set(nodeIds)
      const movedNodes = src.nodes.filter((n) => moving.has(n.id))
      if (movedNodes.length === 0) return {}
      const movedIds = new Set(movedNodes.map((n) => n.id))
      const movedEdges = src.edges.filter(
        (e) => movedIds.has(e.source) && movedIds.has(e.target)
      )
      return {
        relationFamilies: {
          ...s.relationFamilies,
          [familyId]: {
            ...src,
            nodes: src.nodes.filter((n) => !movedIds.has(n.id)),
            edges: src.edges.filter((e) => !movedEdges.includes(e)),
          },
          [targetFamilyId]: {
            ...dst,
            nodes: [...dst.nodes, ...movedNodes],
            edges: [...dst.edges, ...movedEdges],
          },
        },
      }
    }),

  setPendingFamilyId: (id) => set({ pendingFamilyId: id }),
})
