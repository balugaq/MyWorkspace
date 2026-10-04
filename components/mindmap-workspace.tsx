"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  useReactFlow,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type OnSelectionChangeParams,
  ReactFlowProvider,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {
  Plus,
  Workflow,
  List,
  Pin,
  Lightbulb,
  Eye,
  EyeOff,
  Layers,
  Pencil,
  Trash2,
  Sparkles,
  Wand2,
} from "lucide-react"
import { toast } from "sonner"
import { useWorkspace } from "@/lib/store"
import type { Category, MindNode, RelationFamily } from "@/lib/types"
import { STATUS_META } from "@/lib/types"
import { isPristineNode } from "@/lib/mindmap"
import { relayoutFamilyNodes } from "@/lib/ai/relayout"
import { useEscapeClose } from "@/hooks/use-escape-close"
import { TodoNode, SolutionNode } from "@/components/mindmap/nodes"
import { NodeInspector } from "@/components/mindmap/node-inspector"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const nodeTypes = { todo: TodoNode, solution: SolutionNode }

export function MindmapWorkspace({ category }: { category: Category }) {
  // 关系族（TODO 54）：当前分类下的所有族；当前族为组件内 state（默认第一个族）
  const relationFamilies = useWorkspace((s) => s.relationFamilies)
  const pendingFamilyId = useWorkspace((s) => s.pendingFamilyId)
  const setPendingFamilyId = useWorkspace((s) => s.setPendingFamilyId)
  const setFamilyView = useWorkspace((s) => s.setFamilyView)

  const families = useMemo(
    () => Object.values(relationFamilies).filter((f) => f.categoryId === category.id),
    [relationFamilies, category.id],
  )
  const [activeFamilyId, setActiveFamilyId] = useState<string | null>(null)
  const family = families.find((f) => f.id === activeFamilyId) ?? families[0] ?? null

  // 消费跨组件跳族标记（如搬迁后跳转到目标分类并选中目标族）
  useEffect(() => {
    if (pendingFamilyId && families.some((f) => f.id === pendingFamilyId)) {
      setActiveFamilyId(pendingFamilyId)
      setPendingFamilyId(null)
    }
  }, [pendingFamilyId, families, setPendingFamilyId])

  // 当前族被删除时回落到第一个族
  useEffect(() => {
    if (activeFamilyId && !families.some((f) => f.id === activeFamilyId)) {
      setActiveFamilyId(null)
    }
  }, [activeFamilyId, families])

  const view = family?.view ?? "mindmap"

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
        <h1 className="font-serif text-lg font-semibold">{category.name}</h1>
        {family && (
          <div className="flex items-center rounded-lg border p-0.5">
            <ViewBtn
              active={view === "mindmap"}
              onClick={() => setFamilyView(family.id, "mindmap")}
            >
              <Workflow className="size-3.5" />
              思维导图
            </ViewBtn>
            <ViewBtn
              active={view === "list"}
              onClick={() => setFamilyView(family.id, "list")}
            >
              <List className="size-3.5" />
              列表
            </ViewBtn>
          </div>
        )}
        <div className="flex-1" />
      </div>

      <div className="min-h-0 flex-1">
        {view === "mindmap" ? (
          family ? (
            <ReactFlowProvider>
              <Canvas
                category={category}
                family={family}
                families={families}
                onSelectFamily={setActiveFamilyId}
              />
            </ReactFlowProvider>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              该分类下还没有关系族。
            </div>
          )
        ) : family ? (
          <ListView family={family} />
        ) : null}
      </div>
    </div>
  )
}

function ViewBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

// ---------------- 族 sidebar（TODO 54：图内显示范围内，列出/切换/新建/重命名/删除族 + AI 入口） ----------------

function FamilySidebar({
  category,
  family,
  families,
  onSelect,
}: {
  category: Category
  family: RelationFamily
  families: RelationFamily[]
  onSelect: (id: string) => void
}) {
  const addRelationFamily = useWorkspace((s) => s.addRelationFamily)
  const renameRelationFamily = useWorkspace((s) => s.renameRelationFamily)
  const deleteRelationFamily = useWorkspace((s) => s.deleteRelationFamily)
  const askAiAbout = useWorkspace((s) => s.askAiAbout)

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState("")
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState("")
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null)
  const [relayoutBusy, setRelayoutBusy] = useState(false)

  const commitAdd = () => {
    const id = addRelationFamily(category.id, newName.trim() || undefined)
    setAdding(false)
    setNewName("")
    onSelect(id)
    toast.success("已新建关系族")
  }

  const commitRename = () => {
    if (renamingId && renameDraft.trim()) {
      renameRelationFamily(renamingId, renameDraft)
    }
    setRenamingId(null)
    setRenameDraft("")
  }

  // AI 分析（只读）：askAiAbout 新建会话并携带族上下文，AI 用既有只读技能拉数据出报告
  const handleAiAnalyze = () => {
    const prompt =
      `请分析「${category.name}」分类下关系族「${family.name}」的思维导图（共 ${family.nodes.length} 个节点、${family.edges.length} 条连线）。` +
      `请用 wb_get_mindmap_graph 技能获取节点与连线结构（categoryId "${category.id}"，familyId "${family.id}"），` +
      `必要时用 wb_get_mindmap_node 查看节点详情，` +
      `然后输出结构分析报告：任务依赖与层级是否合理、孤立节点、循环依赖、可合并/拆分的节点、下一步建议。`
    askAiAbout(prompt)
  }

  // AI 整理布局（写操作）：函数式调用 + JSON 解析落库，失败 toast 不落库
  const handleRelayout = async () => {
    if (relayoutBusy) return
    setRelayoutBusy(true)
    try {
      const n = await relayoutFamilyNodes(family.id)
      toast.success(`AI 已重排 ${n} 个节点位置`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI 整理布局失败")
    } finally {
      setRelayoutBusy(false)
    }
  }

  return (
    <div className="flex w-48 shrink-0 flex-col border-r bg-card/50">
      <div className="flex items-center gap-1.5 border-b px-3 py-2.5">
        <Layers className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground">关系族</span>
        <button
          type="button"
          title="新建族"
          aria-label="新建族"
          onClick={() => {
            setAdding(true)
            setNewName("")
          }}
          className="ml-auto flex size-5 items-center justify-center rounded transition-colors hover:bg-primary/10"
        >
          <Plus className="size-3.5 text-muted-foreground" />
        </button>
      </div>

      <div className="native-scroll min-h-0 flex-1 overflow-auto p-1.5">
        {adding && (
          <div className="mb-1 flex items-center gap-1 px-1">
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  commitAdd()
                } else if (e.key === "Escape") {
                  e.preventDefault()
                  setAdding(false)
                }
              }}
              placeholder="族名称"
              className="h-7 text-xs"
            />
          </div>
        )}
        {families.map((f) => (
          <div
            key={f.id}
            className={cn(
              "group flex items-center gap-1 rounded-md px-2 py-1.5 text-xs transition-colors",
              f.id === family.id
                ? "bg-primary/10 font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            {renamingId === f.id ? (
              <input
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    commitRename()
                  } else if (e.key === "Escape") {
                    e.preventDefault()
                    setRenamingId(null)
                  }
                }}
                className="h-6 min-w-0 flex-1 rounded border bg-background px-1.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onSelect(f.id)}
                  className="min-w-0 flex-1 truncate text-left"
                  title={f.name}
                >
                  {f.name}
                </button>
                <button
                  type="button"
                  title="重命名"
                  aria-label="重命名族"
                  onClick={(e) => {
                    e.stopPropagation()
                    setRenamingId(f.id)
                    setRenameDraft(f.name)
                  }}
                  className="hidden size-4 shrink-0 items-center justify-center rounded group-hover:flex hover:bg-primary/10"
                >
                  <Pencil className="size-3 text-muted-foreground" />
                </button>
                <button
                  type="button"
                  title="删除族"
                  aria-label="删除族"
                  onClick={(e) => {
                    e.stopPropagation()
                    setConfirmDelId(f.id)
                  }}
                  className="hidden size-4 shrink-0 items-center justify-center rounded group-hover:flex hover:bg-destructive/10"
                >
                  <Trash2 className="size-3 text-destructive" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5 border-t p-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-full gap-1.5 text-xs"
          onClick={handleAiAnalyze}
        >
          <Sparkles className="size-3.5" />
          AI 分析
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-full gap-1.5 text-xs"
          onClick={handleRelayout}
          disabled={relayoutBusy || family.nodes.length === 0}
        >
          <Wand2 className={cn("size-3.5", relayoutBusy && "animate-pulse")} />
          {relayoutBusy ? "整理中…" : "整理布局"}
        </Button>
      </div>

      {/* 删除族确认：ESC 视为取消（与其它弹窗行为一致） */}
      <AlertDialog
        open={confirmDelId !== null}
        onOpenChange={(v) => !v && setConfirmDelId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              删除关系族「
              {families.find((f) => f.id === confirmDelId)?.name || "未命名"}」？
            </AlertDialogTitle>
            <AlertDialogDescription>
              将删除该族及其下全部节点与连线，并清理对应贡献记录。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDelId(null)}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelId) deleteRelationFamily(confirmDelId)
                setConfirmDelId(null)
                toast.success("已删除关系族")
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------------- 搬迁弹窗（TODO 54） ----------------

function MoveNodesDialog({
  open,
  nodeIds,
  category,
  currentFamily,
  onClose,
}: {
  open: boolean
  nodeIds: string[]
  category: Category
  currentFamily: RelationFamily
  onClose: () => void
}) {
  const relationFamilies = useWorkspace((s) => s.relationFamilies)
  const categories = useWorkspace((s) => s.categories)
  const moveNodesToFamily = useWorkspace((s) => s.moveNodesToFamily)
  const addRelationFamily = useWorkspace((s) => s.addRelationFamily)
  const setActiveCategory = useWorkspace((s) => s.setActiveCategory)
  const setPendingFamilyId = useWorkspace((s) => s.setPendingFamilyId)

  const allFamilies = useMemo(() => Object.values(relationFamilies), [relationFamilies])
  const sameCatFams = useMemo(
    () => allFamilies.filter((f) => f.categoryId === category.id),
    [allFamilies, category.id],
  )
  const otherRelCats = useMemo(
    () => categories.filter((c) => c.template === "relation" && c.id !== category.id),
    [categories, category.id],
  )

  const [target, setTarget] = useState<string | null>(null)
  const [newName, setNewName] = useState("")

  // 每次打开重置选择
  useEffect(() => {
    if (open) {
      setTarget(null)
      setNewName("")
    }
  }, [open])

  const createInline = () => {
    const id = addRelationFamily(category.id, newName.trim() || undefined)
    setNewName("")
    setTarget(id)
  }

  const confirm = () => {
    if (!target || target === currentFamily.id) return
    moveNodesToFamily(currentFamily.id, nodeIds, target)
    const dst = allFamilies.find((f) => f.id === target)
    if (dst && dst.categoryId !== category.id) {
      // 跨分类搬迁：跳到目标分类并选中目标族
      setActiveCategory(dst.categoryId)
      setPendingFamilyId(target)
    }
    toast.success(`已搬迁 ${nodeIds.length} 个节点`)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>搬迁 {nodeIds.length} 个节点</DialogTitle>
          <DialogDescription>
            选择目标关系族；搬迁只移动节点，两端都被选中的连线会一并随迁。
          </DialogDescription>
        </DialogHeader>

        <div className="native-scroll flex max-h-[55vh] flex-col gap-3 overflow-auto pr-1">
          {/* 当前分类的族 */}
          <section className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              「{category.name}」的关系族
            </p>
            {sameCatFams.map((f) => {
              const isCurrent = f.id === currentFamily.id
              return (
                <button
                  key={f.id}
                  type="button"
                  disabled={isCurrent}
                  onClick={() => setTarget(f.id)}
                  className={cn(
                    "flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    isCurrent
                      ? "cursor-not-allowed border-border/60 bg-muted/40 text-muted-foreground/60"
                      : target === f.id
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-foreground hover:border-primary/50"
                  )}
                >
                  {f.name}
                  {isCurrent && <span className="text-xs">当前所在</span>}
                </button>
              )
            })}
            {/* 就地新建族 */}
            <div className="flex items-center gap-1.5">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    createInline()
                  }
                }}
                placeholder="新建族名称…"
                className="h-8 flex-1 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-xs"
                onClick={createInline}
              >
                <Plus className="size-3.5" />
                新建
              </Button>
            </div>
          </section>

          {/* 搬迁至其他图 */}
          {otherRelCats.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">搬迁至其他图</p>
              {otherRelCats.map((c) => (
                <div key={c.id} className="flex flex-col gap-1">
                  <p className="px-1 text-[11px] text-muted-foreground/80">{c.name}</p>
                  {allFamilies
                    .filter((f) => f.categoryId === c.id)
                    .map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setTarget(f.id)}
                        className={cn(
                          "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                          target === f.id
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border text-foreground hover:border-primary/50"
                        )}
                      >
                        <Workflow className="size-3.5 shrink-0 text-muted-foreground" />
                        {f.name}
                      </button>
                    ))}
                </div>
              ))}
            </section>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={confirm} disabled={!target || target === currentFamily.id}>
            搬迁
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- 画布 ----------------

function Canvas({
  category,
  family,
  families,
  onSelectFamily,
}: {
  category: Category
  family: RelationFamily
  families: RelationFamily[]
  onSelectFamily: (id: string) => void
}) {
  const activeItemId = useWorkspace((s) => s.activeItemId)
  const setActiveItem = useWorkspace((s) => s.setActiveItem)
  const addNode = useWorkspace((s) => s.addNode)
  const addChildNode = useWorkspace((s) => s.addChildNode)
  const updateNode = useWorkspace((s) => s.updateNode)
  const connectNodes = useWorkspace((s) => s.connectNodes)
  const removeEdge = useWorkspace((s) => s.removeEdge)
  const removeNode = useWorkspace((s) => s.removeNode)
  // 上次浏览视口存档（TODO 54 起存于族内）：有有效存档则重挂载后恢复（否则初始 fitView 自适应）
  const savedViewport = useWorkspace((s) => s.relationFamilies[family.id]?.viewport)
  const setFamilyViewport = useWorkspace((s) => s.setFamilyViewport)
  const restoredViewport =
    savedViewport &&
    Number.isFinite(savedViewport.x) &&
    Number.isFinite(savedViewport.y) &&
    Number.isFinite(savedViewport.zoom)
      ? savedViewport
      : undefined
  const { screenToFlowPosition, fitView } = useReactFlow()
  const canvasWrapRef = useRef<HTMLDivElement>(null)

  // 多选选区（TODO 54：React Flow 默认 Shift+左键拖框选；右键菜单批量项作用于该选区）
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    setSelectedIds(new Set())
  }, [family.id])
  // 稳定引用 + 内容相同返回旧 Set：xyflow 的 SelectionListener 把 onSelectionChange prop
  // 放进了 effect 依赖，内联函数（每次渲染新引用）会造成 setState→渲染→再触发的死循环
  const handleSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    setSelectedIds((prev) => {
      const next = new Set(
        params.nodes.map((n) => n.id).filter((id) => !id.startsWith("sol-")),
      )
      if (prev.size === next.size && [...prev].every((id) => next.has(id))) return prev
      return next
    })
  }, [])

  // 鸟瞰模式：允许无限缩小（默认 minZoom=0.5 限制缩小），并禁用拖拽/连线避免缩很小误触
  const [birdView, setBirdView] = useState(false)
  // 仅在 birdView 真实变化（进/出鸟瞰）时才 fitView：首次挂载与 dev StrictMode 双挂载都跳过，
  // 否则 fitView 动画会覆盖 defaultViewport 恢复的视口存档（先到位、稍后被拉回原点）
  const prevBirdViewRef = useRef<boolean | null>(null)
  useEffect(() => {
    const prev = prevBirdViewRef.current
    prevBirdViewRef.current = birdView
    if (prev === null || prev === birdView) return
    fitView({ padding: 0.2, duration: 300 })
  }, [birdView, fitView])

  // 在画面中心新建节点
  const addAtCenter = useCallback(() => {
    const el = canvasWrapRef.current
    if (el) {
      const r = el.getBoundingClientRect()
      const center = screenToFlowPosition({
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
      })
      addNode(family.id, center)
    } else {
      addNode(family.id)
    }
    toast.success("已添加节点，右侧编辑详情")
  }, [screenToFlowPosition, addNode, family.id])

  // 是否正在从节点手柄拖拽连线（拖拽中不播放连线动画，松手后再播放）
  const [isConnecting, setIsConnecting] = useState(false)

  // 已折叠（隐藏其子任务子树）的节点 id 集合，纯视图态，不持久化
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // 计算所有被折叠节点直接/间接隐藏的子任务
  const hidden = useMemo(() => {
    const res = new Set<string>()
    const visit = (id: string) => {
      for (const subId of family.nodes.find((n) => n.id === id)?.sub ?? []) {
        if (!res.has(subId)) {
          res.add(subId)
          visit(subId)
        }
      }
    }
    for (const id of collapsed) visit(id)
    return res
  }, [collapsed, family.nodes])

  const selectedNode = family.nodes.find((n) => n.id === activeItemId) ?? null

  // 单图缩放的右下角实时倍数显示：缩放中可见，停止后淡出。
  const [zoomBadge, setZoomBadge] = useState<{ value: number; visible: boolean } | null>(null)
  const zoomHideTimer = useRef<number | undefined>(undefined)
  const zoomPersist = useRef<{ id: string; value: number } | null>(null)
  const zoomPersistTimer = useRef<number | undefined>(undefined)
  const handleImageZoom = useCallback(
    (nodeId: string, value: number) => {
      setZoomBadge({ value, visible: true })
      if (zoomHideTimer.current) window.clearTimeout(zoomHideTimer.current)
      zoomHideTimer.current = window.setTimeout(() => {
        setZoomBadge((b) => (b ? { ...b, visible: false } : b))
      }, 700)
      // 节流写回 store：最后一次滚轮 250ms 后才落盘，避免每帧都写 localStorage
      zoomPersist.current = { id: nodeId, value }
      if (zoomPersistTimer.current) window.clearTimeout(zoomPersistTimer.current)
      zoomPersistTimer.current = window.setTimeout(() => {
        const p = zoomPersist.current
        if (p) updateNode(family.id, p.id, { imageZoom: p.value })
      }, 250)
    },
    [updateNode, family.id],
  )
  useEffect(() => {
    return () => {
      if (zoomHideTimer.current) window.clearTimeout(zoomHideTimer.current)
      if (zoomPersistTimer.current) window.clearTimeout(zoomPersistTimer.current)
    }
  }, [])

  // 节点右键菜单动作（由 TodoNode 上报，此处统一执行 store 变更）。
  // TODO 54：多选态（右键节点在选区内且选区 >1）时，除「添加子节点」外的项批量套用到整个选区。
  const handleMenuAction = useCallback(
    (nodeId: string, action: string) => {
      const isBatch = selectedIds.size > 1 && selectedIds.has(nodeId)
      const batchIds = isBatch ? [...selectedIds] : [nodeId]
      const targets = family.nodes.filter((n) => batchIds.includes(n.id))
      if (targets.length === 0) return

      if (action === "move") {
        setMoveIds(batchIds)
        return
      }
      if (action === "add-child") {
        // 仅单选态出现；走 store 统一入口（与 NodeInspector.handleAddChild 同一逻辑）
        const childId = addChildNode(family.id, nodeId)
        if (childId) {
          // 右键菜单关闭时 base-ui 会把焦点还给节点触发器，随后的点击/选区时序可能
          // 把 addNode 里设置的 activeItemId 覆盖掉（这正是「添加后不切详情」的根因），
          // 延后一拍重新断言，确保详情面板稳定切到新节点。
          window.setTimeout(() => setActiveItem(childId), 0)
        }
        return
      }
      if (action === "toggle-done") {
        // 批量口径：选区内有未完成 → 全部标记完成；否则全部取消完成。
        // done 跃迁时 updateNode 内部自动记录贡献账 / completedAt
        const nextDone = targets.some((n) => !n.done)
        for (const n of targets) {
          updateNode(family.id, n.id, { done: nextDone })
        }
        toast.success(
          nextDone
            ? `已标记 ${targets.length} 个节点完成`
            : `已取消 ${targets.length} 个节点的完成态`
        )
        return
      }
      if (action === "long-term") {
        const nextVal = targets.length === 1 ? !targets[0].longTerm : true
        for (const n of targets) {
          updateNode(family.id, n.id, { longTerm: nextVal, dueDate: null })
        }
        return
      }
      if (action.startsWith("tag:")) {
        const t = action.slice(4).trim()
        if (!t) return
        let added = 0
        for (const n of targets) {
          if (!(n.tags ?? []).includes(t)) {
            updateNode(family.id, n.id, { tags: [...(n.tags ?? []), t] })
            added++
          }
        }
        if (added === 0) toast.info("选区内节点均已存在该标签")
        return
      }
      if (action.startsWith("style-border:")) {
        // 空值 = 清除自定义边框色，回落主题默认（显式 undefined 才能覆盖掉旧值）
        const v = action.slice(13) || undefined
        for (const n of targets) {
          updateNode(family.id, n.id, { borderColor: v })
        }
        return
      }
      if (action.startsWith("style-bg:")) {
        const v = action.slice(9) || undefined
        for (const n of targets) {
          updateNode(family.id, n.id, { bgColor: v })
        }
        return
      }
      if (action.startsWith("due:")) {
        // 非空日期清 longTerm（同 NodeInspector 行为）；空串清除截止日期
        const d = action.slice(4)
        for (const n of targets) {
          updateNode(family.id, n.id, { dueDate: d || null, longTerm: false })
        }
        return
      }
    },
    [selectedIds, family.nodes, family.id, addChildNode, setActiveItem, updateNode],
  )

  // 按 Delete / Backspace 请求删除当前选中的节点（弹出确认，避开文本输入框）
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  // 删除确认弹窗：ESC 视为取消关闭（与其它弹窗行为一致）
  useEscapeClose(pendingDeleteId !== null, () => setPendingDeleteId(null))
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return
      if (!(e.target instanceof HTMLElement)) return
      const t = e.target
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return
      if (!activeItemId) return
      const keyNode = family.nodes.find((n) => n.id === activeItemId)
      if (!keyNode) return
      // 完全新的节点（仅 title、其它内容为空、无子节点）直接删除，跳过确认弹窗
      e.preventDefault()
      if (isPristineNode(keyNode, family.edges)) {
        removeNode(family.id, keyNode.id)
        toast.success("已删除节点")
        return
      }
      setPendingDeleteId(activeItemId)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [activeItemId, family.nodes, family.edges, family.id, removeNode])

  // ---- 渲染防风暴缓存：只改 1 个节点不再重建整张画布 ----
  // rfNode 逐节点缓存：node 引用 / 折叠态 / 选中态 / 多选态 / 多选数量都没变就复用同一对象（含回调闭包），
  // 让 React Flow 的逐节点 memo 生效。回调按 nodeId 派发，旧闭包最多滞后一个快照，语义无影响。
  // multiCount 必须入 key：它是 data 里的闭包快照（右键菜单「搬迁 n 个节点」的显示源），
  // 若只比 multi 布尔值，选区数量变化时已选中节点不重建 data，菜单会显示过期的旧数量。
  const rfNodeCacheRef = useRef(
    new Map<
      string,
      {
        node: MindNode
        collapsed: boolean
        selected: boolean
        multi: boolean
        multiCount: number
        rf: Node
      }
    >()
  )
  const lastRfNodesRef = useRef<Node[] | null>(null)
  // edge 逐边缓存：源 edge/node 引用与 animated 标志没变就复用同一对象
  const edgeCacheRef = useRef(
    new Map<string, { key: unknown; animated: boolean | undefined; edge: Edge }>()
  )
  const lastRfEdgesRef = useRef<Edge[] | null>(null)

  const rfNodes: Node[] = useMemo(() => {
    const cache = rfNodeCacheRef.current
    const list: Node[] = []
    const seen = new Set<string>()
    const multiActive = selectedIds.size > 1
    for (const n of family.nodes) {
      if (hidden.has(n.id)) continue
      if (n.hidden) continue // 用户隐藏：不在画布显示
      seen.add(n.id)
      const selected = n.id === activeItemId || selectedIds.has(n.id)
      const isCollapsed = collapsed.has(n.id)
      const multi = multiActive && selectedIds.has(n.id)
      const multiCount = selectedIds.size
      const hit = cache.get(n.id)
      let rf: Node
      if (
        hit &&
        hit.node === n &&
        hit.selected === selected &&
        hit.collapsed === isCollapsed &&
        hit.multi === multi &&
        hit.multiCount === multiCount
      ) {
        rf = hit.rf
      } else {
        rf = {
          id: n.id,
          type: "todo",
          position: n.position,
          data: {
            node: n,
            collapsed: isCollapsed,
            onToggleCollapse: () => toggleCollapse(n.id),
            onImageZoom: (v: number) => handleImageZoom(n.id, v),
            onMenuAction: (a: string) => handleMenuAction(n.id, a),
            multiSelected: multi,
            multiCount: multiCount,
          },
          selected,
        }
        cache.set(n.id, {
          node: n,
          collapsed: isCollapsed,
          selected,
          multi,
          multiCount,
          rf,
        })
      }
      list.push(rf)
      if (n.solution && n.solution.content.trim()) {
        const solKey = `sol-${n.id}`
        seen.add(solKey)
        const solHit = cache.get(solKey)
        if (solHit && solHit.node === n) {
          list.push(solHit.rf)
        } else {
          const solRf: Node = {
            id: solKey,
            type: "solution",
            position: n.solutionPosition ?? { x: n.position.x + 20, y: n.position.y + 190 },
            data: { node: n },
            draggable: true,
            selectable: false,
          }
          cache.set(solKey, {
            node: n,
            collapsed: false,
            selected: false,
            multi: false,
            multiCount: 0,
            rf: solRf,
          })
          list.push(solRf)
        }
      }
    }
    // 清理已删除节点的缓存，避免长会话下 Map 无限增长
    if (cache.size > seen.size) {
      for (const key of cache.keys()) {
        if (!seen.has(key)) cache.delete(key)
      }
    }
    // 全部复用且结构未变：返回旧数组引用，下游同步 effect 直接跳过
    const prev = lastRfNodesRef.current
    if (prev && prev.length === list.length && prev.every((p, i) => p === list[i])) {
      return prev
    }
    lastRfNodesRef.current = list
    return list
  }, [
    family.nodes,
    activeItemId,
    selectedIds,
    hidden,
    collapsed,
    toggleCollapse,
    handleImageZoom,
    handleMenuAction,
  ])

  const rfEdges: Edge[] = useMemo(() => {
    const cache = edgeCacheRef.current
    const list: Edge[] = []
    const seen = new Set<string>()
    // 用户隐藏的节点 id（用于过滤连线）
    const hiddenIds = new Set(family.nodes.filter((n) => n.hidden).map((n) => n.id))
    for (const e of family.edges) {
      if (hidden.has(e.source) || hidden.has(e.target)) continue
      if (hiddenIds.has(e.source) || hiddenIds.has(e.target)) continue
      const animated = e.kind === "flow" && !isConnecting
      seen.add(e.id)
      const hit = cache.get(e.id)
      if (hit && hit.key === e && hit.animated === animated) {
        list.push(hit.edge)
      } else {
        const edge: Edge = {
          id: e.id,
          source: e.source,
          target: e.target,
          animated,
          style:
            e.kind === "sub"
              ? { stroke: "var(--muted-foreground)", strokeDasharray: "5 5" }
              : { stroke: "var(--primary)", strokeWidth: 2 },
        }
        cache.set(e.id, { key: e, animated, edge })
        list.push(edge)
      }
    }
    // 解决方案绿线（按节点引用缓存）
    for (const n of family.nodes) {
      if (hidden.has(n.id)) continue
      if (n.hidden) continue
      if (n.solution && n.solution.content.trim()) {
        const id = `sol-edge-${n.id}`
        seen.add(id)
        const hit = cache.get(id)
        if (hit && hit.key === n) {
          list.push(hit.edge)
        } else {
          const edge: Edge = {
            id,
            source: n.id,
            target: `sol-${n.id}`,
            style: { stroke: "var(--solution)", strokeWidth: 2.5 },
            selectable: false,
          }
          cache.set(id, { key: n, animated: false, edge })
          list.push(edge)
        }
      }
    }
    // 清理已删除连线/节点的缓存
    if (cache.size > seen.size) {
      for (const key of cache.keys()) {
        if (!seen.has(key)) cache.delete(key)
      }
    }
    const prev = lastRfEdgesRef.current
    if (prev && prev.length === list.length && prev.every((p, i) => p === list[i])) {
      return prev
    }
    lastRfEdgesRef.current = list
    return list
  }, [family.edges, family.nodes, hidden, isConnecting])

  // ---- 本地画布态（React Flow 持有位置，避免拖拽时每帧写 store 导致卡顿/节点消失） ----
  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges)

  // 把 store 的结构/内容变化（增删节点、改标题/标签、折叠、临时右键线）同步进本地画布态，
  // 但保留当前拖拽中的位置，不覆盖 flow 内部坐标。
  useEffect(() => {
    const sn = new Map(rfNodes.map((n) => [n.id, n]))
    const se = new Map(rfEdges.map((e) => [e.id, e]))

    setNodes((curr) => {
      let mutated = false
      // 1) 通过 store 但保留本地位置（拖拽不被打断）；快照与当前对象一致时直接复用引用，
      //    让 React Flow 只重渲染真正变化的节点
      let next = curr.map((n) => {
        const s = sn.get(n.id)
        if (!s) return n // 交由下方“移除”处理
        if (n.data === s.data && n.selected === s.selected) return n
        mutated = true
        return { ...s, position: n.position, selected: s.selected }
      })
      // 2) 补入 store 新增的节点
      for (const [id, s] of sn) {
        if (!next.some((n) => n.id === id)) {
          next = [...next, s]
          mutated = true
        }
      }
      // 3) 移除已不存在的节点（排除拖拽临时线，它会由 dragLine 状态重新加入）
      const filtered = next.filter((n) => sn.has(n.id))
      if (filtered.length !== next.length) mutated = true
      next = filtered
      return mutated ? next : curr
    })

    setEdges((curr) => {
      let mutated = false
      let next = curr.map((e) => {
        const s = se.get(e.id)
        if (!s || e === s) return e
        mutated = true
        return s
      })
      for (const [id, e] of se) {
        if (!next.some((x) => x.id === id)) {
          next = [...next, e]
          mutated = true
        }
      }
      const filtered = next.filter((e) => se.has(e.id))
      if (filtered.length !== next.length) mutated = true
      next = filtered
      return mutated ? next : curr
    })
  }, [rfNodes, rfEdges, setNodes, setEdges])

  // 拖拽结束：仅此时把最终位置写回 store（拖拽过程中不写 store，保证流畅）
  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      if (node.id.startsWith("sol-")) {
        const parentId = node.id.slice("sol-".length)
        const parent = family.nodes.find((n) => n.id === parentId)
        if (parent) updateNode(family.id, parentId, { solutionPosition: node.position })
      } else {
        updateNode(family.id, node.id, { position: node.position })
      }
    },
    [family.nodes, updateNode, family.id],
  )

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) {
        const res = connectNodes(family.id, c.source, c.target, "flow")
        if (res === "exists") toast.error("已经连接过此节点了！")
        else if (res === "created") toast.success("已建立连线")
      }
    },
    [connectNodes, family.id],
  )

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, n: Node) => {
      if (!n.id.startsWith("sol-")) setActiveItem(n.id)
    },
    [setActiveItem]
  )

  // 单击同样打开节点详情
  const onNodeClick = useCallback(
    (_: React.MouseEvent, n: Node) => {
      if (!n.id.startsWith("sol-")) setActiveItem(n.id)
    },
    [setActiveItem]
  )

  // React Flow v12 没有 onPaneDoubleClick，用 pane 单击计时模拟双击建节点
  const paneClickRef = useRef<{ t: number; x: number; y: number } | null>(null)
  const onPaneClick = useCallback(
    (e: React.MouseEvent) => {
      setActiveItem(null)
      const now = Date.now()
      const prev = paneClickRef.current
      if (
        prev &&
        now - prev.t < 350 &&
        Math.abs(e.clientX - prev.x) < 8 &&
        Math.abs(e.clientY - prev.y) < 8
      ) {
        paneClickRef.current = null
        const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
        addNode(family.id, pos)
        toast.success("已添加节点，右侧编辑详情")
      } else {
        paneClickRef.current = { t: now, x: e.clientX, y: e.clientY }
      }
    },
    [screenToFlowPosition, addNode, family.id, setActiveItem]
  )

  // 搬迁弹窗：多选批量 / 单节点
  const [moveIds, setMoveIds] = useState<string[] | null>(null)
  useEscapeClose(moveIds !== null, () => setMoveIds(null))

  return (
    <div className="flex h-full">
      {/* 族 sidebar（TODO 54：仅图内显示范围内） */}
      <FamilySidebar
        category={category}
        family={family}
        families={families}
        onSelect={onSelectFamily}
      />

      <div ref={canvasWrapRef} className="relative min-w-0 flex-1">
        <div className="pointer-events-none absolute right-3 top-3 z-10 flex flex-col items-end gap-2">
          <Button size="sm" className="pointer-events-auto gap-1.5" onClick={addAtCenter}>
            <Plus className="size-4" />
            添加节点
          </Button>
          <Button
            size="sm"
            variant={birdView ? "default" : "secondary"}
            className="pointer-events-auto gap-1.5"
            onClick={() => setBirdView((b) => !b)}
            title={birdView ? "退出鸟瞰（恢复正常缩放）" : "鸟瞰模式（允许无限缩小查看全局）"}
          >
            {birdView ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            鸟瞰
          </Button>
        </div>
        <ReactFlow
          // 切族时整体重挂：defaultViewport / fitView 按目标族的视口存档重新应用
          key={family.id}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          onConnectStart={() => setIsConnecting(true)}
          onConnectEnd={() => setIsConnecting(false)}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onPaneContextMenu={(e) => e.preventDefault()}
          onSelectionChange={handleSelectionChange}
          zoomOnDoubleClick={false}
          minZoom={birdView ? 0.02 : 0.5}
          nodesDraggable={!birdView}
          nodesConnectable={!birdView}
          onEdgeClick={(_, e) => {
            if (!e.id.startsWith("sol-edge-")) {
              removeEdge(family.id, e.id)
              toast.success("已删除连线")
            }
          }}
          fitView={!restoredViewport}
          defaultViewport={restoredViewport}
          onMoveEnd={(_, viewport) => setFamilyViewport(family.id, viewport)}
          proOptions={{ hideAttribution: true }}
          // 多选选区矩形的 pointer-events 关闭写在 app/globals.css（未分层 CSS）——
          // Tailwind v4 utilities 在 cascade layer 里，压不过 xyflow 未分层的 style.css
          className="bg-muted/30"
        >
          <Background color="var(--border)" gap={20} />
          <Controls className="!rounded-lg !border !bg-card !shadow-sm [&_button]:!border-border [&_button]:!bg-card [&_button]:!fill-foreground" />
        </ReactFlow>
        {family.nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
            <Workflow className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              「{family.name}」还是空的，双击画布或点击右上角「添加节点」开始。
            </p>
            <p className="text-xs text-muted-foreground/70">
              Shift+左键拖框可多选节点；拖拽节点底部圆点可连线，点击连线可删除。
            </p>
          </div>
        )}
        {/* 单图缩放实时倍数：缩放中显示，停止后淡出 */}
        {zoomBadge && (
          <div
            className={cn(
              "pointer-events-none absolute bottom-3 right-3 z-10 rounded-md bg-card/90 px-2 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur transition-opacity duration-500",
              zoomBadge.visible ? "opacity-100" : "opacity-0",
            )}
          >
            {Math.round(zoomBadge.value * 100)}%
          </div>
        )}
      </div>

      {selectedNode && (
        <NodeInspector
          family={family}
          node={selectedNode}
          onClose={() => setActiveItem(null)}
        />
      )}

      <MoveNodesDialog
        open={moveIds !== null}
        nodeIds={moveIds ?? []}
        category={category}
        currentFamily={family}
        onClose={() => setMoveIds(null)}
      />

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(v) => !v && setPendingDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              删除节点「{family.nodes.find((n) => n.id === pendingDeleteId)?.title || "未命名"}」？
            </AlertDialogTitle>
            <AlertDialogDescription>
              将删除该节点及其关联连线；若它是其它节点的子任务，也会从父节点移除。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDeleteId(null)}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteId) removeNode(family.id, pendingDeleteId)
                setPendingDeleteId(null)
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ListView({ family }: { family: RelationFamily }) {
  const nodes = family.nodes
  const setActiveItem = useWorkspace((s) => s.setActiveItem)
  const setFamilyView = useWorkspace((s) => s.setFamilyView)
  const addNode = useWorkspace((s) => s.addNode)

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 py-6">
        <div className="flex items-center justify-end">
          <Button
            size="sm"
            onClick={() => {
              addNode(family.id)
              toast.success("已添加节点，右侧编辑详情")
            }}
          >
            <Plus className="size-4" />
            添加节点
          </Button>
        </div>
        {nodes.length === 0 && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            还没有节点。
          </p>
        )}
        {nodes.map((n: MindNode) => (
          <button
            key={n.id}
            type="button"
            onClick={() => {
              setFamilyView(family.id, "mindmap")
              setActiveItem(n.id)
            }}
            className="flex flex-col gap-2 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50"
          >
            <div className="flex items-center gap-2">
              <Pin className="size-4 text-primary" />
              <span className={cn("font-medium", n.done && "text-muted-foreground line-through")}>
                {n.title}
              </span>
              {n.hidden && (
                <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">已隐藏</span>
              )}
              {n.done && (
                <span className="rounded bg-emerald-500/15 px-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                  已完成
                </span>
              )}
              {n.solution?.content && (
                <Badge
                  variant="secondary"
                  className="ml-auto gap-1 border-solution/40 bg-solution/10 text-solution"
                >
                  <Lightbulb className="size-3" />
                  {STATUS_META[n.solution.status].label}
                </Badge>
              )}
            </div>
            <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
              {n.cause && <span className="truncate">原因：{n.cause}</span>}
              {n.leadTo && <span className="truncate">导向：{n.leadTo}</span>}
              {n.result && <span className="truncate">结果：{n.result}</span>}
            </div>
            {n.solution?.content && (
              <p className="line-clamp-2 rounded-md bg-solution/10 px-2 py-1 text-xs text-foreground">
                解决方案：{n.solution.content}
              </p>
            )}
          </button>
        ))}
      </div>
    </ScrollArea>
  )
}
