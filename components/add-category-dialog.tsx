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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useWorkspace } from "@/lib/store"
import { TEMPLATES, type TemplateType } from "@/lib/types"
import { getIcon } from "@/lib/icons"
import { cn } from "@/lib/utils"

export function AddCategoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const addCategory = useWorkspace((s) => s.addCategory)
  const [name, setName] = useState("")
  const [template, setTemplate] = useState<TemplateType>("novel")
  const [namingRule, setNamingRule] = useState("第%首")
  const [autoNumber, setAutoNumber] = useState(true)
  const [count, setCount] = useState(3)

  function reset() {
    setName("")
    setTemplate("novel")
    setNamingRule("第%首")
    setAutoNumber(true)
    setCount(3)
  }

  function submit() {
    if (!name.trim()) {
      toast.error("请填写分类名称")
      return
    }
    addCategory(
      name.trim(),
      template,
      template === "novel" ? { namingRule, autoNumber, itemLabel: "章节" } : {},
      template === "novel" ? Math.max(0, Math.min(300, count)) : 0,
    )
    toast.success(`已创建分类「${name.trim()}」`)
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>新建分类</DialogTitle>
          <DialogDescription>选择模板并配置，创建后可在侧边栏管理内容。</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="cat-name">分类名称</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：糖诗三百首收录"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>模板类型</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TEMPLATES.map((t) => {
                const Icon = getIcon(t.icon)
                const active = template === t.type
                return (
                  <button
                    key={t.type}
                    type="button"
                    onClick={() => {
                      setTemplate(t.type)
                      if (t.type === "novel") setNamingRule("第%首")
                    }}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                      active
                        ? "border-primary bg-accent text-accent-foreground"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    <Icon className="size-4 text-primary" />
                    <span className="text-sm font-medium">{t.label}</span>
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground text-pretty">
              {TEMPLATES.find((t) => t.type === template)?.description}
            </p>
          </div>

          {template === "novel" && (
            <div className="flex flex-col gap-4 rounded-lg border bg-muted/40 p-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="naming">命名规则</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="naming"
                    value={namingRule}
                    onChange={(e) => setNamingRule(e.target.value)}
                    placeholder="第%首"
                    className="max-w-40"
                  />
                  <span className="text-xs text-muted-foreground">
                    {"用 % 表示编号占位，如 第%首 → 第一首"}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="auto" className="cursor-pointer">
                  自动中文编号
                </Label>
                <Switch id="auto" checked={autoNumber} onCheckedChange={setAutoNumber} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="count">初始条目数量</Label>
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
