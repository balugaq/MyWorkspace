// 全局顶栏（TODO 25 打磨）：左侧 = 移动端导航按钮 + 品牌区（点击回到主界面 AI 对话）；
// 右侧 = 搜索框 + 设置 + 头像（最右，点击弹出「打开个人主页 / 打开设置」菜单）。
// 主题切换已移入设置页「外观主题」，顶栏不再提供。

"use client"

import { useEffect, useMemo, useState } from "react"
import { Cake, Search, Command, User, PanelLeft, UserCircle, Settings2 } from "lucide-react"
import { useWorkspace } from "@/lib/store"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { upcomingBirthdays } from "@/lib/birthday"
import type { Person } from "@/lib/address-book"
import { cn } from "@/lib/utils"

// 生日横幅（TODO 61）：brandHeader 中间段，临近生日（settings.birthdayBannerDays 天内，含当天）
// 时显示；单人文案「xxx 最近生日（M月D日，还有 n 天）」，多人文案「最近有 n 人生日（xxx、xxx）」；
// 当天过生日的名字高亮强调。点击横幅跳转联系人页。
function BirthdayBanner() {
  const contacts = useWorkspace((s) => s.contacts)
  const settings = useWorkspace((s) => s.settings)
  const goContacts = useWorkspace((s) => s.goContacts)

  const list = useMemo(() => {
    // 设置里的用户自己的生日（公历 yyyy-MM-dd）作为一个伪联系人一并纳入
    const self: Person | null =
      settings.birthday
        ? { id: "__self__", name: settings.userName.trim() || "自己", birthday: settings.birthday }
        : null
    const people = self ? [self, ...contacts] : contacts
    return upcomingBirthdays(people, settings.birthdayBannerDays, new Date())
  }, [contacts, settings.birthday, settings.userName, settings.birthdayBannerDays])

  if (list.length === 0) return null

  const todayCount = list.filter((b) => b.daysUntil === 0).length
  const summary =
    list.length === 1
      ? `${list[0].person.name} 最近生日（${list[0].month}月${list[0].day}日${
          list[0].daysUntil === 0 ? "，就是今天" : `，还有 ${list[0].daysUntil} 天`
        }${list[0].lunar ? " · 农历" : ""}）`
      : `最近有 ${list.length} 人生日（${list
          .slice(0, 3)
          .map((b) => b.person.name)
          .join("、")}${list.length > 3 ? ` 等 ${list.length} 人` : ""}）`
  const detail = list
    .map((b) => `${b.person.name}：${b.month}月${b.day}日${b.lunar ? "（农历）" : ""}${b.daysUntil === 0 ? "（今天）" : `（还有 ${b.daysUntil} 天）`}`)
    .join("\n")

  return (
    <button
      type="button"
      onClick={goContacts}
      title={`点击打开联系人\n${detail}`}
      className={cn(
        "hidden min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors md:flex",
        todayCount > 0
          ? "bg-primary/10 text-primary hover:bg-primary/15"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Cake className={cn("size-3.5 shrink-0", todayCount > 0 && "animate-pulse")} />
      <span className="truncate">
        {summary}
        {todayCount > 0 && " ✨"}
      </span>
    </button>
  )
}

export function BrandHeader({
  onOpenNav,
  onOpenSearch,
}: {
  onOpenNav: () => void
  onOpenSearch: () => void
}) {
  const settings = useWorkspace((s) => s.settings)
  const view = useWorkspace((s) => s.view)
  const goAIChat = useWorkspace((s) => s.goAIChat)
  const goProfile = useWorkspace((s) => s.goProfile)
  const goSettings = useWorkspace((s) => s.goSettings)
  const [isMac, setIsMac] = useState(false)

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent))
  }, [])

  const avatar = settings.aiUserAvatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={settings.aiUserAvatar}
      alt="用户头像"
      className="size-full object-cover"
    />
  ) : (
    <User className="size-4 text-muted-foreground" />
  )

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-sidebar px-4">
      <div className="flex items-center gap-2">
        {/* 移动端导航按钮：呼出侧边栏 Sheet（桌面端侧边栏常驻） */}
        <Button
          variant="ghost"
          size="icon"
          className="size-9 md:hidden"
          onClick={onOpenNav}
        >
          <PanelLeft className="size-4" />
          <span className="sr-only">打开导航</span>
        </Button>

        {/* 品牌区：点击回到主界面（AI 对话）。图标用应用 favicon（TODO 25 打磨） */}
        <button
          type="button"
          onClick={goAIChat}
          title="回到主界面"
          className="flex cursor-pointer items-center gap-2 transition-opacity hover:opacity-80"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 应用图标直接用 favicon */}
          <img src="/favicon.ico" alt="My Workspace" className="size-8 rounded-lg" />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">全能工作台</span>
            <span className="text-[11px] text-muted-foreground">My Workspace</span>
          </div>
        </button>
      </div>

      {/* 中间段：生日横幅（TODO 61），无临近生日时不占位；移动端隐藏 */}
      <BirthdayBanner />

      <div className="flex items-center gap-2">
        {/* 搜索框（TODO 56）：仅随笔视图显示 */}
        {view === "workspace" && (
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
        )}

        {/* 头像（最右）：点击弹出「打开个人主页 / 打开设置」（设置按钮与头像菜单功能重复，已移除独立按钮） */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                title="账号"
                className="flex size-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-sidebar-border bg-sidebar-accent transition-colors hover:bg-sidebar-accent/70"
              >
                {avatar}
              </button>
            }
          >
            <span className="sr-only">账号菜单</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={goProfile}>
              <UserCircle className="size-4" />
              打开个人主页
            </DropdownMenuItem>
            <DropdownMenuItem onClick={goSettings}>
              <Settings2 className="size-4" />
              打开设置
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
