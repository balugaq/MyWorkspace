// 技能启停弹窗：列出全部可用技能（用户技能 public/skills/*.md + 内置只读技能），
// 通过开关全局启用 / 禁用某个技能。状态写入 settings.aiEnabledSkills
// （null = 全部启用；数组 = 显式启用的技能名清单）。
// 受控组件：由父级（AI 对话输入区的「技能」按钮）持有 open 状态。

"use client"

import { useEffect, useState } from "react"

import { useWorkspace } from "@/lib/store"
import { loadSkills, type Skill } from "@/lib/ai/skills"
import { BUILTIN_SKILL_DISPLAY } from "@/lib/ai/builtin-skills"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

interface SkillRow {
  name: string
  description: string
  source: "内置" | "用户"
}

export function SkillsToggleDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const settings = useWorkspace((s) => s.settings)
  const updateSettings = useWorkspace((s) => s.updateSettings)

  const [userSkills, setUserSkills] = useState<Skill[]>([])

  useEffect(() => {
    if (!open) return
    loadSkills()
      .then(setUserSkills)
      .catch(() => setUserSkills([]))
  }, [open])

  const enabled = settings.aiEnabledSkills
  const builtinRows: SkillRow[] = BUILTIN_SKILL_DISPLAY.map((s) => ({
    name: s.name,
    description: s.description,
    source: "内置",
  }))
  const userRows: SkillRow[] = userSkills.map((s) => ({
    name: s.name,
    description: s.description,
    source: "用户",
  }))
  const rows = [...builtinRows, ...userRows]

  const isOn = (name: string) => !enabled || enabled.includes(name)

  const toggle = (name: string, on: boolean) => {
    const allNames = rows.map((r) => r.name)
    const curSet = enabled ?? allNames
    const next = on
      ? curSet.includes(name)
        ? curSet
        : [...curSet, name]
      : curSet.filter((n) => n !== name)
    // 归一化：若与「全部启用」等价，则记回 null，语义更干净。
    const allOn = allNames.length > 0 && allNames.every((n) => next.includes(n))
    updateSettings({ aiEnabledSkills: allOn ? null : next })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>技能启停</DialogTitle>
          <DialogDescription>
            关闭后该技能在本工作台的 AI 对话中不可被调用。所有技能保持默认开启。
          </DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            未找到任何技能。
          </p>
        ) : (
          <ul className="native-scroll flex max-h-80 flex-col gap-1.5 overflow-y-auto pr-1">
            {rows.map((r) => (
              <li
                key={r.name}
                className="flex items-start gap-3 rounded-lg border bg-muted/30 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{r.name}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[10px]",
                        r.source === "内置"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {r.source}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {r.description}
                  </p>
                </div>
                <Switch
                  checked={isOn(r.name)}
                  onCheckedChange={(v) => toggle(r.name, v)}
                />
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
