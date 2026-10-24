// 全局顶栏（TODO 25 打磨）：左 = 移动端导航 + 品牌区，右 = 搜索 + 头像菜单；主题切换已移入设置页。

"use client"

import { useMemo, useSyncExternalStore } from "react"
import { Cake, Search, Command, User, PanelLeft, UserCircle, Settings2, Bell } from "lucide-react"
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
import { useTranslation } from "react-i18next"

// 生日横幅（TODO 61）：settings.birthdayBannerDays 天内（含当天）显示，当天过生日的名字高亮；点击跳联系人页
function BirthdayBanner() {
  const { t } = useTranslation()
  const contacts = useWorkspace((s) => s.contacts)
  const settings = useWorkspace((s) => s.settings)
  const goContacts = useWorkspace((s) => s.goContacts)

  const list = useMemo(() => {
    // 用户自己的生日（公历 yyyy-MM-dd）作为伪联系人一并纳入
    const self: Person | null =
      settings.birthday
        ? { id: "__self__", name: settings.userName.trim() || t("brandHeader.self"), birthday: settings.birthday }
        : null
    const people = self ? [self, ...contacts] : contacts
    return upcomingBirthdays(people, settings.birthdayBannerDays, new Date())
  }, [contacts, settings.birthday, settings.userName, settings.birthdayBannerDays, t])

  if (list.length === 0) return null

  const todayCount = list.filter((b) => b.daysUntil === 0).length
  const bTail = (b: (typeof list)[number]) =>
    b.daysUntil === 0 ? t("brandHeader.tailToday") : t("brandHeader.tailIn", { n: b.daysUntil })
  const bDate = (b: (typeof list)[number]) => `${b.month}/${b.day}${b.lunar ? t("brandHeader.lunarTag") : ""}`
  const summary =
    list.length === 1
      ? t("brandHeader.birthdaySingle", { name: list[0].person.name, date: bDate(list[0]), tail: bTail(list[0]) })
      : t("brandHeader.birthdayMulti", {
          n: list.length,
          names: list.slice(0, 3).map((b) => b.person.name).join(", "),
          extra: list.length > 3 ? t("brandHeader.morePeople", { n: list.length - 3 }) : "",
        })
  const detail = list
    .map((b) => t("brandHeader.bDetail", { name: b.person.name, date: bDate(b), tail: bTail(b) }))
    .join("\n")

  return (
    <button
      type="button"
      onClick={goContacts}
      title={`${t("brandHeader.openContacts")}\n${detail}`}
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
  // TODO 75：极光背景开启时顶栏改半透明毛玻璃，透出底层游动极光
  const auroraBackground = useWorkspace((s) => s.settings.auroraBackground)
  const { t } = useTranslation()
  const view = useWorkspace((s) => s.view)
  const goAIChat = useWorkspace((s) => s.goAIChat)
  const goProfile = useWorkspace((s) => s.goProfile)
  const goSettings = useWorkspace((s) => s.goSettings)
  // 通知未读数：createdAt 晚于已读水位的条数（进通知页即标记已读、徽标清零，逻辑在 store.goNotifications）
  const goNotifications = useWorkspace((s) => s.goNotifications)
  const notifications = useWorkspace((s) => s.notifications)
  const lastReadNotificationsAt = useWorkspace((s) => s.lastReadNotificationsAt)
  const unreadCount = notifications.filter(
    (n) => Date.parse(n.createdAt) > (lastReadNotificationsAt ?? 0),
  ).length
  // 客户端专用平台检测：useSyncExternalStore 订阅空源（渲染期不可直接读 navigator 触发 hydration 差异）
  const isMac = useSyncExternalStore(
    () => () => {},
    () => /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent),
    () => false,
  )

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
    <header
      className={`flex h-14 shrink-0 items-center justify-between border-b px-4${
        auroraBackground ? " relative z-20 bg-sidebar/70" : " bg-sidebar"
      }`}
    >
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-9 md:hidden"
          onClick={onOpenNav}
        >
          <PanelLeft className="size-4" />
          <span className="sr-only">{t("brandHeader.openNav")}</span>
        </Button>

        <button
          type="button"
          onClick={goAIChat}
          title={t("brandHeader.home")}
          className="flex cursor-pointer items-center gap-2 transition-opacity hover:opacity-80"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 应用图标直接用 favicon */}
          <img src="/favicon.ico" alt="My Workspace" className="size-8 rounded-lg" />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">{t("brandHeader.appName")}</span>
            <span className="text-[11px] text-muted-foreground">My Workspace</span>
          </div>
        </button>
      </div>

      <BirthdayBanner />

      <div className="flex items-center gap-2">
        {/* TODO 56：搜索框，仅随笔视图显示 */}
        {view === "workspace" && (
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted"
          >
            <Search className="size-4" />
            <span className="hidden text-left sm:inline">{t("brandHeader.searchAll")}</span>
            <kbd className="hidden items-center gap-0.5 rounded border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground sm:flex">
              {settings.shortcuts.search.modifier &&
                (isMac ? <Command className="size-2.5" /> : <span className="text-[10px] font-medium">Ctrl</span>)}
              {settings.shortcuts.search.key.toUpperCase()}
            </kbd>
          </button>
        )}

        {/* TODO 89：通知铃铛移到用户头像左侧，功能不变（点击进通知页即标记已读） */}
        <button
          type="button"
          onClick={goNotifications}
          title={t("notif.title")}
          className="relative flex size-8 shrink-0 cursor-pointer items-center justify-center transition-colors hover:opacity-80"
        >
          <Bell className="size-4.5 text-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        {/* 头像菜单含个人/设置项；独立设置按钮已移除（功能与菜单重复） */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                title={t("brandHeader.account")}
                className="flex size-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-sidebar-border bg-sidebar-accent transition-colors hover:bg-sidebar-accent/70"
              >
                {avatar}
              </button>
            }
          >
            <span className="sr-only">{t("brandHeader.accountMenu")}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-fit min-w-0">
            <DropdownMenuItem onClick={goProfile}>
              <UserCircle className="size-4" />
              {t("brandHeader.openProfile")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={goSettings}>
              <Settings2 className="size-4" />
              {t("brandHeader.openSettings")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
