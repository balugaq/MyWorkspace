// 技能启停弹窗：列出全部技能（用户 public/skills/*.md + 内置只读），开关写入 settings.aiEnabledSkills
// （null = 全部启用；数组 = 显式启用清单）。受控组件：open 由 AI 输入区「技能」按钮持有。

"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

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
import { Input } from "@/components/ui/input"
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
  const { t } = useTranslation()
  const settings = useWorkspace((s) => s.settings)
  const updateSettings = useWorkspace((s) => s.updateSettings)

  const [userSkills, setUserSkills] = useState<Skill[]>([])
  // TODO 77：技能搜索（按名称/描述，大小写不敏感）
  const [query, setQuery] = useState("")

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
  const rows = useMemo(() => [...builtinRows, ...userRows], [builtinRows, userRows])
  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q),
    )
  }, [rows, query])

  const isOn = (name: string) => !enabled || enabled.includes(name)

  const toggle = (name: string, on: boolean) => {
    const allNames = rows.map((r) => r.name)
    const curSet = enabled ?? allNames
    const next = on
      ? curSet.includes(name)
        ? curSet
        : [...curSet, name]
      : curSet.filter((n) => n !== name)
    // 归一化：与「全部启用」等价时记回 null，语义更干净
    const allOn = allNames.length > 0 && allNames.every((n) => next.includes(n))
    updateSettings({ aiEnabledSkills: allOn ? null : next })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("aiChat.skillsToggle")}</DialogTitle>
          <DialogDescription>
            {t("skills.desc")}
          </DialogDescription>
        </DialogHeader>

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("skills.searchPlaceholder")}
          className="h-8 text-sm"
        />

        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            {t("skills.empty")}
          </p>
        ) : visibleRows.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            {t("skills.noMatch")}
          </p>
        ) : (
          <ul className="native-scroll flex max-h-80 flex-col gap-1.5 overflow-y-auto pr-1">
            {visibleRows.map((r) => (
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
                      {r.source === "内置" ? t("skills.builtin") : t("skills.user")}
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
