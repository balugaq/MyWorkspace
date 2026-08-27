"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import {
  Pin,
  Lightbulb,
  ArrowRight,
  CornerDownRight,
  Target,
  ChevronDown,
  CalendarClock,
  Check,
} from "lucide-react"
import type { MindNode, SolutionStatus } from "@/lib/types"
import { STATUS_META } from "@/lib/types"
import { cn } from "@/lib/utils"
import { RichText } from "@/components/rich-text"

const STATUS_STYLE: Record<SolutionStatus, string> = {
  doing: "bg-solution text-solution-foreground",
  paused: "bg-warning text-warning-foreground",
  done: "bg-muted text-muted-foreground",
}

interface TodoNodeData {
  node: MindNode
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export const TodoNode = memo(function TodoNode({ data, selected }: NodeProps) {
  const {
    node,
    collapsed = false,
    onToggleCollapse,
  } = data as unknown as TodoNodeData
  const subCount = node.sub.length
  return (
    <div
      className={cn(
        "w-auto max-w-[50vw] min-w-56 rounded-xl border-2 bg-card shadow-sm transition-colors",
        selected ? "border-primary ring-2 ring-primary/30" : "border-border"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-2 !border-2 !border-primary !bg-background"
      />
      <div className="flex items-center gap-1.5 border-b bg-primary/5 px-3 py-2">
        <Pin className="size-3.5 shrink-0 text-primary" />
        <span
          className={cn(
            "truncate text-sm font-semibold",
            node.done && "text-muted-foreground line-through",
          )}
        >
          {node.title}
        </span>
        {node.done && <Check className="ml-auto size-3.5 shrink-0 text-emerald-500" />}
        {subCount > 0 && !node.done && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleCollapse?.()
            }}
            className="ml-auto flex size-4 shrink-0 items-center justify-center rounded transition-colors hover:bg-primary/10"
            title={collapsed ? "展开子任务" : "折叠子任务"}
          >
            <ChevronDown
              className={cn(
                "size-3.5 text-muted-foreground transition-transform",
                collapsed && "rotate-180"
              )}
            />
          </button>
        )}
      </div>
      <div
        className={cn(
          "flex min-w-56 flex-col gap-1 px-3 py-2 text-[11px] text-muted-foreground",
          node.done && "opacity-60",
        )}
      >
        {node.cause && (
          <span className="flex items-start gap-1">
            <CornerDownRight className="mt-0.5 size-3 shrink-0" />
            <span className="line-clamp-1 min-w-0 break-words [overflow-wrap:anywhere]">原因：{node.cause}</span>
          </span>
        )}
        {node.leadTo && (
          <span className="flex items-start gap-1">
            <ArrowRight className="mt-0.5 size-3 shrink-0" />
            <span className="line-clamp-1 min-w-0 break-words [overflow-wrap:anywhere]">导向：{node.leadTo}</span>
          </span>
        )}
        {node.result && (
          <span className="flex items-start gap-1">
            <Target className="mt-0.5 size-3 shrink-0" />
            <span className="line-clamp-1 min-w-0 break-words [overflow-wrap:anywhere]">结果：{node.result}</span>
          </span>
        )}
        {node.content && <RichText text={node.content} className="text-[11px]" fullSize />}
      </div>
      {(node.tags && node.tags.length > 0) || node.dueDate || node.longTerm ? (
        <div className="flex flex-wrap items-center gap-1 border-t px-3 py-1.5">
          {(node.tags ?? []).slice(0, 3).map((t) => (
            <span
              key={t}
              className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground"
            >
              {t}
            </span>
          ))}
          {node.longTerm ? (
            <span className="ml-auto flex items-center gap-0.5 rounded bg-warning/15 px-1 py-0.5 text-[9px] font-medium text-foreground">
              <CalendarClock className="size-2.5" />
              长期
            </span>
          ) : node.dueDate ? (
            <span className="ml-auto flex items-center gap-0.5 rounded bg-primary/15 px-1 py-0.5 text-[9px] font-medium text-foreground">
              <CalendarClock className="size-2.5" />
              {node.dueDate}
            </span>
          ) : null}
        </div>
      ) : null}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-2 !border-2 !border-primary !bg-background"
      />
    </div>
  )
})

export const SolutionNode = memo(function SolutionNode({ data }: NodeProps) {
  const node = (data as { node: MindNode }).node
  const sol = node.solution!
  const meta = STATUS_META[sol.status]
  return (
    <div className="w-48 rounded-xl border-2 border-solution bg-solution/10 px-3 py-2.5 shadow-sm">
      <Handle
        type="target"
        position={Position.Top}
        className="!size-2 !border-2 !border-solution !bg-background"
      />
      <div className="mb-1 flex items-center gap-1.5">
        <Lightbulb className="size-3.5 text-solution" />
        <span className="text-[11px] font-semibold text-solution">
          解决方案
        </span>
      </div>
      <p className="mb-2 line-clamp-3 break-words [overflow-wrap:anywhere] text-xs text-foreground">{sol.content}</p>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
          STATUS_STYLE[sol.status]
        )}
      >
        {meta.symbol} {meta.label}
      </span>
    </div>
  )
})
