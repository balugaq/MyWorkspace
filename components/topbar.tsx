"use client"

import { useEffect, useState } from "react"
import { Search, Moon, Sun, PanelLeft, Command } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { GlobalSearch } from "@/components/global-search"

export function Topbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-3 backdrop-blur md:px-4">
      <Button variant="ghost" size="icon" className="size-9 md:hidden" onClick={onToggleSidebar}>
        <PanelLeft className="size-4" />
        <span className="sr-only">打开侧边栏</span>
      </Button>

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="flex h-9 flex-1 items-center gap-2 rounded-lg border bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted md:max-w-md"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">搜索全部内容…</span>
        <kbd className="hidden items-center gap-0.5 rounded border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground sm:flex">
          <Command className="size-2.5" />K
        </kbd>
      </button>

      <div className="flex-1" />

      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      >
        {mounted && resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        <span className="sr-only">切换主题</span>
      </Button>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  )
}
