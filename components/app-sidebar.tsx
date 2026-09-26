"use client"

// 侧边栏（TODO 25 重构，Codex 式布局）：
// - SidebarContent：内容区（独立于工具栏），按当前工具切换——「AI 对话」→ 会话列表；「随笔」→ 分类内容。
//   桌面端由 page.tsx 渲染在左列 1fr 行；其他工具 / 收起状态由调用方隐藏。
// - AppSidebar：移动端 Sheet 的复合体（内容区 + 底部工具栏）。
// - 工具栏本体在 components/toolbar-panel.tsx，桌面端由 page.tsx 单独渲染、钉在左下角。

import { useEffect, useMemo, useState } from "react"
import {
  Plus,
  ChevronRight,
  Copy,
  Dices,
  MoreHorizontal,
  Pencil,
  Trash2,
  PanelLeftClose,
  GripVertical,
  NotebookPen,
  CalendarDays,
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
import { Label } from "@/components/ui/label"
import { AddCategoryDialog } from "@/components/add-category-dialog"
import { AiSessionsPanel } from "@/components/ai/ai-sessions-panel"
import { PRESET_QUESTIONS } from "@/components/ai-chat"
import { ToolbarPanel } from "@/components/toolbar-panel"
import type { LucideIcon } from "lucide-react"

// 侧边栏内容区（独立于底部工具栏）：按当前工具切换面板。
// 「AI 对话」→ 会话列表；「随笔」→ 分类内容；「日历」→ AI 快捷提问；「保险库」→ 密码生成器。
export function SidebarContent() {
  const view = useWorkspace((s) => s.view)

  return view === "ai-chat" ? (
    <AiSessionsPanel />
  ) : view === "calendar" ? (
    <CalendarSidePanel />
  ) : view === "vault" ? (
    <VaultSidePanel />
  ) : (
    <NotesPanel />
  )
}

// 面板标题行（各侧边栏面板共用）：图标 + 标题 + 可选计数 + 折叠按钮
function PanelHeader({
  icon: Icon,
  title,
  count,
}: {
  icon: LucideIcon
  title: string
  count?: number
}) {
  const setSidebarCollapsed = useWorkspace((s) => s.setSidebarCollapsed)
  return (
    <div className="flex items-center gap-2 border-b px-3 py-2">
      <Icon className="size-4 text-primary" />
      <span className="text-sm font-semibold">{title}</span>
      {count != null && <span className="text-xs text-muted-foreground">{count}</span>}
      <button
        type="button"
        onClick={() => setSidebarCollapsed(true)}
        className="ml-auto flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="收起侧边栏"
      >
        <PanelLeftClose className="size-4" />
        <span className="sr-only">收起侧边栏</span>
      </button>
    </div>
  )
}

// 日历侧边栏面板：预设的 3 个 AI 问题，点击后自动跳转到 AI 对话并发送（走 store.askAiAbout 链路）。
function CalendarSidePanel() {
  const askAiAbout = useWorkspace((s) => s.askAiAbout)
  const goSettings = useWorkspace((s) => s.goSettings)

  // 人生进度条（主人需求）：生日（设置）→ 今天的天数 / 30000 天（≈82 年）。
  const birthday = useWorkspace((s) => s.settings.birthday)
  const LIFE_TOTAL_DAYS = 30000
  let lifeText = ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
    const birth = new Date(birthday + "T00:00:00")
    const today = new Date()
    const birthMid = new Date(birth.getFullYear(), birth.getMonth(), birth.getDate()).getTime()
    const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
    const days = Math.max(0, Math.floor((todayMid - birthMid) / 86400000))
    const pct = ((days / LIFE_TOTAL_DAYS) * 100).toFixed(2)
    lifeText = `人生进度条（${days}/${LIFE_TOTAL_DAYS}）${pct}%`
  }
  const copyLifeText = () => {
    if (!lifeText) return
    navigator.clipboard.writeText(lifeText)
    toast.success("已复制人生进度条")
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader icon={CalendarDays} title="日历" />
      <div className="flex flex-col gap-1.5 p-3">
        {PRESET_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => askAiAbout(q)}
            className="rounded-lg border bg-muted/30 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {q}
          </button>
        ))}
      </div>
      <p className="px-3 text-xs text-muted-foreground">
        点击任意问题，自动开启一段新对话并发送。
      </p>

      {/* 人生进度条：按设置里的生日计算「出生至今天」的天数占 30000 天（≈82 年）的比例 */}
      <div className="mx-3 mt-auto mb-3 rounded-lg border bg-muted/30 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">人生进度条</span>
          {lifeText && (
            <button
              type="button"
              aria-label="复制人生进度条"
              title="复制"
              onClick={copyLifeText}
              className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Copy className="size-3.5" />
            </button>
          )}
        </div>
        {lifeText ? (
          <p className="mt-1 font-mono text-sm leading-relaxed">{lifeText}</p>
        ) : (
          <button
            type="button"
            onClick={goSettings}
            className="mt-1 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            先到 设置 → 账户与同步 中填写生日，这里就会显示你的进度 →
          </button>
        )}
      </div>
    </div>
  )
}

// —— 随机密码生成器（保险库侧边栏面板，TODO 25）——
const CHARSET_UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
const CHARSET_LOWER = "abcdefghijklmnopqrstuvwxyz"
const CHARSET_DIGITS = "0123456789"
const CHARSET_SYMBOLS = "!@#$%^&*()-_=+[]{};:,.<>?/"

/** crypto 随机索引（模偏差对个人工具可接受） */
function randomIndex(max: number): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0] % max
}

/** 从启用的字符集生成密码；保证每个启用的字符集至少出现一位后随机洗牌 */
function generatePassword(length: number, sets: string[]): string {
  const all = sets.join("")
  if (!all || length <= 0) return ""
  const chars = sets.map((s) => s[randomIndex(s.length)])
  while (chars.length < length) chars.push(all[randomIndex(all.length)])
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.slice(0, length).join("")
}

function VaultSidePanel() {
  // 位数与字符集偏好持久化到 store.settings.pwdGenerator（TODO 25 打磨：刷新/重启保留）
  const pwdCfg = useWorkspace((s) => s.settings.pwdGenerator)
  const updateSettings = useWorkspace((s) => s.updateSettings)
  const [password, setPassword] = useState("")

  const sets = useMemo(() => {
    const s: string[] = []
    if (pwdCfg.upper) s.push(CHARSET_UPPER)
    if (pwdCfg.lower) s.push(CHARSET_LOWER)
    if (pwdCfg.digits) s.push(CHARSET_DIGITS)
    if (pwdCfg.symbols) s.push(CHARSET_SYMBOLS)
    return s
  }, [pwdCfg.upper, pwdCfg.lower, pwdCfg.digits, pwdCfg.symbols])

  // 选项或位数变化时自动重新生成
  useEffect(() => {
    setPassword(generatePassword(pwdCfg.length, sets))
  }, [pwdCfg.length, sets])

  const copyPassword = () => {
    if (!password) return
    navigator.clipboard
      .writeText(password)
      .then(() => toast.success("已复制到剪贴板"))
      .catch(() => toast.error("复制失败"))
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader icon={Dices} title="密码生成器" />

      <div className="flex flex-col gap-3 p-3">
        {/* 生成结果 + 复制 */}
        <div className="flex items-start gap-2">
          <div className="min-h-11 min-w-0 flex-1 break-all rounded-lg border bg-muted/40 p-2.5 font-mono text-sm leading-snug">
            {password || "请至少选择一种字符"}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="size-11 shrink-0"
            onClick={copyPassword}
            disabled={!password}
            title="复制密码"
          >
            <Copy className="size-4" />
            <span className="sr-only">复制密码</span>
          </Button>
        </div>

        <Button
          variant="default"
          className="w-full gap-2"
          onClick={() => setPassword(generatePassword(pwdCfg.length, sets))}
        >
          <Dices className="size-4" />
          重新生成
        </Button>

        {/* 位数滑条（8-24），选择持久化 */}
        <div className="flex flex-col gap-1">
          <Label className="text-xs font-medium text-muted-foreground">位数：{pwdCfg.length}</Label>
          <input
            type="range"
            min={8}
            max={24}
            value={pwdCfg.length}
            onChange={(e) =>
              updateSettings({ pwdGenerator: { ...pwdCfg, length: Number(e.target.value) } })
            }
            className="w-full accent-primary"
          />
        </div>

        {/* 字符集勾选（选择持久化） */}
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              { label: "大写字母", checked: pwdCfg.upper, set: (v: boolean) => updateSettings({ pwdGenerator: { ...pwdCfg, upper: v } }) },
              { label: "小写字母", checked: pwdCfg.lower, set: (v: boolean) => updateSettings({ pwdGenerator: { ...pwdCfg, lower: v } }) },
              { label: "数字", checked: pwdCfg.digits, set: (v: boolean) => updateSettings({ pwdGenerator: { ...pwdCfg, digits: v } }) },
              { label: "特殊字符", checked: pwdCfg.symbols, set: (v: boolean) => updateSettings({ pwdGenerator: { ...pwdCfg, symbols: v } }) },
            ] as const
          ).map((o) => (
            <label
              key={o.label}
              className="flex cursor-pointer items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1.5 text-xs transition-colors hover:bg-muted/70"
            >
              <input
                type="checkbox"
                className="accent-primary"
                checked={o.checked}
                onChange={(e) => o.set(e.target.checked)}
              />
              {o.label}
            </label>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          勾选字符集并调整位数后自动重新生成；密码仅在本机生成，不会上传。
        </p>
      </div>
    </div>
  )
}

// 移动端复合体：内容区 + 底部工具栏（桌面端两者由 page.tsx 分开渲染，工具栏独立钉在左下角）。
export function AppSidebar({ onCollapse }: { onCollapse?: () => void }) {
  const view = useWorkspace((s) => s.view)
  const sidebarCollapsed = useWorkspace((s) => s.sidebarCollapsed)
  const showContent = (view === "ai-chat" || view === "workspace") && !sidebarCollapsed

  return (
    <aside className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      {/* 悬浮侧边栏（移动端 Sheet）的关闭按钮：仅传入 onCollapse 时渲染 */}
      {onCollapse && (
        <div className="flex justify-end px-3 pt-3">
          <Button variant="ghost" size="icon" className="size-8" onClick={onCollapse}>
            <PanelLeftClose className="size-4" />
            <span className="sr-only">折叠侧边栏</span>
          </Button>
        </div>
      )}

      {/* 内容区：按当前工具切换 */}
      <div className={cn("min-h-0", showContent ? "flex-1 overflow-hidden" : "hidden")}>
        {view === "ai-chat" ? <AiSessionsPanel /> : <NotesPanel />}
      </div>

      {/* 底部工具栏 */}
      <ToolbarPanel />
    </aside>
  )
}

// 「随笔」面板：分类内容（添加分类 / 分类列表）。
function NotesPanel() {
  const categories = useWorkspace((s) => s.categories)
  const activeCategoryId = useWorkspace((s) => s.activeCategoryId)
  const view = useWorkspace((s) => s.view)
  const addOpen = useWorkspace((s) => s.addCategoryOpen)
  const setAddOpen = useWorkspace((s) => s.setAddCategoryOpen)
  const moveCategory = useWorkspace((s) => s.moveCategory)
  const setSidebarCollapsed = useWorkspace((s) => s.setSidebarCollapsed)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 标题行：随笔 + 分类数 + 折叠按钮 */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <NotebookPen className="size-4 text-primary" />
        <span className="text-sm font-semibold">随笔</span>
        <span className="text-xs text-muted-foreground">{categories.length}</span>
        <button
          type="button"
          onClick={() => setSidebarCollapsed(true)}
          className="ml-auto flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="收起侧边栏"
        >
          <PanelLeftClose className="size-4" />
          <span className="sr-only">收起侧边栏</span>
        </button>
      </div>

      <div className="px-3 pt-3">
        <Button className="w-full gap-2" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          添加分类
        </Button>
      </div>

      <ScrollArea className="mt-3 min-h-0 flex-1 overflow-hidden px-2">
        <nav className="flex flex-col gap-1 pb-4">
          <SectionLabel className="mt-1">我的分类</SectionLabel>
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
        </nav>
      </ScrollArea>

      <AddCategoryDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground", className)}>
      {children}
    </p>
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
            {/* 占位：与展开箭头等宽，保证图标/文字与其他分类对齐 */}
            <span className="size-3.5 shrink-0" aria-hidden />
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
