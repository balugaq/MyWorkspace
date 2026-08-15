"use client"

import { useCallback, useMemo } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  applyNodeChanges,
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
import { cn } from "@/lib/utils"

const nodeTypes = { todo: TodoNode, solution: SolutionNode }

export function MindmapWorkspace({ category }: { category: Category }) {
  const view = category.relation?.view ?? "mindmap"
  const setRelationView = useWorkspace((s) => s.setRelationView)
  const addNode = useWorkspace((s) => s.addNode)

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
        <h1 className="font-serif text-lg font-semibold">{category.name}</h1>
        <div className="flex items-center rounded-lg border p-0.5">
          <ViewBtn active={view === "mindmap"} onClick={() => setRelationView(category.id, "mindmap")}>
            <Workflow className="size-3.5" />
            思维导图
          </ViewBtn>
          <ViewBtn active={view === "list"} onClick={() => setRelationView(category.id, "list")}>
            <List className="size-3.5" />
            列表
          </ViewBtn>
        </div>
        <div className="flex-1" />
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
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
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
  const updateNode = useWorkspace((s) => s.updateNode)
  const connectNodes = useWorkspace((s) => s.connectNodes)
  const removeEdge = useWorkspace((s) => s.removeEdge)

  const selectedNode = relation.nodes.find((n) => n.id === activeItemId) ?? null

  const rfNodes: Node[] = useMemo(() => {
    const list: Node[] = []
    for (const n of relation.nodes) {
      list.push({
        id: n.id,
        type: "todo",
        position: n.position,
        data: { node: n },
        selected: n.id === activeItemId,
      })
      if (n.solution && n.solution.content.trim()) {
        list.push({
          id: `sol-${n.id}`,
          type: "solution",
          position: { x: n.position.x + 20, y: n.position.y + 190 },
          data: { node: n },
          draggable: false,
          selectable: false,
        })
      }
    }
    return list
  }, [relation.nodes, activeItemId])

  const rfEdges: Edge[] = useMemo(() => {
    const list: Edge[] = relation.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: e.kind === "flow",
      style:
        e.kind === "sub"
          ? { stroke: "var(--muted-foreground)", strokeDasharray: "5 5" }
          : { stroke: "var(--primary)", strokeWidth: 2 },
    }))
    // 解决方案绿线
    for (const n of relation.nodes) {
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
    return list
  }, [relation.edges, relation.nodes])

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const next = applyNodeChanges(changes, rfNodes)
      for (const c of changes) {
        if (c.type === "position" && c.position && !c.id.startsWith("sol-")) {
          updateNode(category.id, c.id, { position: c.position })
        }
      }
      void next
    },
    [rfNodes, updateNode, category.id],
  )

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) {
        connectNodes(category.id, c.source, c.target, "flow")
      }
    },
    [connectNodes, category.id],
  )

  return (
    <div className="flex h-full">
      <div className="relative min-w-0 flex-1">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => !n.id.startsWith("sol-") && setActiveItem(n.id)}
          onPaneClick={() => setActiveItem(null)}
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
          <MiniMap
            className="!rounded-lg !border !bg-card"
            nodeColor="var(--primary)"
            maskColor="color-mix(in oklch, var(--muted) 60%, transparent)"
          />
        </ReactFlow>
        {relation.nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
            <Workflow className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">画布空空如也，点击右上角「添加节点」开始。</p>
            <p className="text-xs text-muted-foreground/70">拖拽节点底部圆点可连线，点击连线可删除。</p>
          </div>
        )}
      </div>

      {selectedNode && (
        <NodeInspector category={category} node={selectedNode} onClose={() => setActiveItem(null)} />
      )}
    </div>
  )
}

function ListView({ category }: { category: Category }) {
  const nodes = category.relation!.nodes
  const setActiveItem = useWorkspace((s) => s.setActiveItem)
  const setRelationView = useWorkspace((s) => s.setRelationView)

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 py-6">
        {nodes.length === 0 && (
          <p className="py-16 text-center text-sm text-muted-foreground">还没有节点。</p>
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
