"use client"

// 底部工具栏（TODO 25）：绝对钉在左下角、独立于侧边栏的常驻导航枢纽。
// 由 page.tsx（桌面端左列 grid 的 auto 行）与移动端 Sheet（AppSidebar 复合体）分别渲染。
// 收起/展开用 grid-rows 0fr↔1fr 过渡做高度动画。

import { ChevronDown, Wrench } from "lucide-react"
import type { ComponentType } from "react"
import {
  BookOpen,
  CalendarDays,
  KeyRound,
  PenLine,
  Users,
  Bell,
  GitPullRequest,
} from "lucide-react"
import { useWorkspace } from "@/lib/store"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { AiIcon, AiText } from "@/components/ai-brand"

// 工具卡片清单：点击切换主区域视图；id 与 view 值对应。
const TOOL_CARDS: { id: string; nameKey: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: "ai-chat", nameKey: "toolbar.aiChat", icon: AiIcon },
  { id: "workspace", nameKey: "toolbar.notes", icon: PenLine },
  { id: "calendar", nameKey: "toolbar.calendar", icon: CalendarDays },
  { id: "contacts", nameKey: "toolbar.contacts", icon: Users },
  { id: "vault", nameKey: "toolbar.vault", icon: KeyRound },
  { id: "notifications", nameKey: "toolbar.notifications", icon: Bell },
  { id: "github-queue", nameKey: "toolbar.githubQueue", icon: GitPullRequest },
  { id: "vocabulary", nameKey: "toolbar.vocabulary", icon: BookOpen },
] as const

export function ToolbarPanel() {
  const { t } = useTranslation()
  const collapsed = useWorkspace((s) => s.toolbarCollapsed)
  // TODO 75：极光背景开启时工具栏改半透明毛玻璃，透出底层游动极光
  const auroraBackground = useWorkspace((s) => s.settings.auroraBackground)
  const setCollapsed = useWorkspace((s) => s.setToolbarCollapsed)
  const sidebarCollapsed = useWorkspace((s) => s.sidebarCollapsed)
  const setSidebarCollapsed = useWorkspace((s) => s.setSidebarCollapsed)
  const view = useWorkspace((s) => s.view)
  const goAIChat = useWorkspace((s) => s.goAIChat)
  const goWorkspace = useWorkspace((s) => s.goWorkspace)
  const goCalendar = useWorkspace((s) => s.goCalendar)
  const goContacts = useWorkspace((s) => s.goContacts)
  const goVault = useWorkspace((s) => s.goVault)
  const goNotifications = useWorkspace((s) => s.goNotifications)
  const goGithubQueue = useWorkspace((s) => s.goGithubQueue)
  const goVocabulary = useWorkspace((s) => s.goVocabulary)
  // 通知未读数（工具栏「通知」卡片徽标）：createdAt 晚于已读水位的条数；
  // 进通知页（goNotifications）即标记已读，徽标清零
  const notifications = useWorkspace((s) => s.notifications)
  const lastReadNotificationsAt = useWorkspace((s) => s.lastReadNotificationsAt)
  const unreadCount = notifications.filter(
    (n) => Date.parse(n.createdAt) > (lastReadNotificationsAt ?? 0)
  ).length

  const activate = (id: (typeof TOOL_CARDS)[number]["id"]) => {
    // 点「AI 对话 / 随笔」时自动展开内容区（收起状态下切回来不至于看不到列表）
    if ((id === "ai-chat" || id === "workspace") && sidebarCollapsed) {
      setSidebarCollapsed(false)
    }
    switch (id) {
      case "ai-chat":
        goAIChat()
        break
      case "workspace":
        goWorkspace()
        break
      case "calendar":
        goCalendar()
        break
      case "contacts":
        goContacts()
        break
      case "vault":
        goVault()
        break
      case "notifications":
        goNotifications()
        break
      case "github-queue":
        goGithubQueue()
        break
      case "vocabulary":
        goVocabulary()
        break
    }
  }

  return (
    <div
      className={cn(
        "shrink-0 border-t",
        auroraBackground ? "relative z-20 bg-sidebar/70" : "bg-sidebar"
      )}
    >
      {/* 标题行：工具 + 收起/展开工具栏（收起侧边栏的按钮在侧边栏内容区，不在这里） */}
      <div className="flex items-center gap-1 px-3 py-2">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          title={collapsed ? t("toolbar.expand") : t("toolbar.collapse")}
        >
          <Wrench className="size-3.5 shrink-0" />
          <span>{t("toolbar.title")}</span>
          <ChevronDown
            className={cn("size-3.5 shrink-0 transition-transform", collapsed && "-rotate-90")}
          />
        </button>
      </div>

      {/* 工具卡片：收起/展开同样用 grid-rows 0fr↔1fr 过渡做高度动画 */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="grid grid-cols-3 gap-1 px-2 pb-2">
            {TOOL_CARDS.map((tc) => {
              const Icon = tc.icon
              const active = view === tc.id
              const showBadge = tc.id === "notifications" && unreadCount > 0
              return (
                <button
                  key={tc.id}
                  type="button"
                  onClick={() => activate(tc.id)}
                  title={t(tc.nameKey)}
                  className={cn(
                    "relative flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] transition-colors",
                    active
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {/* AI 对话按钮文本里的「AI」用渐变彩色字（TODO 57） */}
                  <span className="w-full truncate text-center">
                    {tc.id === "ai-chat" ? (
                      <>
                        <AiText /> {t("toolbar.chatSuffix")}
                      </>
                    ) : (
                      t(tc.nameKey)
                    )}
                  </span>
                  {showBadge && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
