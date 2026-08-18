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
  ReactFlowProvider,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Plus, Workflow, List, Pin, Lightbulb } from "lucide-react"
import { toast } from "sonner"
import { useWorkspace } from "@/lib/store"
import type { Category, MindNode } from "@/lib/types"
import { STATUS_META } from "@/lib/types"
import { TodoNode, SolutionNode } from "@/components/mindmap/nodes"
import { NodeInspector } from "@/components/mindmap/node-inspector"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { cn } from "@/lib/utils"

const nodeTypes = { todo: TodoNode, solution: SolutionNode, float: FloatNode }

/** 隐形节点：仅作为右键拖拽临时连线的光标锚点，不渲染任何内容 */
function FloatNode() {
  return <div className="pointer-events-none size-0 opacity-0" />
}

export function MindmapWorkspace({ category }: { category: Category }) {
  const view = category.relation?.view ?? "mindmap"
  const setRelationView = useWorkspace((s) => s.setRelationView)

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
        <h1 className="font-serif text-lg font-semibold">{category.name}</h1>
        <div className="flex items-center rounded-lg border p-0.5">
          <ViewBtn
            active={view === "mindmap"}
            onClick={() => setRelationView(category.id, "mindmap")}
          >
            <Workflow className="size-3.5" />
            思维导图
          </ViewBtn>
          <ViewBtn
            active={view === "list"}
            onClick={() => setRelationView(category.id, "list")}
          >
            <List className="size-3.5" />
            列表
          </ViewBtn>
        </div>
        <div className="flex-1" />
      </div>

      <div className="min-h-0 flex-1">
        {view === "mindmap" ? (
          <ReactFlowProvider>
            <Canvas category={category} />
          </ReactFlowProvider>
        ) : (
          <ListView category={category} />
        )}
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

function Canvas({ category }: { category: Category }) {
  const relation = category.relation!
  const activeItemId = useWorkspace((s) => s.activeItemId)
  const setActiveItem = useWorkspace((s) => s.setActiveItem)
  const addNode = useWorkspace((s) => s.addNode)
  const updateNode = useWorkspace((s) => s.updateNode)
  const connectNodes = useWorkspace((s) => s.connectNodes)
  const removeEdge = useWorkspace((s) => s.removeEdge)
  const removeNode = useWorkspace((s) => s.removeNode)
  const { screenToFlowPosition } = useReactFlow()
  const canvasWrapRef = useRef<HTMLDivElement>(null)

  // 在画面中心新建节点
  const addAtCenter = useCallback(() => {
    const el = canvasWrapRef.current
    if (el) {
      const r = el.getBoundingClientRect()
      const center = screenToFlowPosition({
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
      })
      addNode(category.id, center)
    } else {
      addNode(category.id)
    }
    toast.success("已添加节点，右侧编辑详情")
  }, [screenToFlowPosition, addNode, category.id])

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
      for (const subId of relation.nodes.find((n) => n.id === id)?.sub ?? []) {
        if (!res.has(subId)) {
          res.add(subId)
          visit(subId)
        }
      }
    }
    for (const id of collapsed) visit(id)
    return res
  }, [collapsed, relation.nodes])

  // ---- 右键拖拽连线：按住节点右键拖到另一节点上松开，即建立 flow 连线 ----
  const NODE_W = 224
  const NODE_H = 120
  const [dragLine, setDragLine] = useState<{ source: string; to: { x: number; y: number } } | null>(null)
  const dragRef = useRef<{ source: string; to: { x: number; y: number } } | null>(null)

  const startRightDrag = useCallback(
    (nodeId: string, clientX: number, clientY: number) => {
      const to = screenToFlowPosition({ x: clientX, y: clientY })
      dragRef.current = { source: nodeId, to }
      setDragLine({ ...dragRef.current })

      const onMove = (e: PointerEvent) => {
        if (!dragRef.current) return
        dragRef.current.to = screenToFlowPosition({ x: e.clientX, y: e.clientY })
        setDragLine({ ...dragRef.current })
      }
      const onUp = (e: PointerEvent) => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        const cur = dragRef.current
        dragRef.current = null
        setDragLine(null)
        if (!cur) return
        const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
        // 命中测试：找包含该 flow 坐标的可见目标节点
        const target = relation.nodes.find(
          (n) =>
            !hidden.has(n.id) &&
            n.id !== cur.source &&
            pos.x >= n.position.x &&
            pos.x <= n.position.x + NODE_W &&
            pos.y >= n.position.y &&
            pos.y <= n.position.y + NODE_H,
        )
        if (target) {
          const res = connectNodes(category.id, cur.source, target.id, "flow")
          if (res === "exists") toast.error("已经连接过此节点了！")
          else toast.success("已建立连线")
        }
      }
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp, { once: false })
    },
    [screenToFlowPosition, relation.nodes, hidden, connectNodes, category.id],
  )

  const selectedNode = relation.nodes.find((n) => n.id === activeItemId) ?? null

  // 按 Delete / Backspace 请求删除当前选中的节点（弹出确认，避开文本输入框）
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return
      if (!(e.target instanceof HTMLElement)) return
      const t = e.target
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return
      if (!activeItemId) return
      if (!relation.nodes.some((n) => n.id === activeItemId)) return
      e.preventDefault()
      setPendingDeleteId(activeItemId)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [activeItemId, relation.nodes])

  const rfNodes: Node[] = useMemo(() => {
    const list: Node[] = []
    for (const n of relation.nodes) {
      if (hidden.has(n.id)) continue
      list.push({
        id: n.id,
        type: "todo",
        position: n.position,
        data: {
          node: n,
          collapsed: collapsed.has(n.id),
          onToggleCollapse: () => toggleCollapse(n.id),
          onRightDrag: (cx: number, cy: number) => startRightDrag(n.id, cx, cy),
        },
        selected: n.id === activeItemId,
      })
      if (n.solution && n.solution.content.trim()) {
        list.push({
          id: `sol-${n.id}`,
          type: "solution",
          position: n.solutionPosition ?? { x: n.position.x + 20, y: n.position.y + 190 },
          data: { node: n },
          draggable: true,
          selectable: false,
        })
      }
    }
    // 右键拖拽时的隐形光标节点（作为临时连线终点）
    if (dragLine) {
      list.push({
        id: "drag-float",
        type: "float",
        position: dragLine.to,
        draggable: false,
        selectable: false,
        data: {},
      })
    }
    return list
  }, [
    relation.nodes,
    activeItemId,
    hidden,
    collapsed,
    toggleCollapse,
    startRightDrag,
    dragLine,
  ])

  const rfEdges: Edge[] = useMemo(() => {
    const list: Edge[] = []
    for (const e of relation.edges) {
      if (hidden.has(e.source) || hidden.has(e.target)) continue
      list.push({
        id: e.id,
        source: e.source,
        target: e.target,
        animated: e.kind === "flow" && !isConnecting,
        style:
          e.kind === "sub"
            ? { stroke: "var(--muted-foreground)", strokeDasharray: "5 5" }
            : { stroke: "var(--primary)", strokeWidth: 2 },
      })
    }
    // 解决方案绿线
    for (const n of relation.nodes) {
      if (hidden.has(n.id)) continue
      if (n.solution && n.solution.content.trim()) {
        list.push({
          id: `sol-edge-${n.id}`,
          source: n.id,
          target: `sol-${n.id}`,
          style: { stroke: "var(--solution)", strokeWidth: 2.5 },
          selectable: false,
        })
      }
    }
    // 右键拖拽时的临时连线（直虚线，连接到光标处的隐形 float 节点）
    if (dragLine) {
      list.push({
        id: "drag-line",
        type: "straight",
        source: dragLine.source,
        target: "drag-float",
        style: { stroke: "var(--primary)", strokeWidth: 2, strokeDasharray: "6 4" },
        selectable: false,
        interactionWidth: 0,
      })
    }
    return list
  }, [relation.edges, relation.nodes, hidden, dragLine, isConnecting])

  // ---- 本地画布态（React Flow 持有位置，避免拖拽时每帧写 store 导致卡顿/节点消失） ----
  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges)

  // 把 store 的结构/内容变化（增删节点、改标题/标签、折叠、临时右键线）同步进本地画布态，
  // 但保留当前拖拽中的位置，不覆盖 flow 内部坐标。
  useEffect(() => {
    const sn = new Map(rfNodes.map((n) => [n.id, n]))
    const se = new Map(rfEdges.map((e) => [e.id, e]))

    setNodes((curr) => {
      // 1) 通过 store 但保留本地位置（拖拽不被打断）
      let next = curr.map((n) => {
        const s = sn.get(n.id)
        if (!s) return n // 交由下方“移除”处理
        return { ...s, position: n.position, selected: s.selected }
      })
      // 2) 补入 store 新增的节点
      for (const [id, s] of sn) {
        if (!next.some((n) => n.id === id)) next = [...next, s]
      }
      // 3) 移除已不存在的节点（排除拖拽临时线，它会由 dragLine 状态重新加入）
      next = next.filter((n) => sn.has(n.id) || n.id === "drag-float")
      return next
    })

    setEdges((curr) => {
      let next = curr.filter((e) => se.has(e.id) || e.id === "drag-line")
      for (const [id, e] of se) {
        if (!next.some((x) => x.id === id)) next = [...next, e]
      }
      return next
    })
  }, [rfNodes, rfEdges, setNodes, setEdges])

  // 拖拽结束：仅此时把最终位置写回 store（拖拽过程中不写 store，保证流畅）
  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      if (node.id === "drag-float") return
      if (node.id.startsWith("sol-")) {
        const parentId = node.id.slice("sol-".length)
        const parent = relation.nodes.find((n) => n.id === parentId)
        if (parent) updateNode(category.id, parentId, { solutionPosition: node.position })
      } else {
        updateNode(category.id, node.id, { position: node.position })
      }
    },
    [relation.nodes, updateNode, category.id],
  )

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) {
        const res = connectNodes(category.id, c.source, c.target, "flow")
        if (res === "exists") toast.error("已经连接过此节点了！")
        else if (res === "created") toast.success("已建立连线")
      }
    },
    [connectNodes, category.id],
  )

  const onNodeDoubleClick = useCallback(
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
        addNode(category.id, pos)
        toast.success("已添加节点，右侧编辑详情")
      } else {
        paneClickRef.current = { t: now, x: e.clientX, y: e.clientY }
      }
    },
    [screenToFlowPosition, addNode, category.id, setActiveItem]
  )

  return (
    <div className="flex h-full">
      <div ref={canvasWrapRef} className="relative min-w-0 flex-1">
        <div className="pointer-events-none absolute right-3 top-3 z-10">
          <Button size="sm" className="pointer-events-auto gap-1.5" onClick={addAtCenter}>
            <Plus className="size-4" />
            添加节点
          </Button>
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          onConnectStart={() => setIsConnecting(true)}
          onConnectEnd={() => setIsConnecting(false)}
          onNodeClick={(_, n) =>
            !n.id.startsWith("sol-") && setActiveItem(n.id)
          }
          onNodeDoubleClick={onNodeDoubleClick}
          onPaneClick={onPaneClick}
          onNodeContextMenu={(e) => e.preventDefault()}
          onPaneContextMenu={(e) => e.preventDefault()}
          zoomOnDoubleClick={false}
          onEdgeClick={(_, e) => {
            if (!e.id.startsWith("sol-edge-")) {
              removeEdge(category.id, e.id)
              toast.success("已删除连线")
            }
          }}
          fitView
          proOptions={{ hideAttribution: true }}
          className="bg-muted/30"
        >
          <Background color="var(--border)" gap={20} />
          <Controls className="!rounded-lg !border !bg-card !shadow-sm [&_button]:!border-border [&_button]:!bg-card [&_button]:!fill-foreground" />
        </ReactFlow>
        {relation.nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
            <Workflow className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              画布空空如也，双击画布或点击右上角「添加节点」开始。
            </p>
            <p className="text-xs text-muted-foreground/70">
              拖拽节点底部圆点可连线，点击连线可删除；双击节点可编辑，带子任务的节点可折叠。
            </p>
          </div>
        )}
      </div>

      {selectedNode && (
        <NodeInspector
          category={category}
          node={selectedNode}
          onClose={() => setActiveItem(null)}
        />
      )}

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(v) => !v && setPendingDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              删除节点「{relation.nodes.find((n) => n.id === pendingDeleteId)?.title || "未命名"}」？
            </AlertDialogTitle>
            <AlertDialogDescription>
              将删除该节点及其关联连线；若它是其它节点的子任务，也会从父节点移除。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDeleteId(null)}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteId) removeNode(category.id, pendingDeleteId)
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

function ListView({ category }: { category: Category }) {
  const nodes = category.relation!.nodes
  const setActiveItem = useWorkspace((s) => s.setActiveItem)
  const setRelationView = useWorkspace((s) => s.setRelationView)
  const addNode = useWorkspace((s) => s.addNode)

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 py-6">
        <div className="flex items-center justify-end">
          <Button
            size="sm"
            onClick={() => {
              addNode(category.id)
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
              setRelationView(category.id, "mindmap")
              setActiveItem(n.id)
            }}
            className="flex flex-col gap-2 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50"
          >
            <div className="flex items-center gap-2">
              <Pin className="size-4 text-primary" />
              <span className="font-medium">{n.title}</span>
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
