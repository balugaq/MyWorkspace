"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useWorkspace } from "@/lib/store"
import { TEMPLATES, type TemplateType } from "@/lib/types"
import { getIcon } from "@/lib/icons"
import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"
import { useEscapeClose } from "@/hooks/use-escape-close"

export function AddCategoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const addCategory = useWorkspace((s) => s.addCategory)
  const { t } = useTranslation()
  const [name, setName] = useState("")
  const [template, setTemplate] = useState<TemplateType>("novel")
  const [autoNumber, setAutoNumber] = useState(true)
  const [count, setCount] = useState(3)
  const [unit, setUnit] = useState("")

  // ESC 关闭弹窗（与其它弹窗行为一致）
  useEscapeClose(open, () => onOpenChange(false))

  function reset() {
    setName("")
    setTemplate("novel")
    setAutoNumber(true)
    setCount(3)
    setUnit("")
  }

  function submit() {
    if (!name.trim()) {
      toast.error(t("addCategory.errEmpty"))
      return
    }
    if (name.trim().length > 20) {
      toast.error(t("addCategory.errTooLong"))
      return
    }
    addCategory(
      name.trim(),
      template,
      // 关系类没有条目概念：不传条目单位
      template === "novel"
        ? { autoNumber, unit: unit.trim() || t("addCategory.defaultUnit") }
        : template === "relation"
          ? {}
          : { unit: unit.trim() || t("addCategory.defaultUnit") },
      template === "novel" ? Math.max(0, Math.min(300, count)) : 0,
    )
    toast.success(t("addCategory.created", { name: name.trim() }))
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("addCategory.title")}</DialogTitle>
          <DialogDescription>{t("addCategory.desc")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="cat-name">{t("addCategory.name")}</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("addCategory.namePlaceholder")}
              maxLength={20}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t("addCategory.template")}</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TEMPLATES.map((tpl) => {
                const Icon = getIcon(tpl.icon)
                const active = template === tpl.type
                return (
                  <button
                    key={tpl.type}
                    type="button"
                    onClick={() => {
                      setTemplate(tpl.type)
                    }}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                      active
                        ? "border-primary bg-accent text-accent-foreground"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    <Icon className="size-4 text-primary" />
                    <span className="text-sm font-medium">{t(`templates.${tpl.type}.label`)}</span>
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground text-pretty">
              {t(`templates.${template}.desc`)}
            </p>
          </div>

          {/* 条目单位仅对有「条目」概念的模板有意义；关系类（思维导图）没有条目，隐藏 */}
          {template !== "relation" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="unit">{t("addCategory.unit")}</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder={t("addCategory.defaultUnit")}
                  className="max-w-24"
                  maxLength={4}
                />
                <span className="text-xs text-muted-foreground">
                  {t("addCategory.unitHint")}
                </span>
              </div>
            </div>
          )}

          {template === "novel" && (
            <div className="flex flex-col gap-4 rounded-lg border bg-muted/40 p-4">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="auto" className="cursor-pointer">
                  {t("addCategory.autoNumber")}
                </Label>
                <Switch id="auto" checked={autoNumber} onCheckedChange={setAutoNumber} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="count">{t("addCategory.count")}</Label>
                <Input
                  id="count"
                  type="number"
                  min={0}
                  max={300}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="max-w-24"
                />
              </div>
            </div>
          )}

          {template === "relation" && (
            <div className="rounded-lg border border-primary/30 bg-accent/40 p-4 text-sm text-accent-foreground text-pretty">
              关系类将以思维导图模式创建空白画布。创建后可在画布中添加 Todo 节点、连接因果关系并附加解决方案。
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={submit}>创建</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
