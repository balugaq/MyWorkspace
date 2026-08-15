"use client"

import { useState } from "react"
import {
  Plus,
  ChevronRight,
  CalendarDays,
  MoreHorizontal,
  Pencil,
  Trash2,
  PanelLeftClose,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"
import { useWorkspace } from "@/lib/store"
import { getIcon } from "@/lib/icons"
import type { Category } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { AddCategoryDialog } from "@/components/add-category-dialog"

export function AppSidebar({ onCollapse }: { onCollapse?: () => void }) {
  const categories = useWorkspace((s) => s.categories)
  const activeCategoryId = useWorkspace((s) => s.activeCategoryId)
  const view = useWorkspace((s) => s.view)
  const [addOpen, setAddOpen] = useState(false)

  return (
    <aside className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between gap-2 px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">全能工作台</span>
            <span className="text-[11px] text-muted-foreground">My Workspace</span>
          </div>
        </div>
        {onCollapse && (
          <Button variant="ghost" size="icon" className="size-8" onClick={onCollapse}>
            <PanelLeftClose className="size-4" />
            <span className="sr-only">折叠侧边栏</span>
          </Button>
        )}
      </div>

      <div className="px-3">
        <Button className="w-full justify-start gap-2" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          添加分类
        </Button>
      </div>

      <ScrollArea className="mt-3 flex-1 px-2">
        <nav className="flex flex-col gap-1 pb-6">
          <SectionLabel>我的分类</SectionLabel>
          {categories.map((cat) => (
            <CategoryItem key={cat.id} category={cat} active={view === "workspace" && activeCategoryId === cat.id} />
          ))}
          {categories.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              还没有分类，点击上方按钮创建。
            </p>
          )}

          <SectionLabel className="mt-3">工具</SectionLabel>
          <CalendarNavItem />
        </nav>
      </ScrollArea>

      <AddCategoryDialog open={addOpen} onOpenChange={setAddOpen} />
    </aside>
  )
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground", className)}>
      {children}
    </p>
  )
}

function CalendarNavItem() {
  const view = useWorkspace((s) => s.view)
  const goCalendar = useWorkspace((s) => s.goCalendar)
  const active = view === "calendar"
  return (
    <button
      type="button"
      onClick={goCalendar}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <CalendarDays className="size-4" />
      日历
    </button>
  )
}

function CategoryItem({ category, active }: { category: Category; active: boolean }) {
  const setActiveCategory = useWorkspace((s) => s.setActiveCategory)
  const setActiveItem = useWorkspace((s) => s.setActiveItem)
  const removeCategory = useWorkspace((s) => s.removeCategory)
  const renameCategory = useWorkspace((s) => s.renameCategory)
  const addChapter = useWorkspace((s) => s.addChapter)
  const activeItemId = useWorkspace((s) => s.activeItemId)

  const [open, setOpen] = useState(active)
  const [confirmDel, setConfirmDel] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(category.name)

  const Icon = getIcon(category.icon)
  const isNovelLike = category.template !== "relation"
  const items = category.chapters ?? []

  function doRename() {
    if (renameValue.trim()) {
      renameCategory(category.id, renameValue.trim())
      toast.success("已重命名")
    }
    setRenaming(false)
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md pr-1 transition-colors",
          active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
        )}
      >
        <CollapsibleTrigger className="flex flex-1 items-center gap-2 py-2 pl-2 text-left text-sm">
          <ChevronRight
            className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          />
          <Icon className="size-4 shrink-0 text-primary" />
          <span className="truncate font-medium" title={category.name}>
            {category.name}
          </span>
        </CollapsibleTrigger>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="size-3.5" />
              <span className="sr-only">分类操作</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setActiveCategory(category.id)}>打开</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setRenameValue(category.name)
                  setRenaming(true)
                }}
              >
                <Pencil className="size-3.5" />
                重命名
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmDel(true)}>
                <Trash2 className="size-3.5" />
                删除
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CollapsibleContent className="ml-4 border-l border-sidebar-border pl-1">
        <button
          type="button"
          onClick={() => setActiveCategory(category.id)}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
            active && !activeItemId
              ? "text-primary font-medium"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {category.template === "relation" ? "思维导图画布" : "分类概览"}
        </button>

        {isNovelLike &&
          items.map((ch) => (
            <button
              key={ch.id}
              type="button"
              onClick={() => {
                setActiveCategory(category.id)
                setActiveItem(ch.id)
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                active && activeItemId === ch.id
                  ? "bg-sidebar-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <span className="truncate">{ch.title || "未命名"}</span>
            </button>
          ))}

        {isNovelLike && (
          <button
            type="button"
            onClick={() => {
              addChapter(category.id)
              toast.success("已添加条目")
            }}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-primary"
          >
            <Plus className="size-3" />
            添加条目
          </button>
        )}
      </CollapsibleContent>

      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除分类「{category.name}」？</AlertDialogTitle>
            <AlertDialogDescription>此操作不可撤销，该分类下的所有内容都会被删除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                removeCategory(category.id)
                toast.success("已删除分类")
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={renaming} onOpenChange={setRenaming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重命名分类</AlertDialogTitle>
          </AlertDialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) doRename()
            }}
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={doRename}>保存</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Collapsible>
  )
}
