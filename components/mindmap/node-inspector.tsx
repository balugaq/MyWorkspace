"use client"

import { useEffect, useRef, useState } from "react"
import { Trash2, X, Lightbulb, Tag, CalendarClock, Plus } from "lucide-react"
import { toast } from "sonner"
import { useWorkspace } from "@/lib/store"
import { addImage, imageBlobFromClipboard } from "@/lib/image-store"
import type { Category, MindNode, SolutionStatus } from "@/lib/types"
import { STATUS_META } from "@/lib/types"
import { isPristineNode } from "@/lib/mindmap"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
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
import { TagPicker } from "@/components/tag-picker"
import { cn } from "@/lib/utils"

const STATUSES: SolutionStatus[] = ["doing", "paused", "done"]
const STATUS_BTN: Record<SolutionStatus, string> = {
  doing: "data-[on=true]:bg-solution data-[on=true]:text-solution-foreground",
  paused: "data-[on=true]:bg-warning data-[on=true]:text-warning-foreground",
  done: "data-[on=true]:bg-primary data-[on=true]:text-primary-foreground",
}

export function NodeInspector({
  category,
  node,
  onClose,
}: {
  category: Category
  node: MindNode
  onClose: () => void
}) {
  const updateNode = useWorkspace((s) => s.updateNode)
  const removeNode = useWorkspace((s) => s.removeNode)
  const setNodeSolution = useWorkspace((s) => s.setNodeSolution)
  const addNode = useWorkspace((s) => s.addNode)
  const connectNodes = useWorkspace((s) => s.connectNodes)

  const patch = (p: Partial<MindNode>) => updateNode(category.id, node.id, p)
  const solStatus = node.solution?.status ?? "doing"
  const [confirmDel, setConfirmDel] = useState(false)

  // 添加子节点：以「当前节点名 + 空格 + 序号」命名，序号自动避开已存在标题；
  // 新节点直接置于父节点右侧同一高度（不再按子节点数量向下错开），自动连线（flow），并打开其详情。
  function handleAddChild() {
    if (!category.relation) return
    const base = node.title?.trim() || "新节点"
    const existing = new Set(
      category.relation.nodes.map((n) => (n.title ?? "").trim()),
    )
    let seq = 1
    while (existing.has(`${base} ${seq}`)) seq++
    const childTitle = `${base} ${seq}`

    const pos = node.position ?? { x: 200, y: 120 }
    const childPos = { x: pos.x + 300, y: pos.y }

    const childId = addNode(category.id, childPos, childTitle)
    connectNodes(category.id, node.id, childId, "flow")
    // addNode 已将 activeItemId 设为新节点，节点详情面板会随之切换到新节点
  }

  // 标签（由共享 TagPicker 编辑）
  const tags = node.tags ?? []

  // 是否为「完全新的节点」：仅含 title、其它内容为空且无子节点时，删除无需二次确认。
  // 逻辑见 lib/mindmap.ts 的 isPristineNode（删除按钮与键盘删除共用）。
  const isPristine = isPristineNode(node, category.relation?.edges ?? [])


  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">节点详情</h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onClose}
        >
          <X className="size-4" />
          <span className="sr-only">关闭</span>
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        <div className="flex flex-col gap-4 p-4">
          <Field label="标题">
            <Input
              value={node.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="节点标题"
            />
          </Field>

          <div className="flex flex-col gap-1.5">
            <Button
              type="button"
              onClick={handleAddChild}
              className="w-full gap-2 bg-solution text-solution-foreground hover:bg-solution/90"
            >
              <Plus className="size-4" />
              添加子节点
            </Button>
          </div>

          <Field label="内容">
            <DebouncedTextarea value={node.content} onCommit={(v) => patch({ content: v })} />
          </Field>

          <Separator />

          <Field label="原因 (cause)">
            <Input
              value={node.cause}
              onChange={(e) => patch({ cause: e.target.value })}
              placeholder="为什么要做"
            />
          </Field>
          <Field label="导向 (lead to)">
            <Input
              value={node.leadTo}
              onChange={(e) => patch({ leadTo: e.target.value })}
              placeholder="会带来什么"
            />
          </Field>
          <Field label="结果 (result)">
            <Input
              value={node.result}
              onChange={(e) => patch({ result: e.target.value })}
              placeholder="最终结果"
            />
          </Field>

          <Separator />

          {/* 标签（与小说/通用类共用同一标签体系） */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <Tag className="size-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">标签</span>
            </div>
            <TagPicker tags={tags} onChange={(next) => patch({ tags: next })} />
          </div>

          <Separator />

          {/* 截止日期 / 长期任务 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <CalendarClock className="size-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">截止日期</span>
            </div>
            <div className="flex gap-2">
              <Input
                type="date"
                value={node.dueDate ?? ""}
                disabled={!!node.longTerm}
                onChange={(e) =>
                  patch({ dueDate: e.target.value || null, longTerm: false })
                }
                className="h-8 flex-1 text-xs"
              />
              <Button
                size="sm"
                variant={node.longTerm ? "default" : "outline"}
                className="h-8 shrink-0"
                onClick={() => patch({ longTerm: !node.longTerm, dueDate: null })}
              >
                {node.longTerm ? "长期任务" : "设为长期"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {node.longTerm
                ? "这是一个长期任务，无固定日期，不出现在日历中。"
                : "选择日期后，该任务会作为“截止任务”显示在日历对应日期。"}
            </p>
          </div>

          <Separator />

          {/* 完成状态 / 隐藏（连线即子任务，详情里不再单独管理子任务） */}
          <div className="flex flex-col gap-2">
            <label className="flex cursor-pointer select-none items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
              <Checkbox
                checked={!!node.done}
                onCheckedChange={(v) => patch({ done: !!v })}
              />
              已完成
            </label>
            <label className="flex cursor-pointer select-none items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
              <Checkbox
                checked={!!node.hidden}
                onCheckedChange={(v) => patch({ hidden: !!v })}
              />
              {node.hidden ? "已隐藏（仅在列表显示）" : "在图里隐藏"}
            </label>
            <p className="text-xs text-muted-foreground">
              隐藏后节点不再显示在思维导图画布上，仍可在列表视图中查看与恢复。
            </p>
          </div>

          <Separator />

          <div className="flex flex-col gap-2 rounded-lg border border-solution/40 bg-solution/5 p-3">
            <div className="flex items-center gap-1.5">
              <Lightbulb className="size-4 text-solution" />
              <span className="text-sm font-medium">解决方案</span>
            </div>
            <textarea
              value={node.solution?.content ?? ""}
              onChange={(e) =>
                setNodeSolution(category.id, node.id, e.target.value, solStatus)
              }
              placeholder="记录解决方案，将以绿线连接到节点…"
              className="min-h-16 w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            <div className="flex gap-1.5">
              {STATUSES.map((st) => (
                <button
                  key={st}
                  type="button"
                  data-on={node.solution?.status === st}
                  onClick={() =>
                    setNodeSolution(
                      category.id,
                      node.id,
                      node.solution?.content ?? "",
                      st
                    )
                  }
                  disabled={!node.solution?.content}
                  className={cn(
                    "flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors disabled:opacity-40",
                    "bg-background text-muted-foreground",
                    STATUS_BTN[st]
                  )}
                >
                  {STATUS_META[st].symbol} {STATUS_META[st].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>

      <div className="border-t p-3">
        <Button
          variant="outline"
          className="w-full gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            if (isPristine) {
              removeNode(category.id, node.id)
              toast.success("已删除节点")
              onClose()
            } else {
              setConfirmDel(true)
            }
          }}
        >
          <Trash2 className="size-4" />
          删除节点
        </Button>
      </div>

      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除节点「{node.title || "未命名"}」？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除该节点及其关联连线；若它是其它节点的子任务，也会从父节点移除。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                removeNode(category.id, node.id)
                toast.success("已删除节点")
                onClose()
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

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

/** 本地受控 + 短防抖的文本域：避免每次按键触发 store 更新导致画布整体重渲染卡顿 */
function DebouncedTextarea({
  value,
  onCommit,
}: {
  value: string
  onCommit: (v: string) => void
}) {
  const [local, setLocal] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    setLocal(value)
  }, [value])

  useEffect(() => {
    if (local === value) return
    const t = setTimeout(() => onCommit(local), 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local])

  async function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const blob = imageBlobFromClipboard(e.clipboardData)
    if (!blob) return
    e.preventDefault()
    const id = await addImage(blob, blob.type)
    const el = ref.current
    const st = el?.selectionStart ?? local.length
    const en = el?.selectionEnd ?? local.length
    const token = `{{img:${id}}}`
    setLocal(local.slice(0, st) + token + local.slice(en))
    onCommit(local.slice(0, st) + token + local.slice(en))
  }

  return (
    <textarea
      ref={ref}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onPaste={onPaste}
      onBlur={() => onCommit(local)}
      placeholder="补充说明…（可 Ctrl+V 粘贴图片）"
      className="min-h-16 w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    />
  )
}
