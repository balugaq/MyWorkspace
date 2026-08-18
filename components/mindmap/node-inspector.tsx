"use client"

import { useEffect, useRef, useState } from "react"
import { Trash2, X, Lightbulb, ListTree, Tag, CalendarClock } from "lucide-react"
import { toast } from "sonner"
import { useWorkspace } from "@/lib/store"
import { addImage, imageBlobFromClipboard } from "@/lib/image-store"
import type { Category, MindNode, SolutionStatus } from "@/lib/types"
import { STATUS_META } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  const connectNodes = useWorkspace((s) => s.connectNodes)
  const removeSub = useWorkspace((s) => s.removeSub)

  const patch = (p: Partial<MindNode>) => updateNode(category.id, node.id, p)
  const solStatus = node.solution?.status ?? "doing"
  const [confirmDel, setConfirmDel] = useState(false)

  // 标签（由共享 TagPicker 编辑）
  const tags = node.tags ?? []

  // 子任务：仅展示「确实存在于 sub 连线」的直接子级节点
  const allNodes = category.relation?.nodes ?? []
  const subEdges = new Set(
    category.relation?.edges
      .filter((e) => e.kind === "sub" && e.source === node.id)
      .map((e) => e.target) ?? [],
  )
  const subs = node.sub
    .filter((id) => subEdges.has(id)) // 只保留与当前节点有 sub 连线的目标
    .map((id) => allNodes.find((n) => n.id === id))
    .filter((n): n is MindNode => !!n)
  const addable = allNodes.filter(
    (n) => n.id !== node.id && !subEdges.has(n.id),
  )

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

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <ListTree className="size-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                子任务 (Sub)
              </span>
            </div>
            {subs.length > 0 && (
              <ul className="flex flex-col gap-1">
                {subs.map((s) => (
                  <li
                    key={s.id}
                    className="group flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {s.title || "未命名"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        removeSub(category.id, node.id, s.id)
                        toast.success("已移除子任务")
                      }}
                      className="text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {subs.length === 0 && (
              <p className="text-xs text-muted-foreground">
                暂无子任务，可从下方添加。
              </p>
            )}
            {addable.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">可添加为子任务：</p>
                {addable.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      const res = connectNodes(category.id, node.id, n.id, "sub")
                      if (res === "exists") toast.error("已经连接过此节点了！")
                      else toast.success(`已将「${n.title || "未命名"}」设为子任务`)
                    }}
                    className="flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-left text-xs transition-colors hover:border-primary hover:bg-accent/40"
                  >
                    <span className="min-w-0 flex-1 truncate">{n.title || "未命名"}</span>
                    <span className="shrink-0 text-primary">+ 添加</span>
                  </button>
                ))}
              </div>
            )}
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
          onClick={() => setConfirmDel(true)}
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
