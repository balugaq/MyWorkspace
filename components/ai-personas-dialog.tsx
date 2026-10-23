// 人设管理弹窗：增删改选「全局当前人设」；「不使用人设」即 aiActivePersonaId = null（仅基础提示词）。
// 受控组件：open 由父级（设置页）持有。

"use client"

import { useState } from "react"
import { Check, Pencil, Plus, Trash2 } from "lucide-react"

import { useWorkspace } from "@/lib/store"
import { useTranslation } from "react-i18next"
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
import { NativeScrollArea } from "@/components/ui/native-scroll-area"
import { cn } from "@/lib/utils"

export function PersonaManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const settings = useWorkspace((s) => s.settings)
  const { t } = useTranslation()
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
    const name = p.name.trim() || t("personas.untitled")
    const exists = personas.some((x) => x.id === p.id)
    const next = exists
      ? personas.map((x) => (x.id === p.id ? { ...p, name } : x))
      : [...personas, { ...p, name }]
    // 首个创建的人设自动设为全局当前，其余保持原有选中
    const nextActive = activeId && next.some((x) => x.id === activeId) ? activeId : next[0]?.id ?? null
    updateSettings({ aiPersonas: next, aiActivePersonaId: nextActive })
    setEditing(null)
  }

  const remove = (id: string) => {
    if (!confirm(t("personas.deleteConfirm"))) return
    const next = personas.filter((x) => x.id !== id)
    const nextActive = activeId === id ? (next[0]?.id ?? null) : activeId
    updateSettings({ aiPersonas: next, aiActivePersonaId: nextActive })
  }

  const selectActive = (id: string | null) => updateSettings({ aiActivePersonaId: id })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="native-scroll max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("personas.title")}</DialogTitle>
          <DialogDescription>
            {t("personas.desc")}
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
                <span className="block text-sm font-medium">{t("personas.none")}</span>
                <span className="block text-xs text-muted-foreground">
                  {t("personas.noneDesc")}
                </span>
              </span>
            </button>

            {personas.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                {t("personas.empty")}
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
                        title={t("personas.setActive")}
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
                              : t("personas.emptyPersona")}
                          </span>
                        </span>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditing(p)}
                        title={t("common.edit")}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => remove(p.id)}
                        title={t("common.delete")}
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
            <Button type="button" variant="outline" className="gap-1.5" onClick={startAdd}>
              <Plus className="size-4" /> {t("personas.add")}
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
  const { t } = useTranslation()
  const [name, setName] = useState(initial.name)
  const [content, setContent] = useState(initial.content)
  const id = initial.id

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label className="text-xs">{t("personas.name")}</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("personas.namePlaceholder")}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">{t("personas.body")}</Label>
        <NativeScrollArea>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t("personas.bodyPlaceholder")}
            className="min-h-28 max-h-64 overflow-y-auto resize-none text-sm"
          />
        </NativeScrollArea>
      </div>
      <div className="mt-1 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          type="button"
          onClick={() => onSave({ id, name, content })}
          disabled={!content.trim()}
        >
          {t("common.save")}
        </Button>
      </div>
    </div>
  )
}
