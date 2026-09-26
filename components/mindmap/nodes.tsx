"use client"

import { memo, useCallback, useEffect, useRef, useState } from "react"
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
  Plus,
  Tag,
  Palette,
  Undo2,
  X,
} from "lucide-react"
import type { MindNode, SolutionStatus } from "@/lib/types"
import { STATUS_META } from "@/lib/types"
import { cn } from "@/lib/utils"
import { NODE_PALETTE, argbToCss } from "@/lib/color-utils"
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "@/components/ui/context-menu"
import { RichTextView } from "@/components/richtext/rich-text-view"
import { getImageURL } from "@/lib/image-store"
import { imageIdsInText } from "@/lib/image-refs"

const ZOOM_MIN = 0.1
const ZOOM_MAX = 4

// 去掉正文里的图片引用 token（保留文字），供「恰好 1 张图」时单独渲染可缩放图片、文字另排。
function stripImageTokens(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\(imgref:[^)\s]+\)/g, "")
    .replace(/\{\{img:[^}]+\}\}/g, "")
}

const STATUS_STYLE: Record<SolutionStatus, string> = {
  doing: "bg-solution text-solution-foreground",
  paused: "bg-warning text-warning-foreground",
  done: "bg-muted text-muted-foreground",
}

interface TodoNodeData {
  node: MindNode
  collapsed?: boolean
  onToggleCollapse?: () => void
  /** 单图缩放时上报实时倍数（由画布负责持久化与右下角显示） */
  onImageZoom?: (value: number) => void
  /** 右键菜单动作上报，由画布统一执行：
   *  add-child / toggle-done / tag:<text> / style-border:<argb|空> / style-bg:<argb|空> / due:<yyyy-MM-dd|空> / long-term */
  onMenuAction?: (action: string) => void
}

// 自定义 memo 比较器：只有「本节点数据 / 折叠态 / 选中态」变化才重渲染。
// 回调闭包（onToggleCollapse 等）每次画布重算都会拿到新引用，不参与比较——
// 旧闭包按 nodeId 派发动作，最多滞后一个快照，对本节点操作语义无影响。
function todoNodeAreEqual(a: NodeProps, b: NodeProps): boolean {
  const ad = a.data as unknown as TodoNodeData
  const bd = b.data as unknown as TodoNodeData
  return (
    ad.node === bd.node &&
    !!ad.collapsed === !!bd.collapsed &&
    a.selected === b.selected
  )
}

function solutionNodeAreEqual(a: NodeProps, b: NodeProps): boolean {
  return (
    (a.data as { node: MindNode }).node === (b.data as { node: MindNode }).node
  )
}

export const TodoNode = memo(function TodoNode({ data, selected }: NodeProps) {
  const {
    node,
    collapsed = false,
    onToggleCollapse,
    onImageZoom,
    onMenuAction,
  } = data as unknown as TodoNodeData
  // 右键菜单「添加标签」的内嵌输入草稿
  const [tagDraft, setTagDraft] = useState("")
  const subCount = node.sub.length
  // 节点内容恰好含 1 张图时，单独渲染可缩放图片（其余文字另排）
  const singleImageId =
    node.content && imageIdsInText(node.content).size === 1
      ? Array.from(imageIdsInText(node.content))[0]
      : null
  // 节点风格：自定义边框/背景色（ARGB），无值时回落主题默认（border-border / bg-card）
  const borderCss = argbToCss(node.borderColor)
  const bgCss = argbToCss(node.bgColor)
  // 右键菜单：TodoNode 根 div 经 ContextMenuTrigger 的 render prop 接管（base-ui 只拦截 contextmenu，
  // 不影响 ReactFlow 的节点拖拽/点击/双击）；菜单内容经 Portal 渲染到 body。
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={(triggerProps) => (
          <div
            {...triggerProps}
            style={{
              ...(bgCss ? { backgroundColor: bgCss } : null),
              ...(borderCss ? { borderColor: borderCss } : null),
            }}
            className={cn(
              triggerProps.className,
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
        {node.content &&
          (singleImageId ? (
            <>
              <NodeImageZoom
                imageId={singleImageId}
                scale={node.imageZoom ?? 1}
                onZoomChange={(v) => onImageZoom?.(v)}
              />
              {(() => {
                const textOnly = stripImageTokens(node.content).trim()
                return textOnly ? (
                  <RichTextView content={textOnly} className="text-[11px]" />
                ) : null
              })()}
            </>
          ) : (
            <RichTextView content={node.content} className="text-[11px]" />
          ))}
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
        )}
      />
      <ContextMenuContent className="min-w-44">
        <ContextMenuItem onClick={() => onMenuAction?.("add-child")}>
          <Plus />
          添加子节点
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onMenuAction?.("toggle-done")}>
          {node.done ? <Undo2 /> : <Check />}
          {node.done ? "取消完成" : "标记已完成"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        {/* 添加标签：内嵌输入（非 Item），stopPropagation 防菜单键盘导航/typeahead 抢事件 */}
        <div
          className="flex items-center gap-1.5 px-1.5 py-1"
          onKeyDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <Tag className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const t = tagDraft.trim()
                if (t) {
                  onMenuAction?.(`tag:${t}`)
                  setTagDraft("")
                }
              }
            }}
            placeholder="输入标签，回车添加"
            className="h-7 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none placeholder:text-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Palette />
            节点风格
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="min-w-44">
            <div className="flex flex-col gap-1 p-1">
              <span className="px-1 text-[10px] font-medium text-muted-foreground">边框</span>
              <PaletteGrid
                current={node.borderColor}
                onPick={(argb) => onMenuAction?.(`style-border:${argb}`)}
              />
              <span className="px-1 text-[10px] font-medium text-muted-foreground">背景</span>
              <PaletteGrid
                current={node.bgColor}
                onPick={(argb) => onMenuAction?.(`style-bg:${argb}`)}
              />
            </div>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <CalendarClock />
            截止日期
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="min-w-48">
            <div
              className="flex flex-col gap-1.5 p-1"
              onKeyDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="date"
                value={node.dueDate ?? ""}
                disabled={!!node.longTerm}
                onChange={(e) => onMenuAction?.(`due:${e.target.value}`)}
                className="h-7 w-full rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label="截止日期"
              />
              <button
                type="button"
                onClick={() => onMenuAction?.("long-term")}
                className={cn(
                  "h-7 rounded-md border text-xs transition-colors",
                  node.longTerm
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {node.longTerm ? "长期任务" : "设为长期"}
              </button>
            </div>
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  )
}, todoNodeAreEqual)

/** 右键菜单色板：12 预置色 + 「清除」格（空值 = 回落主题默认）；当前选中色加 ring 高亮。 */
function PaletteGrid({
  current,
  onPick,
}: {
  current?: string
  onPick: (argb: string) => void
}) {
  return (
    <div className="grid grid-cols-6 gap-1 p-1">
      {NODE_PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          onClick={() => onPick(c)}
          className={cn(
            "size-5 rounded-md border border-border/60 transition-transform hover:scale-110",
            current === c && "ring-2 ring-primary ring-offset-1 ring-offset-popover",
          )}
          style={{ backgroundColor: argbToCss(c) }}
        />
      ))}
      <button
        type="button"
        title="清除（回落主题默认）"
        onClick={() => onPick("")}
        className={cn(
          "flex size-5 items-center justify-center rounded-md border border-dashed border-border/60 text-muted-foreground transition-transform hover:scale-110",
          !current && "ring-2 ring-primary ring-offset-1 ring-offset-popover",
        )}
      >
        <X className="size-3" />
      </button>
    </div>
  )
}

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
      <div className="mb-2 max-h-24 overflow-hidden text-xs text-foreground">
        <RichTextView content={sol.content} className="text-xs" />
      </div>
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
}, solutionNodeAreEqual)

/**
 * 单图节点内的可缩放图片：ctrl + 滚轮 调整缩放（10%–400%）。
 * 缩放实时通过 onZoomChange 上报（画布负责持久化与右下角显示）；本地 maintain scale 保证顺滑。
 * 非 ctrl 滚轮不拦截，照常交给画布（平移/缩放画布）。
 */
function NodeImageZoom({
  imageId,
  scale,
  onZoomChange,
}: {
  imageId: string
  scale: number
  onZoomChange: (value: number) => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const scaleRef = useRef(scale)
  const wrapRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const natRef = useRef<{ w: number; h: number } | null>(null)

  useEffect(() => {
    let alive = true
    getImageURL(imageId).then((u) => {
      if (alive && u) setUrl(u)
    })
    return () => {
      alive = false
    }
  }, [imageId])

  // 实际改变图片元素的尺寸（而非 transform），让占用的空间随缩放变化；左上对齐。
  const applySize = useCallback((s: number) => {
    const img = imgRef.current
    const nat = natRef.current
    if (!img || !nat) return
    // 100% 时把较长边限制在 256px 以内，避免原图过大撑爆节点
    const base = Math.min(1, 256 / Math.max(nat.w, nat.h))
    const eff = base * s
    img.style.width = `${Math.round(nat.w * eff)}px`
    img.style.height = `${Math.round(nat.h * eff)}px`
  }, [])

  // 外部缩放值（如内容变动后缩放被清除）同步进来
  useEffect(() => {
    scaleRef.current = scale
    applySize(scale)
  }, [scale, applySize])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      e.stopPropagation()
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scaleRef.current * factor))
      scaleRef.current = next
      applySize(next)
      onZoomChange(next)
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [onZoomChange, applySize])

  if (!url) {
    return <div className="h-12 w-12 animate-pulse rounded-md bg-muted ring-1 ring-border/50" />
  }

  return (
    <div
      ref={wrapRef}
      className="inline-block self-start overflow-hidden rounded-md ring-1 ring-border/50"
      style={{ lineHeight: 0 }}
    >
      {/* 图片来自 IndexedDB 的 object URL（blob:），无法走 next/image，故用原生 img */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={url}
        alt=""
        draggable={false}
        onLoad={(e) => {
          const el = e.currentTarget
          natRef.current = { w: el.naturalWidth, h: el.naturalHeight }
          applySize(scaleRef.current)
        }}
        className="block select-none"
      />
    </div>
  )
}

