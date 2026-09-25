"use client"

// 底部工具栏（TODO 25）：绝对钉在左下角、独立于侧边栏的常驻导航枢纽。
// 由 page.tsx（桌面端左列 grid 的 auto 行）与移动端 Sheet（AppSidebar 复合体）分别渲染。
// 收起/展开用 grid-rows 0fr↔1fr 过渡做高度动画。

import { ChevronDown, Wrench } from "lucide-react"
import {
  BotMessageSquare,
  CalendarDays,
  KeyRound,
  PenLine,
  Users,
  Bell,
} from "lucide-react"
import { useWorkspace } from "@/lib/store"
import { cn } from "@/lib/utils"

// 工具卡片清单：点击切换主区域视图；id 与 view 值对应。
const TOOL_CARDS = [
  { id: "ai-chat", name: "AI 对话", icon: BotMessageSquare },
  { id: "workspace", name: "随笔", icon: PenLine },
  { id: "calendar", name: "日历", icon: CalendarDays },
  { id: "contacts", name: "联系人", icon: Users },
  { id: "vault", name: "密码保险库", icon: KeyRound },
  { id: "notifications", name: "通知", icon: Bell },
] as const

export function ToolbarPanel() {
  const collapsed = useWorkspace((s) => s.toolbarCollapsed)
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
    }
  }

  return (
    <div className="shrink-0 border-t bg-sidebar">
      {/* 标题行：工具 + 收起/展开工具栏（收起侧边栏的按钮在侧边栏内容区，不在这里） */}
      <div className="flex items-center gap-1 px-3 py-2">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          title={collapsed ? "展开工具栏" : "收起工具栏"}
        >
          <Wrench className="size-3.5 shrink-0" />
          <span>工具</span>
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
            {TOOL_CARDS.map((t) => {
              const Icon = t.icon
              const active = view === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => activate(t.id)}
                  title={t.name}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] transition-colors",
                    active
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="w-full truncate text-center">{t.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
