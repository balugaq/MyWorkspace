// 人设管理弹窗：列出已创建的人设、点击选中「全局当前人设」，并支持添加 / 编辑 / 删除。
// 顶部提供「不使用人设」选项（选中即 aiActivePersonaId = null，仅用基础提示词）。
// 受控组件：由父级（设置页「管理人设」）持有 open 状态。

"use client"

import { useState } from "react"
import { Check, Pencil, Plus, Trash2 } from "lucide-react"

import { useWorkspace } from "@/lib/store"
import type { AIPersona } from "@/lib/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export function PersonaManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const settings = useWorkspace((s) => s.settings)
  const updateSettings = useWorkspace((s) => s.updateSettings)

  const personas = settings.aiPersonas
  const activeId = settings.aiActivePersonaId

  const [editing, setEditing] = useState<AIPersona | null>(null)

  const startAdd = () => {
    setEditing({
      id: `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: "",
      content: "",
    })
  }

  const save = (p: AIPersona) => {
    const name = p.name.trim() || "未命名人设"
    const exists = personas.some((x) => x.id === p.id)
    const next = exists
      ? personas.map((x) => (x.id === p.id ? { ...p, name } : x))
      : [...personas, { ...p, name }]
    // 首个创建的人设自动设为全局当前；其余保持原有选中。
    const nextActive = activeId && next.some((x) => x.id === activeId) ? activeId : next[0]?.id ?? null
    updateSettings({ aiPersonas: next, aiActivePersonaId: nextActive })
    setEditing(null)
  }

  const remove = (id: string) => {
    if (!confirm("确定删除这个人设？")) return
    const next = personas.filter((x) => x.id !== id)
    const nextActive = activeId === id ? (next[0]?.id ?? null) : activeId
    updateSettings({ aiPersonas: next, aiActivePersonaId: nextActive })
  }

  const selectActive = (id: string | null) => updateSettings({ aiActivePersonaId: id })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="native-scroll max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>人设管理</DialogTitle>
          <DialogDescription>
            可创建多个人设并选择「全局当前人设」；选中的人设会注入每一段 AI 对话的系统提示词。
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          <PersonaForm initial={editing} onCancel={() => setEditing(null)} onSave={save} />
        ) : (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => selectActive(null)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                activeId === null
                  ? "border-primary/50 bg-primary/5"
                  : "bg-muted/30 hover:border-primary/30",
              )}
            >
              {activeId === null ? (
                <Check className="size-4 shrink-0 text-primary" />
              ) : (
                <span className="size-4 shrink-0" />
              )}
              <span className="min-w-0">
                <span className="block text-sm font-medium">不使用人设</span>
                <span className="block text-xs text-muted-foreground">
                  仅使用默认系统提示词
                </span>
              </span>
            </button>

            {personas.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                还没有任何人设，点击下方「添加人设」创建第一个。
              </p>
            ) : (
              <ul className="native-scroll flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
                {personas.map((p) => {
                  const isActive = p.id === activeId
                  return (
                    <li
                      key={p.id}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2",
                        isActive ? "border-primary/50 bg-primary/5" : "bg-muted/30",
                      )}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() => selectActive(p.id)}
                        title="点击设为全局当前人设"
                      >
                        {isActive ? (
                          <Check className="size-4 shrink-0 text-primary" />
                        ) : (
                          <span className="size-4 shrink-0" />
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{p.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {p.content.trim()
                              ? p.content.trim().slice(0, 28) +
                                (p.content.trim().length > 28 ? "…" : "")
                              : "（空人设）"}
                          </span>
                        </span>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditing(p)}
                        title="编辑"
                      >
                        <Pencil />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => remove(p.id)}
                        title="删除"
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
            <Button type="button" variant="outline" className="gap-1.5" onClick={startAdd}>
              <Plus className="size-4" /> 添加人设
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function PersonaForm({
  initial,
  onCancel,
  onSave,
}: {
  initial: AIPersona
  onCancel: () => void
  onSave: (p: AIPersona) => void
}) {
  const [name, setName] = useState(initial.name)
  const [content, setContent] = useState(initial.content)
  const id = initial.id

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label className="text-xs">名称</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如：严谨的软件工程师 / 温柔的陪聊"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">人设正文（自定义指令）</Label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="例如：你是一位严谨的软件工程师，回答偏好给出可运行的代码片段与根因分析。"
          className="native-scroll min-h-28 max-h-64 overflow-y-auto resize-none text-sm"
        />
      </div>
      <div className="mt-1 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          取消
        </Button>
        <Button
          type="button"
          onClick={() => onSave({ id, name, content })}
          disabled={!content.trim()}
        >
          保存
        </Button>
      </div>
    </div>
  )
}
