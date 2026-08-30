// 模型管理弹窗：列出已添加的模型、选中当前使用的模型，并支持添加 / 编辑 / 删除。
// 纯前端多模型配置：每条模型独立保存供应商与密钥，互不干扰。
// 受控组件：由父级（AI 对话输入区的「模型」按钮 / 设置页「管理模型」）持有 open 状态。

"use client"

import { useState } from "react"
import { Check, Pencil, Plus, Trash2 } from "lucide-react"

import { useWorkspace } from "@/lib/store"
import { AI_PROVIDERS } from "@/lib/ai/providers"
import type { AIModelEntry, AIProviderId } from "@/lib/types"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export function ModelManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const settings = useWorkspace((s) => s.settings)
  const updateSettings = useWorkspace((s) => s.updateSettings)

  const models = settings.aiModels
  const activeId = settings.aiActiveModelId

  const [editing, setEditing] = useState<AIModelEntry | null>(null)

  const startAdd = () => {
    setEditing({
      id: `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      label: "",
      provider: "zcode",
      apiKey: "",
      baseUrl: "",
      model: "",
    })
  }

  const save = (entry: AIModelEntry) => {
    const label = entry.label.trim() || AI_PROVIDERS[entry.provider]?.label || "未命名模型"
    const exists = models.some((m) => m.id === entry.id)
    const next = exists
      ? models.map((m) => (m.id === entry.id ? { ...entry, label } : m))
      : [...models, { ...entry, label }]
    // 若此前没有任何选中模型（如首个模型），则把刚保存的这条设为当前。
    const nextActive =
      activeId && next.some((m) => m.id === activeId)
        ? activeId
        : (next[next.length - 1]?.id ?? null)
    updateSettings({ aiModels: next, aiActiveModelId: nextActive })
    setEditing(null)
  }

  const remove = (id: string) => {
    if (!confirm("确定删除这个模型配置？")) return
    const next = models.filter((m) => m.id !== id)
    const nextActive = activeId === id ? (next[0]?.id ?? null) : activeId
    updateSettings({ aiModels: next, aiActiveModelId: nextActive })
  }

  const selectActive = (id: string) => updateSettings({ aiActiveModelId: id })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>模型管理</DialogTitle>
          <DialogDescription>
            可添加多个模型并随时切换；每条模型独立保存供应商与密钥（仅本机存储）。
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          <ModelForm initial={editing} onCancel={() => setEditing(null)} onSave={save} />
        ) : (
          <div className="flex flex-col gap-2">
            {models.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                还没有配置任何模型，点击下方「添加模型」开始。
              </p>
            ) : (
              <ul className="native-scroll flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
                {models.map((m) => {
                  const isActive = m.id === activeId
                  return (
                    <li
                      key={m.id}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2",
                        isActive ? "border-primary/50 bg-primary/5" : "bg-muted/30",
                      )}
                    >
                      <button
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() => selectActive(m.id)}
                        title="点击设为当前模型"
                      >
                        {isActive ? (
                          <Check className="size-4 shrink-0 text-primary" />
                        ) : (
                          <span className="size-4 shrink-0" />
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{m.label}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {AI_PROVIDERS[m.provider]?.label ?? m.provider}
                            {m.model ? ` · ${m.model}` : " · 默认模型"}
                          </span>
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditing(m)}
                        title="编辑"
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => remove(m.id)}
                        title="删除"
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
            <Button variant="outline" className="gap-1.5" onClick={startAdd}>
              <Plus className="size-4" /> 添加模型
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ModelForm({
  initial,
  onCancel,
  onSave,
}: {
  initial: AIModelEntry
  onCancel: () => void
  onSave: (e: AIModelEntry) => void
}) {
  const [provider, setProvider] = useState<AIProviderId>(initial.provider)
  const [label, setLabel] = useState(initial.label)
  const [apiKey, setApiKey] = useState(initial.apiKey)
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl)
  const [model, setModel] = useState(initial.model)
  const id = initial.id

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label className="text-xs">名称</Label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="如：我的 DeepSeek / GPT-4o"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">供应商</Label>
        <Select
          value={provider}
          onValueChange={(v) => {
            if (v) setProvider(v as AIProviderId)
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue>{AI_PROVIDERS[provider]?.label ?? "选择供应商"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.values(AI_PROVIDERS).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">API Key</Label>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={AI_PROVIDERS[provider]?.apiKeyPlaceholder ?? "API Key"}
        />
      </div>
      {provider === "custom" && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Base URL</Label>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
          />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <Label className="text-xs">模型名（留空用供应商默认）</Label>
        <Input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={`默认 ${AI_PROVIDERS[provider]?.defaultModel ?? "gpt-4o-mini"}`}
        />
      </div>
      <div className="mt-1 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          取消
        </Button>
        <Button
          onClick={() => onSave({ id, label, provider, apiKey, baseUrl, model })}
          disabled={!apiKey.trim()}
        >
          保存
        </Button>
      </div>
    </div>
  )
}
