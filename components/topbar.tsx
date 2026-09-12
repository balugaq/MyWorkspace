"use client"

import { useWorkspace } from "@/lib/store"

// 顶栏标题：仅显示当前视图/分类名（搜索/设置/主题切换已迁至全局顶栏 BrandHeader）。
// ai-chat 视图下 title 为空 → page.tsx 整行隐藏。
export function Topbar() {
  const view = useWorkspace((s) => s.view)
  const categories = useWorkspace((s) => s.categories)
  const activeCategoryId = useWorkspace((s) => s.activeCategoryId)

  const activeCategory = categories.find((c) => c.id === activeCategoryId)
  // ai-chat 视图不渲染标题区（品牌信息在全局 BrandHeader，主区 header 已有会话标题）
  const title =
    view === "ai-chat" ? "" : view === "calendar" ? "日历" : (activeCategory?.name ?? "工作台")
  const subtitle =
    view === "ai-chat"
      ? ""
      : view === "calendar"
        ? "记录每日笔记、待办与日程"
        : activeCategory?.template === "relation"
          ? "关系思维图"
          : activeCategory
            ? "条目工作区"
            : ""

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-3 backdrop-blur md:px-4">
      <div className="min-w-0 flex-1">
        {title ? (
          <h1 className="truncate font-serif text-base font-semibold leading-tight text-foreground">
            {title}
          </h1>
        ) : null}
        {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
    </header>
  )
}
