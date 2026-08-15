"use client"

import { useEffect, useState } from "react"
import { Search, Moon, Sun, Command, Settings as SettingsIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { useWorkspace } from "@/lib/store"
import type { ThemePreference } from "@/lib/types"

export function Topbar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const view = useWorkspace((s) => s.view)
  const categories = useWorkspace((s) => s.categories)
  const activeCategoryId = useWorkspace((s) => s.activeCategoryId)
  const settings = useWorkspace((s) => s.settings)
  const updateSettings = useWorkspace((s) => s.updateSettings)
  const setSettingsOpen = useWorkspace((s) => s.setSettingsOpen)

  useEffect(() => setMounted(true), [])

  const activeCategory = categories.find((c) => c.id === activeCategoryId)
  const title = view === "calendar" ? "日历" : (activeCategory?.name ?? "工作台")
  const subtitle =
    view === "calendar"
      ? "记录每日笔记、待办与日程"
      : activeCategory?.template === "relation"
        ? "关系思维图"
        : activeCategory
          ? "条目工作区"
          : ""

  function toggleTheme() {
    const next: ThemePreference = settings.theme === "dark" ? "light" : "dark"
    updateSettings({ theme: next })
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-3 backdrop-blur md:px-4">
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-serif text-base font-semibold leading-tight text-foreground">
          {title}
        </h1>
        {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>

      <button
        type="button"
        onClick={onOpenSearch}
        className="flex h-9 items-center gap-2 rounded-lg border bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted"
      >
        <Search className="size-4" />
        <span className="hidden text-left sm:inline">搜索全部内容…</span>
        <kbd className="hidden items-center gap-0.5 rounded border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground sm:flex">
          <Command className="size-2.5" />
          {settings.shortcuts.search.modifier ? "⌘" : ""}
          {settings.shortcuts.search.key.toUpperCase()}
        </kbd>
      </button>

      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        onClick={() => setSettingsOpen(true)}
      >
        <SettingsIcon className="size-4" />
        <span className="sr-only">设置</span>
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        onClick={toggleTheme}
      >
        {mounted && resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        <span className="sr-only">切换主题</span>
      </Button>
    </header>
  )
}
