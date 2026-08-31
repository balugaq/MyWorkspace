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
  GripVertical,
  Users,
  KeyRound,
  Bot,
} from "lucide-react"
import { toast } from "sonner"
import { useWorkspace } from "@/lib/store"
import { getIcon } from "@/lib/icons"
import { TEMPLATES, type Category, type TemplateType } from "@/lib/types"
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
  const addOpen = useWorkspace((s) => s.addCategoryOpen)
  const setAddOpen = useWorkspace((s) => s.setAddCategoryOpen)
  const moveCategory = useWorkspace((s) => s.moveCategory)

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

      <ScrollArea className="mt-3 min-h-0 flex-1 overflow-hidden px-2">
        <nav className="flex flex-col gap-1 pb-6">
          <SectionLabel>内置模板</SectionLabel>
          <TemplateQuickAdd />

          <SectionLabel className="mt-3">我的分类</SectionLabel>
          {categories.map((cat, i) => (
            <div
              key={cat.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", cat.id)
                e.dataTransfer.effectAllowed = "move"
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const id = e.dataTransfer.getData("text/plain")
                if (!id) return
                const from = categories.findIndex((c) => c.id === id)
                if (from === -1) return
                const rect = e.currentTarget.getBoundingClientRect()
                const before = e.clientY < rect.top + rect.height / 2
                const to = before ? i : i + 1
                if (to !== from) moveCategory(from, to)
              }}
              className="rounded-md"
            >
              <CategoryItem category={cat} active={view === "workspace" && activeCategoryId === cat.id} />
            </div>
          ))}
          {categories.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              还没有分类，点击上方按钮创建。
            </p>
          )}

          <SectionLabel className="mt-3">工具</SectionLabel>
          <CalendarNavItem />
          <ContactNavItem />
          <VaultNavItem />
          <AIChatNavItem />
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

// 内置模板快捷创建：点击任意模板即以合理默认值新建一个分类并立即激活。
function TemplateQuickAdd() {
  const addCategory = useWorkspace((s) => s.addCategory)

  const labelOf = (t: TemplateType) => TEMPLATES.find((x) => x.type === t)?.label ?? t
  const defaultName = (t: TemplateType) => `新${labelOf(t)}`

  function create(t: TemplateType) {
    let id: string
    if (t === "relation") {
      id = addCategory(defaultName(t), "relation", {}, 0)
    } else if (t === "novel") {
      id = addCategory(defaultName(t), "novel", { autoNumber: true, unit: "章" }, 5)
    } else {
      // study / work / life / custom：空白条目分类
      id = addCategory(defaultName(t), t, {}, 0)
    }
    // addCategory 内部已把新增分类设为当前激活项；此处仅提示
    void id
    toast.success(`已创建「${defaultName(t)}」，可右键重命名`)
  }

  return (
    <div className="flex flex-col gap-0.5 px-1">
      {TEMPLATES.filter((t) => t.type !== "custom").map((t) => {
        const Icon = getIcon(t.icon)
        return (
          <button
            key={t.type}
            type="button"
            onClick={() => create(t.type)}
            title={t.description}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <Icon className="size-3.5 shrink-0 text-muted-foreground/70" />
            <span className="truncate">{t.label}</span>
          </button>
        )
      })}
    </div>
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

function ContactNavItem() {
  const view = useWorkspace((s) => s.view)
  const goContacts = useWorkspace((s) => s.goContacts)
  const active = view === "contacts"
  return (
    <button
      type="button"
      onClick={goContacts}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Users className="size-4" />
      联系人
    </button>
  )
}

function VaultNavItem() {
  const view = useWorkspace((s) => s.view)
  const goVault = useWorkspace((s) => s.goVault)
  const active = view === "vault"
  return (
    <button
      type="button"
      onClick={goVault}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <KeyRound className="size-4" />
      密码保险库
    </button>
  )
}

function AIChatNavItem() {
  const view = useWorkspace((s) => s.view)
  const goAIChat = useWorkspace((s) => s.goAIChat)
  const active = view === "ai-chat"
  return (
    <button
      type="button"
      onClick={goAIChat}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Bot className="size-4" />
      AI 助手
    </button>
  )
}

function CategoryItem({ category, active }: { category: Category; active: boolean }) {
  const setActiveCategory = useWorkspace((s) => s.setActiveCategory)
  const setActiveItem = useWorkspace((s) => s.setActiveItem)
  const removeCategory = useWorkspace((s) => s.removeCategory)
  const renameCategory = useWorkspace((s) => s.renameCategory)
  const addChapter = useWorkspace((s) => s.addChapter)
  const moveChapter = useWorkspace((s) => s.moveChapter)
  const activeItemId = useWorkspace((s) => s.activeItemId)

  const [open, setOpen] = useState(false) // 默认折叠，不随激活状态自动展开
  const [confirmDel, setConfirmDel] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(category.name)

  const Icon = getIcon(category.icon)
  const isRelation = category.template === "relation"
  const isNovelLike = !isRelation
  const items = category.chapters ?? []

  function doRename() {
    if (renameValue.trim()) {
      renameCategory(category.id, renameValue.trim())
      toast.success("已重命名")
    }
    setRenaming(false)
  }

  // 分类管理菜单（打开 / 重命名 / 删除）与删除、重命名弹窗在两种形态下共用
  const moreMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-6 opacity-0 transition-opacity group-hover:opacity-100 data-popup-open:opacity-100"
          />
        }
      >
        <MoreHorizontal className="size-3.5" />
        <span className="sr-only">分类操作</span>
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
  )

  const dialogs = (
    <>
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
    </>
  )

  // 关系类（思维导图）：直接点击整行进入画布，无需展开只有「思维导图画布」一项的折叠下拉
  if (isRelation) {
    return (
      <>
        <div
          className={cn(
            "group flex items-center gap-1 rounded-md pr-1 transition-colors",
            active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
          )}
        >
          <button
            type="button"
            onClick={() => setActiveCategory(category.id)}
            className="flex flex-1 items-center gap-2 py-2 pl-2 text-left text-sm"
          >
            <Icon className="size-4 shrink-0 text-primary" />
            <span className="truncate font-medium" title={category.name}>
              {category.name}
            </span>
          </button>
          {moreMenu}
        </div>
        {dialogs}
      </>
    )
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

        {moreMenu}
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
          分类概览
        </button>

        {isNovelLike &&
          items.map((ch, i) => (
            <button
              key={ch.id}
              type="button"
              draggable
              onDragStart={(e) => {
                e.stopPropagation()
                e.dataTransfer.setData("text/plain", ch.id)
                e.dataTransfer.effectAllowed = "move"
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const id = e.dataTransfer.getData("text/plain")
                if (!id) return
                const from = items.findIndex((x) => x.id === id)
                if (from === -1) return
                // 按落点在该行位置的上半/下半决定插入到前面还是后面
                const rect = e.currentTarget.getBoundingClientRect()
                const before = e.clientY < rect.top + rect.height / 2
                const to = before ? i : i + 1
                if (from !== i && to !== from) moveChapter(category.id, from, to)
              }}
              onClick={() => {
                setActiveCategory(category.id)
                setActiveItem(ch.id)
              }}
              className={cn(
                "flex w-full cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors active:cursor-grabbing",
                active && activeItemId === ch.id
                  ? "bg-sidebar-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <GripVertical className="size-3 shrink-0 text-muted-foreground/40" />
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

      {dialogs}
    </Collapsible>
  )
}
