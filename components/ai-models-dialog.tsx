// 模型管理弹窗：增删改选模型；纯前端配置，每条模型独立保存供应商与密钥。
// 受控组件：open 由父级（AI 输入区「模型」按钮 / 设置页）持有。

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
import { useTranslation } from "react-i18next"

export function ModelManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const settings = useWorkspace((s) => s.settings)
  const { t } = useTranslation()
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
    const label = entry.label.trim() || AI_PROVIDERS[entry.provider]?.label || t("models.untitled")
    const exists = models.some((m) => m.id === entry.id)
    const next = exists
      ? models.map((m) => (m.id === entry.id ? { ...entry, label } : m))
      : [...models, { ...entry, label }]
    // 此前没有选中模型（如首个模型）时，把刚保存的这条设为当前
    const nextActive =
      activeId && next.some((m) => m.id === activeId)
        ? activeId
        : (next[next.length - 1]?.id ?? null)
    updateSettings({ aiModels: next, aiActiveModelId: nextActive })
    setEditing(null)
  }

  const remove = (id: string) => {
    if (!confirm(t("models.deleteConfirm"))) return
    const next = models.filter((m) => m.id !== id)
    const nextActive = activeId === id ? (next[0]?.id ?? null) : activeId
    updateSettings({ aiModels: next, aiActiveModelId: nextActive })
  }

  const selectActive = (id: string) => updateSettings({ aiActiveModelId: id })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("models.title")}</DialogTitle>
          <DialogDescription>
            {t("models.desc")}
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          <ModelForm initial={editing} onCancel={() => setEditing(null)} onSave={save} />
        ) : (
          <div className="flex flex-col gap-2">
            {models.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                {t("models.empty")}
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
                        title={t("models.setActive")}
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
                            {m.model ? ` · ${m.model}` : t("models.defaultModel")}
                          </span>
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditing(m)}
                        title={t("common.edit")}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => remove(m.id)}
                        title={t("common.delete")}
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
            <Button variant="outline" className="gap-1.5" onClick={startAdd}>
              <Plus className="size-4" /> {t("models.add")}
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
  const { t } = useTranslation()
  const [provider, setProvider] = useState<AIProviderId>(initial.provider)
  const [label, setLabel] = useState(initial.label)
  const [apiKey, setApiKey] = useState(initial.apiKey)
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl)
  const [model, setModel] = useState(initial.model)
  const id = initial.id

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label className="text-xs">{t("models.name")}</Label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t("models.namePlaceholder")}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">{t("models.provider")}</Label>
        <Select
          value={provider}
          onValueChange={(v) => {
            if (v) setProvider(v as AIProviderId)
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue>{AI_PROVIDERS[provider]?.label ?? t("models.pickProvider")}</SelectValue>
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
        <Label className="text-xs">{t("models.modelName")}</Label>
        <Input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={`默认 ${AI_PROVIDERS[provider]?.defaultModel ?? "gpt-4o-mini"}`}
        />
      </div>
      <div className="mt-1 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          onClick={() => onSave({ id, label, provider, apiKey, baseUrl, model })}
          disabled={!apiKey.trim()}
        >
          {t("common.save")}
        </Button>
      </div>
    </div>
  )
}
