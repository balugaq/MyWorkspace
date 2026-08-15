"use client"

import { Trash2, X, Lightbulb } from "lucide-react"
import { toast } from "sonner"
import { useWorkspace } from "@/lib/store"
import type { Category, MindNode, SolutionStatus } from "@/lib/types"
import { STATUS_META } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
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

  const patch = (p: Partial<MindNode>) => updateNode(category.id, node.id, p)
  const solStatus = node.solution?.status ?? "doing"

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">节点详情</h2>
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
          <X className="size-4" />
          <span className="sr-only">关闭</span>
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-4">
          <Field label="标题">
            <Input value={node.title} onChange={(e) => patch({ title: e.target.value })} placeholder="节点标题" />
          </Field>

          <Field label="内容">
            <textarea
              value={node.content}
              onChange={(e) => patch({ content: e.target.value })}
              placeholder="补充说明…"
              className="min-h-16 w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </Field>

          <Separator />

          <Field label="原因 (cause)">
            <Input value={node.cause} onChange={(e) => patch({ cause: e.target.value })} placeholder="为什么要做" />
          </Field>
          <Field label="导向 (lead to)">
            <Input value={node.leadTo} onChange={(e) => patch({ leadTo: e.target.value })} placeholder="会带来什么" />
          </Field>
          <Field label="结果 (result)">
            <Input value={node.result} onChange={(e) => patch({ result: e.target.value })} placeholder="最终结果" />
          </Field>

          <Separator />

          <div className="flex flex-col gap-2 rounded-lg border border-solution/40 bg-solution/5 p-3">
            <div className="flex items-center gap-1.5">
              <Lightbulb className="size-4 text-solution" />
              <span className="text-sm font-medium">解决方案</span>
            </div>
            <textarea
              value={node.solution?.content ?? ""}
              onChange={(e) => setNodeSolution(category.id, node.id, e.target.value, solStatus)}
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
                    setNodeSolution(category.id, node.id, node.solution?.content ?? "", st)
                  }
                  disabled={!node.solution?.content}
                  className={cn(
                    "flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors disabled:opacity-40",
                    "bg-background text-muted-foreground",
                    STATUS_BTN[st],
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
            removeNode(category.id, node.id)
            toast.success("已删除节点")
            onClose()
          }}
        >
          <Trash2 className="size-4" />
          删除节点
        </Button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
