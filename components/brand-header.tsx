// 全局顶栏：左侧品牌区 + 右侧（头像、搜索、设置、主题切换）。
// 原为 AppSidebar header 拆出；搜索/设置/主题按钮自 Topbar 迁入（用户要求放 avatar 右侧）。
// 品牌区是否可点击由 page.tsx 决定：仅 ai-chat 视图下可点，用于呼出悬浮 sidebar。

"use client"

import { useEffect, useState } from "react"
import { Search, Moon, Sun, Command, Settings as SettingsIcon, Sparkles, User } from "lucide-react"
import { useTheme } from "next-themes"
import { useWorkspace } from "@/lib/store"
import type { ThemePreference } from "@/lib/types"
import { Button } from "@/components/ui/button"

export function BrandHeader({
  onBrandClick,
  brandClickable = false,
  onOpenSearch,
}: {
  onBrandClick?: () => void
  brandClickable?: boolean
  onOpenSearch: () => void
}) {
  const settings = useWorkspace((s) => s.settings)
  const goProfile = useWorkspace((s) => s.goProfile)
  const setSettingsOpen = useWorkspace((s) => s.setSettingsOpen)
  const updateSettings = useWorkspace((s) => s.updateSettings)
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isMac, setIsMac] = useState(false)

  useEffect(() => {
    setMounted(true)
    setIsMac(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent))
  }, [])

  function toggleTheme() {
    const next: ThemePreference = settings.theme === "dark" ? "light" : "dark"
    updateSettings({ theme: next })
  }

  const brand = (
    <>
      <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Sparkles className="size-4" />
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold">全能工作台</span>
        <span className="text-[11px] text-muted-foreground">My Workspace</span>
      </div>
    </>
  )

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-sidebar px-4">
      {brandClickable ? (
        <button
          type="button"
          onClick={onBrandClick}
          title="打开导航"
          className="flex cursor-pointer items-center gap-2 transition-opacity hover:opacity-80"
        >
          {brand}
        </button>
      ) : (
        <div className="flex items-center gap-2">{brand}</div>
      )}
      <div className="flex items-center gap-2">
        {/* 头像按钮：点击打开个人主页 Profile Dashboard；空头像回落默认 User 图标 */}
        <button
          type="button"
          onClick={goProfile}
          title="打开个人主页"
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-sidebar-border bg-sidebar-accent transition-colors hover:bg-sidebar-accent/70"
        >
          {settings.aiUserAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.aiUserAvatar}
              alt="用户头像"
              className="size-full object-cover"
            />
          ) : (
            <User className="size-4 text-muted-foreground" />
          )}
        </button>

        {/* 搜索 / 设置 / 主题切换：自 Topbar 迁入（avatar 右侧） */}
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted"
        >
          <Search className="size-4" />
          <span className="hidden text-left sm:inline">搜索全部内容…</span>
          <kbd className="hidden items-center gap-0.5 rounded border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground sm:flex">
            {settings.shortcuts.search.modifier &&
              (isMac ? <Command className="size-2.5" /> : <span className="text-[10px] font-medium">Ctrl</span>)}
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
      </div>
    </header>
  )
}
