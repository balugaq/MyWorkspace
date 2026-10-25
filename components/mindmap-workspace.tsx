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
import { useTranslation } from "react-i18next"
import type { Category, MindEdge, MindNode, RelationFamily } from "@/lib/types"
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

// 渲染防风暴缓存（模块级 WeakMap，以 store 源对象为弱引用键，对象删除后自动 GC，无需手动清理）：
// 逐节点缓存 React Flow 节点对象（node 引用/折叠/选中/多选态/多选数量不变即复用，含回调闭包），
// 让 React Flow 逐节点 memo 生效；回调按 nodeId 派发，旧闭包最多滞后一个快照，语义无影响。
// multiCount 必须入 key：它是 data 闭包快照（右键菜单「搬迁 n 个」显示源），只比 multi 布尔值会显示过期数量
const flowNodeCache = new WeakMap<MindNode, Map<string, Node>>()
const flowSolNodeCache = new WeakMap<MindNode, Node>()
// edge 逐边缓存：源 edge/node 引用与 animated 标志没变就复用同一对象
const flowEdgeCache = new WeakMap<MindEdge, Map<string, Edge>>()
const flowSolEdgeCache = new WeakMap<MindNode, Edge>()
// 注：react-hooks/refs 会把「模块级 WeakMap 取值后传参」误判为 ref 访问，已在下方
// 报错处用 eslint-disable-next-line 局部豁免。该缓存是保命设计——复用 React Flow
// 节点对象引用让逐节点 memo 生效，删掉会复现渲染死循环，故保留。

export function MindmapWorkspace({ category }: { category: Category }) {
  const { t } = useTranslation()
  // TODO 54：当前分类的族列表；当前族为组件内 state，默认第一个族
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

  // 消费跨组件跳族标记（如搬迁后跳转到目标分类并选中目标族）；
  // setState 延迟一拍：effect 体内同步 setState 会触发 react-hooks/set-state-in-effect
  useEffect(() => {
    if (!pendingFamilyId || !families.some((f) => f.id === pendingFamilyId)) return
    const t = window.setTimeout(() => {
      setActiveFamilyId(pendingFamilyId)
      setPendingFamilyId(null)
    }, 0)
    return () => window.clearTimeout(t)
  }, [pendingFamilyId, families, setPendingFamilyId])

  // 注：activeFamilyId 指向已删除族时无需清 state——下方 find 未命中自动回落 families[0]

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
              {t("mindmap.graphView")}
            </ViewBtn>
            <ViewBtn
              active={view === "list"}
              onClick={() => setFamilyView(family.id, "list")}
            >
              <List className="size-3.5" />
              {t("mindmap.listView")}
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
              {t("mindmap.noFamilies")}
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

// 族 sidebar（TODO 54）：列出/切换/新建/重命名/删除族 + AI 入口

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
  const { t } = useTranslation()
  const addRelationFamily = useWorkspace((s) => s.addRelationFamily)
  const renameRelationFamily = useWorkspace((s) => s.renameRelationFamily)
  const deleteRelationFamily = useWorkspace((s) => s.deleteRelationFamily)
  const moveRelationFamily = useWorkspace((s) => s.moveRelationFamily)
  const askAiAbout = useWorkspace((s) => s.askAiAbout)

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState("")
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState("")
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null)
  const [relayoutBusy, setRelayoutBusy] = useState(false)
  // 提交状态机：Enter→committed、Esc→cancelled、失焦→提交；防 Enter 后卸载再触发 blur 重复建族、Esc 后 blur 误创建
  const addStateRef = useRef<"idle" | "committed" | "cancelled">("idle")
  const renameInputRef = useRef<HTMLInputElement>(null)

  const commitAdd = () => {
    if (addStateRef.current !== "idle") return
    addStateRef.current = "committed"
    const id = addRelationFamily(category.id, newName.trim().slice(0, 20) || undefined)
    setAdding(false)
    setNewName("")
    onSelect(id)
    toast.success(t("mindmap.familyCreated"))
  }

  // 重命名提交：重名（同分类内、排除自身）时 toast 提示并保留编辑态与焦点，不落库
  const commitRename = (): boolean => {
    if (!renamingId) return true
    const next = renameDraft.trim().slice(0, 20)
    if (!next) {
      setRenamingId(null)
      setRenameDraft("")
      return true
    }
    const dup = families.some((f) => f.id !== renamingId && f.name === next)
    if (dup) {
      toast.error(t("mindmap.familyExists", { name: next }))
      renameInputRef.current?.focus()
      return false
    }
    renameRelationFamily(renamingId, next)
    setRenamingId(null)
    setRenameDraft("")
    return true
  }

  // AI 分析（只读）：askAiAbout 新建会话并携带族上下文
  const handleAiAnalyze = () => {
    const prompt =
t("mindmap.aiAnalyzePrompt", {
        cat: category.name,
        family: family.name,
        nodes: family.nodes.length,
        edges: family.edges.length,
        categoryId: category.id,
        familyId: family.id,
      })
    askAiAbout(prompt)
  }

  // AI 整理布局（写操作）：失败 toast 不落库
  const handleRelayout = async () => {
    if (relayoutBusy) return
    setRelayoutBusy(true)
    try {
      const n = await relayoutFamilyNodes(family.id)
      toast.success(t("mindmap.relaidOut", { n }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("mindmap.relayoutFail"))
    } finally {
      setRelayoutBusy(false)
    }
  }

  return (
    <div className="flex w-48 shrink-0 flex-col border-r bg-card/50">
      <div className="flex items-center gap-1.5 border-b px-3 py-2.5">
        <Layers className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground">{t("mindmap.families")}</span>
        <button
          type="button"
          title={t("mindmap.newFamily")}
          aria-label={t("mindmap.newFamily")}
          onClick={() => {
            addStateRef.current = "idle"
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
              onBlur={() => {
                if (addStateRef.current !== "idle") return
                commitAdd()
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  commitAdd()
                } else if (e.key === "Escape") {
                  e.preventDefault()
                  addStateRef.current = "cancelled" // Esc 取消：不放行紧随的 blur 提交
                  setAdding(false)
                }
              }}
              maxLength={20}
              placeholder={t("mindmap.familyNamePlaceholder")}
              className="h-7 text-xs"
            />
          </div>
        )}
        {families.map((f, i) => (
          <div
            key={f.id}
            draggable={renamingId !== f.id}
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", f.id)
              e.dataTransfer.effectAllowed = "move"
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const id = e.dataTransfer.getData("text/plain")
              if (!id) return
              const from = families.findIndex((x) => x.id === id)
              if (from === -1) return
              const rect = e.currentTarget.getBoundingClientRect()
              const before = e.clientY < rect.top + rect.height / 2
              const to = before ? i : i + 1
              // 落点在自身原位或紧邻下一位都等于没动，不落库
              if (to !== from && to !== from + 1) moveRelationFamily(id, to)
            }}
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
                ref={renameInputRef}
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onBlur={() => {
                  if (!commitRename()) renameInputRef.current?.focus()
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    if (!commitRename()) renameInputRef.current?.focus()
                  } else if (e.key === "Escape") {
                    e.preventDefault()
                    setRenamingId(null)
                  }
                }}
                maxLength={20}
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
                  title={t("common.rename")}
                  aria-label={t("mindmap.renameFamily")}
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
                  title={t("mindmap.deleteFamily")}
                  aria-label={t("mindmap.deleteFamily")}
                  onClick={(e) => {
                    e.stopPropagation()
                    // TODO 66：空族（无节点）直接删除，不打扰确认
                    if (f.nodes.length === 0) {
                      deleteRelationFamily(f.id)
                      toast.success(t("mindmap.familyDeleted"))
                    } else {
                      setConfirmDelId(f.id)
                    }
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
          {t("mindmap.aiAnalyze")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-full gap-1.5 text-xs"
          onClick={() => void handleRelayout()}
          disabled={relayoutBusy || family.nodes.length === 0}
        >
          <Wand2 className={cn("size-3.5", relayoutBusy && "animate-pulse")} />
          {relayoutBusy ? t("mindmap.relayouting") : t("mindmap.relayout")}
        </Button>
      </div>

      {/* ESC 视为取消（与其它弹窗一致） */}
      <AlertDialog
        open={confirmDelId !== null}
        onOpenChange={(v) => !v && setConfirmDelId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("mindmap.deleteFamilyTitle", { name: families.find((f) => f.id === confirmDelId)?.name || t("common.untitled") })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("mindmap.deleteFamilyDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDelId(null)}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelId) deleteRelationFamily(confirmDelId)
                setConfirmDelId(null)
                toast.success(t("mindmap.familyDeleted"))
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// 搬迁弹窗（TODO 54）

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
  const { t } = useTranslation()
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

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      setTarget(null)
      setNewName("")
    }, 0)
    return () => window.clearTimeout(t)
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
    toast.success(t("mindmap.movedNodes", { n: nodeIds.length }))
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("mindmap.moveTitle", { n: nodeIds.length })}</DialogTitle>
          <DialogDescription>
            {t("mindmap.moveDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="native-scroll flex max-h-[55vh] flex-col gap-3 overflow-auto pr-1">
          <section className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t("mindmap.familiesOf", { name: category.name })}
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
                  {isCurrent && <span className="text-xs">{t("mindmap.currentFamily")}</span>}
                </button>
              )
            })}
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
                placeholder={t("mindmap.newFamilyPlaceholder")}
                className="h-8 flex-1 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-xs"
                onClick={createInline}
              >
                <Plus className="size-3.5" />
                {t("mindmap.create")}
              </Button>
            </div>
          </section>

          {otherRelCats.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">{t("mindmap.moveToOther")}</p>
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
            {t("common.cancel")}
          </Button>
          <Button onClick={confirm} disabled={!target || target === currentFamily.id}>
            {t("mindmap.move")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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
  const { t } = useTranslation()
  const activeItemId = useWorkspace((s) => s.activeItemId)
  // TODO 75：极光开启时画布容器透明露出底层极光（网格点 Background 保留）
  const auroraBackground = useWorkspace((s) => s.settings.auroraBackground)
  const setActiveItem = useWorkspace((s) => s.setActiveItem)
  const addNode = useWorkspace((s) => s.addNode)
  const addChildNode = useWorkspace((s) => s.addChildNode)
  const updateNode = useWorkspace((s) => s.updateNode)
  const connectNodes = useWorkspace((s) => s.connectNodes)
  const removeEdge = useWorkspace((s) => s.removeEdge)
  const removeNode = useWorkspace((s) => s.removeNode)
  // 视口存档存于族内（TODO 54）：有有效存档则重挂载后恢复，否则初始 fitView 自适应
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

  // 多选选区（TODO 54）：Shift+左键拖框选；右键菜单批量项作用于该选区
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // 切族时清空选区；延迟一拍避开 react-hooks/set-state-in-effect
  useEffect(() => {
    const t = window.setTimeout(() => setSelectedIds(new Set()), 0)
    return () => window.clearTimeout(t)
  }, [family.id])
  // 稳定引用 + 内容相同返回旧 Set：xyflow 把 onSelectionChange 放进 effect 依赖，内联函数会引发 setState→渲染死循环
  const handleSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    setSelectedIds((prev) => {
      const next = new Set(
        params.nodes.map((n) => n.id).filter((id) => !id.startsWith("sol-")),
      )
      if (prev.size === next.size && [...prev].every((id) => next.has(id))) return prev
      return next
    })
  }, [])

  // 鸟瞰：允许无限缩小（默认 minZoom=0.5），并禁拖拽/连线防缩小误触
  const [birdView, setBirdView] = useState(false)
  // 仅 birdView 真实变化时才 fitView：跳过首挂载与 StrictMode 双挂载，否则 fitView 动画会覆盖视口存档
  const prevBirdViewRef = useRef<boolean | null>(null)
  useEffect(() => {
    const prev = prevBirdViewRef.current
    prevBirdViewRef.current = birdView
    if (prev === null || prev === birdView) return
    void fitView({ padding: 0.2, duration: 300 })
  }, [birdView, fitView])

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
    toast.success(t("mindmap.nodeAdded"))
  }, [screenToFlowPosition, addNode, family.id, t])

  // 拖拽连线中不播放连线动画，松手后再播放
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

  // 单图缩放倍数徽标：缩放中可见，停止后淡出
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

  // 搬迁弹窗：多选批量 / 单节点（声明在 handleMenuAction 之前，其内部要引用 setMoveIds）
  const [moveIds, setMoveIds] = useState<string[] | null>(null)
  useEscapeClose(moveIds !== null, () => setMoveIds(null))

  // 右键菜单动作（TodoNode 上报，此处统一执行 store 变更）；TODO 54：多选态（选区>1）除「添加子节点」外批量套用
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
        // 仅单选态出现；与 NodeInspector.handleAddChild 同一 store 入口
        const childId = addChildNode(family.id, nodeId)
        if (childId) {
          // base-ui 关菜单时把焦点还给节点触发器，可能覆盖 addNode 设置的 activeItemId
          // （「添加后不切详情」根因），延后一拍重新断言
          window.setTimeout(() => setActiveItem(childId), 0)
        }
        return
      }
      if (action === "toggle-done") {
        // 批量口径：选区内有未完成→全部完成，否则全部取消；done 跃迁时 updateNode 自动记贡献账/completedAt
        const nextDone = targets.some((n) => !n.done)
        for (const n of targets) {
          updateNode(family.id, n.id, { done: nextDone })
        }
        toast.success(
          nextDone
            ? t("mindmap.markedDone", { n: targets.length })
            : t("mindmap.unmarkedDone", { n: targets.length })
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
        const tag = action.slice(4).trim()
        if (!tag) return
        let added = 0
        for (const n of targets) {
          if (!(n.tags ?? []).includes(tag)) {
            updateNode(family.id, n.id, { tags: [...(n.tags ?? []), tag] })
            added++
          }
        }
        if (added === 0) toast.info(t("mindmap.tagAlreadyAll"))
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
    [selectedIds, family.nodes, family.id, addChildNode, setActiveItem, updateNode, t],
  )

  // Delete/Backspace 删除选中节点（弹确认，避开输入框）
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  // ESC 视为取消（与其它弹窗一致）
  useEscapeClose(pendingDeleteId !== null, () => setPendingDeleteId(null))
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return
      if (!(e.target instanceof HTMLElement)) return
      const el = e.target
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return
      if (!activeItemId) return
      const keyNode = family.nodes.find((n) => n.id === activeItemId)
      if (!keyNode) return
      // 完全新的节点（仅 title、其它内容为空、无子节点）直接删除，跳过确认弹窗
      e.preventDefault()
      if (isPristineNode(keyNode, family.edges)) {
        removeNode(family.id, keyNode.id)
        toast.success(t("mindmap.nodeDeleted"))
        return
      }
      setPendingDeleteId(activeItemId)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [activeItemId, family.nodes, family.edges, family.id, removeNode, t])

  // 本地画布态：React Flow 持有位置，避免拖拽每帧写 store；初值空数组，快照由下方 sync effect 首帧推入。
  // **selected 单向铁律**：React Flow 内部选中是唯一真相，快照只读不写 selected，
  // 否则与 onSelectionChange→selectedIds 回写构成双向环——历次「Maximum update depth exceeded」死循环根源。
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  // 本地选中映射：rfNodes 快照从这读取选中态（跟随 React Flow 现值，不反向派生）
  const localSelected = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const n of nodes) m.set(n.id, !!n.selected)
    return m
  }, [nodes])

  const rfNodes: Node[] = useMemo(() => {
    const list: Node[] = []
    const multiActive = selectedIds.size > 1
    for (const n of family.nodes) {
      if (hidden.has(n.id)) continue
      if (n.hidden) continue
      const selected = localSelected.get(n.id) ?? false
      const isCollapsed = collapsed.has(n.id)
      const multi = multiActive && selectedIds.has(n.id)
      const multiCount = selectedIds.size
      const key = `${selected ? 1 : 0}|${isCollapsed ? 1 : 0}|${multi ? 1 : 0}|${multiCount}`
      let variants = flowNodeCache.get(n)
      if (!variants) {
        variants = new Map()
        flowNodeCache.set(n, variants)
      }
      let flowNode = variants.get(key)
      if (!flowNode) {
        flowNode = {
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
        // 局部豁免：模块级 WeakMap 缓存复用是防 xyflow 渲染死循环的保命设计（对象引用
        // 稳定才能让逐节点 memo 生效），Compiler 无法证明其稳定性，属已知误报。
        // eslint-disable-next-line react-hooks/refs
        variants.set(key, flowNode)
      }
      // eslint-disable-next-line react-hooks/refs
      list.push(flowNode)
      if (n.solution && n.solution.content.trim()) {
        let solRf = flowSolNodeCache.get(n)
        if (!solRf) {
          solRf = {
            id: `sol-${n.id}`,
            type: "solution",
            position: n.solutionPosition ?? { x: n.position.x + 20, y: n.position.y + 190 },
            data: { node: n },
            draggable: true,
            selectable: false,
          }
          flowSolNodeCache.set(n, solRf)
        }
        list.push(solRf)
      }
    }
    return list
  }, [
    family.nodes,
    localSelected,
    selectedIds,
    hidden,
    collapsed,
    toggleCollapse,
    handleImageZoom,
    handleMenuAction,
  ])

  const rfEdges: Edge[] = useMemo(() => {
    const list: Edge[] = []
    // 用户隐藏的节点 id（用于过滤连线）
    const hiddenIds = new Set(family.nodes.filter((n) => n.hidden).map((n) => n.id))
    for (const e of family.edges) {
      if (hidden.has(e.source) || hidden.has(e.target)) continue
      if (hiddenIds.has(e.source) || hiddenIds.has(e.target)) continue
      const animated = e.kind === "flow" && !isConnecting
      let variants = flowEdgeCache.get(e)
      if (!variants) {
        variants = new Map()
        flowEdgeCache.set(e, variants)
      }
      let edge = variants.get(String(animated))
      if (!edge) {
        edge = {
          id: e.id,
          source: e.source,
          target: e.target,
          animated,
          style:
            e.kind === "sub"
              ? { stroke: "var(--muted-foreground)", strokeDasharray: "5 5" }
              : { stroke: "var(--primary)", strokeWidth: 2 },
        }
        variants.set(String(animated), edge)
      }
      list.push(edge)
    }
    // 解决方案绿线（按节点引用缓存）
    for (const n of family.nodes) {
      if (hidden.has(n.id)) continue
      if (n.hidden) continue
      if (n.solution && n.solution.content.trim()) {
        let edge = flowSolEdgeCache.get(n)
        if (!edge) {
          edge = {
            id: `sol-edge-${n.id}`,
            source: n.id,
            target: `sol-${n.id}`,
            style: { stroke: "var(--solution)", strokeWidth: 2.5 },
            selectable: false,
          }
          flowSolEdgeCache.set(n, edge)
        }
        list.push(edge)
      }
    }
    return list
  }, [family.edges, family.nodes, hidden, isConnecting])

  // 同步 store 的结构/内容变化进本地画布态，保留拖拽中的位置与选中
  // （不写 selected：见上方「selected 单向铁律」，否则构成死循环）。
  useEffect(() => {
    const sn = new Map(rfNodes.map((n) => [n.id, n]))
    const se = new Map(rfEdges.map((e) => [e.id, e]))

    setNodes((curr) => {
      let mutated = false
      // 1) 保留本地位置与选中（拖拽/框选不被打断）；data 一致时直接复用引用，让 React Flow 只重渲染真正变化的节点
      let next = curr.map((n) => {
        const s = sn.get(n.id)
        if (!s) return n
        if (n.data === s.data) return n
        mutated = true
        return { ...s, position: n.position, selected: n.selected }
      })
      for (const [id, s] of sn) {
        if (!next.some((n) => n.id === id)) {
          next = [...next, s]
          mutated = true
        }
      }
      // 3) 移除已不存在的节点
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

  // activeItemId 编程选中：仅目标未选中时补选，不清除其他选中/不破坏多选（列表跳转等非画布路径由此补高亮）
  useEffect(() => {
    if (!activeItemId) return
    setNodes((curr) => {
      const target = curr.find((n) => n.id === activeItemId)
      if (!target || target.selected) return curr
      return curr.map((n) => (n.id === activeItemId ? { ...n, selected: true } : n))
    })
  }, [activeItemId, setNodes])

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
        if (res === "exists") toast.error(t("mindmap.edgeExists"))
        else if (res === "created") toast.success(t("mindmap.edgeCreated"))
      }
    },
    [connectNodes, family.id, t],
  )

  // 视口存档：xyflow 的 panZoom end/fitView 可能重复触发 moveEnd，值不变时双重拦截，杜绝「写 store→重渲染」回流
  const handleMoveEnd = useCallback(
    (_: unknown, viewport: { x: number; y: number; zoom: number }) => {
      const prev = family.viewport
      if (
        prev &&
        prev.x === viewport.x &&
        prev.y === viewport.y &&
        prev.zoom === viewport.zoom
      ) {
        return
      }
      setFamilyViewport(family.id, viewport)
    },
    [family.viewport, family.id, setFamilyViewport],
  )

  // 其余传给 ReactFlow 的回调统一 useCallback：StoreUpdater 把每个 prop 放进独立 effect，
  // 内联箭头（每次渲染新引用）会让 store 每渲染都 setState 一轮
  const handleConnectStart = useCallback(() => setIsConnecting(true), [])
  const handleConnectEnd = useCallback(() => setIsConnecting(false), [])
  const handlePaneContextMenu = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      e.preventDefault()
    },
    [],
  )
  const handleEdgeClick = useCallback(
    (_: React.MouseEvent, e: Edge) => {
      if (!e.id.startsWith("sol-edge-")) {
        removeEdge(family.id, e.id)
        toast.success(t("mindmap.edgeDeleted"))
      }
    },
    [removeEdge, family.id, t],
  )

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, n: Node) => {
      if (!n.id.startsWith("sol-")) setActiveItem(n.id)
    },
    [setActiveItem]
  )

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
        toast.success(t("mindmap.nodeAdded"))
      } else {
        paneClickRef.current = { t: now, x: e.clientX, y: e.clientY }
      }
    },
    [screenToFlowPosition, addNode, family.id, setActiveItem, t]
  )

  return (
    <div className="flex h-full">
      {/* 族 sidebar（TODO 54） */}
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
            {t("mindmap.addNode")}
          </Button>
          <Button
            size="sm"
            variant={birdView ? "default" : "secondary"}
            className="pointer-events-auto gap-1.5"
            onClick={() => setBirdView((b) => !b)}
            title={birdView ? t("mindmap.exitBirdView") : t("mindmap.birdView")}
          >
            {birdView ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {t("mindmap.birdViewShort")}
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
          onConnectStart={handleConnectStart}
          onConnectEnd={handleConnectEnd}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onPaneContextMenu={handlePaneContextMenu}
          onSelectionChange={handleSelectionChange}
          zoomOnDoubleClick={false}
          minZoom={birdView ? 0.02 : 0.5}
          nodesDraggable={!birdView}
          nodesConnectable={!birdView}
          onEdgeClick={handleEdgeClick}
          fitView={!restoredViewport}
          defaultViewport={restoredViewport}
          onMoveEnd={handleMoveEnd}
          proOptions={{ hideAttribution: true }}
          // 多选选区矩形的 pointer-events 关闭写在 app/globals.css（未分层 CSS）——
          // Tailwind v4 utilities 在 cascade layer 里，压不过 xyflow 未分层的 style.css
          className={auroraBackground ? "" : "bg-muted/30"}
        >
          {/* 极光开启时底色透明，仅保留网格点（Background 只画点，不画底色） */}
          <Background color="var(--border)" gap={20} style={{ backgroundColor: "transparent" }} />
          <Controls className="!rounded-lg !border !bg-card !shadow-sm [&_button]:!border-border [&_button]:!bg-card [&_button]:!fill-foreground" />
        </ReactFlow>
        {family.nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
            <Workflow className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t("mindmap.emptyCanvas", { name: family.name })}
            </p>
            <p className="text-xs text-muted-foreground/70">
              {t("mindmap.canvasHint")}
            </p>
          </div>
        )}
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
              {t("mindmap.deleteNodeTitle", { name: family.nodes.find((n) => n.id === pendingDeleteId)?.title || t("common.untitled") })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("mindmap.deleteNodeDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDeleteId(null)}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteId) removeNode(family.id, pendingDeleteId)
                setPendingDeleteId(null)
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ListView({ family }: { family: RelationFamily }) {
  const { t } = useTranslation()
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
              toast.success(t("mindmap.nodeAdded"))
            }}
          >
            <Plus className="size-4" />
            {t("mindmap.addNode")}
          </Button>
        </div>
        {nodes.length === 0 && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {t("mindmap.listEmpty")}
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
                <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">{t("mindmap.hidden")}</span>
              )}
              {n.done && (
                <span className="rounded bg-emerald-500/15 px-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                  {t("common.done")}
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
              {n.cause && <span className="truncate">{t("mindmap.cause")}：{n.cause}</span>}
              {n.leadTo && <span className="truncate">{t("mindmap.leadTo")}：{n.leadTo}</span>}
              {n.result && <span className="truncate">{t("mindmap.result")}：{n.result}</span>}
            </div>
            {n.solution?.content && (
              <p className="line-clamp-2 rounded-md bg-solution/10 px-2 py-1 text-xs text-foreground">
                {t("mindmap.solution")}：{n.solution.content}
              </p>
            )}
          </button>
        ))}
      </div>
    </ScrollArea>
  )
}
