"use client"

// 侧边栏（TODO 25 重构，Codex 式布局）：SidebarContent 内容区按当前工具切换（桌面端由 page.tsx 渲染）；
// AppSidebar 为移动端 Sheet 复合体，工具栏本体在 components/toolbar-panel.tsx。

import { useEffect, useMemo, useState, type ReactNode } from "react"
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
  SquarePen,
} from "lucide-react"
import { toast } from "sonner"
import { useWorkspace } from "@/lib/store"
import { useTranslation } from "react-i18next"
import { ICONS } from "@/lib/icons"
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

// 各侧边栏面板共用的标题行
function PanelHeader({
  icon: Icon,
  title,
  count,
}: {
  icon: LucideIcon
  title: ReactNode
  count?: number
}) {
  const setSidebarCollapsed = useWorkspace((s) => s.setSidebarCollapsed)
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2 border-b px-3 py-2">
      <Icon className="size-4 text-primary" />
      <span className="text-sm font-semibold">{title}</span>
      {count != null && <span className="text-xs text-muted-foreground">{count}</span>}
      <button
        type="button"
        onClick={() => setSidebarCollapsed(true)}
        className="ml-auto flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title={t("sidebar.collapse")}
      >
        <PanelLeftClose className="size-4" />
        <span className="sr-only">{t("sidebar.collapse")}</span>
      </button>
    </div>
  )
}

// 预设 3 个 AI 问题：点击经 store.askAiAbout 跳转 AI 对话并发送
function CalendarSidePanel() {
  const { t } = useTranslation()
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
    lifeText = t("sidebar.lifeBarText", { days, total: LIFE_TOTAL_DAYS, pct })
  }
  const copyLifeText = () => {
    if (!lifeText) return
    navigator.clipboard.writeText(lifeText)
    toast.success(t("sidebar.copiedLifeBar"))
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader icon={CalendarDays} title={t("sidebar.calendar")} />
      <div className="flex flex-col gap-1.5 p-3">
        {PRESET_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => askAiAbout(t(q))}
            className="rounded-lg border bg-muted/30 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {t(q)}
          </button>
        ))}
      </div>
      <p className="px-3 text-xs text-muted-foreground">
        {t("sidebar.aiQuickTip")}
      </p>

      <div className="mx-3 mt-auto mb-3 rounded-lg border bg-muted/30 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">{t("sidebar.lifeBar")}</span>
          {lifeText && (
            <button
              type="button"
              aria-label={t("sidebar.copyLifeBar")}
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
            {t("sidebar.lifeBarHint")}
          </button>
        )}
      </div>
    </div>
  )
}

// 随机密码生成器（保险库面板，TODO 25）
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

/** 每个启用的字符集保证至少一位，再随机洗牌 */
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
  const { t } = useTranslation()
  // 偏好持久化于 settings.pwdGenerator（TODO 25 打磨：刷新/重启保留）
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

  useEffect(() => {
    // setState 延迟一拍：effect 体内同步 setState 会触发 react-hooks/set-state-in-effect
    const t = window.setTimeout(() => setPassword(generatePassword(pwdCfg.length, sets)), 0)
    return () => window.clearTimeout(t)
  }, [pwdCfg.length, sets])

  const copyPassword = () => {
    if (!password) return
    navigator.clipboard
      .writeText(password)
      .then(() => toast.success(t("sidebar.copiedClipboard")))
      .catch(() => toast.error(t("common.copyFailed")))
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader icon={Dices} title={t("sidebar.pwdGen")} />

      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-start gap-2">
          <div className="min-h-11 min-w-0 flex-1 break-all rounded-lg border bg-muted/40 p-2.5 font-mono text-sm leading-snug">
            {password || t("sidebar.pwdPickSet")}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="size-11 shrink-0"
            onClick={copyPassword}
            disabled={!password}
            title={t("common.copyPwd")}
          >
            <Copy className="size-4" />
            <span className="sr-only">{t("common.copyPwd")}</span>
          </Button>
        </div>

        <Button
          variant="default"
          className="w-full gap-2"
          onClick={() => setPassword(generatePassword(pwdCfg.length, sets))}
        >
          <Dices className="size-4" />
          {t("sidebar.regenerate")}
        </Button>

        <div className="flex flex-col gap-1">
          <Label className="text-xs font-medium text-muted-foreground">{t("sidebar.pwdLength")}: {pwdCfg.length}</Label>
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

        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              { label: t("sidebar.setUpper"), checked: pwdCfg.upper, set: (v: boolean) => updateSettings({ pwdGenerator: { ...pwdCfg, upper: v } }) },
              { label: t("sidebar.setLower"), checked: pwdCfg.lower, set: (v: boolean) => updateSettings({ pwdGenerator: { ...pwdCfg, lower: v } }) },
              { label: t("sidebar.setDigits"), checked: pwdCfg.digits, set: (v: boolean) => updateSettings({ pwdGenerator: { ...pwdCfg, digits: v } }) },
              { label: t("sidebar.setSymbols"), checked: pwdCfg.symbols, set: (v: boolean) => updateSettings({ pwdGenerator: { ...pwdCfg, symbols: v } }) },
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
          {t("sidebar.pwdHint")}
        </p>
      </div>
    </div>
  )
}

// 移动端复合体：内容区 + 底部工具栏（桌面端两者由 page.tsx 分开渲染）
export function AppSidebar({ onCollapse }: { onCollapse?: () => void }) {
  const { t } = useTranslation()
  const view = useWorkspace((s) => s.view)
  const sidebarCollapsed = useWorkspace((s) => s.sidebarCollapsed)
  const showContent = (view === "ai-chat" || view === "workspace") && !sidebarCollapsed

  return (
    <aside className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      {onCollapse && (
        <div className="flex justify-end px-3 pt-3">
          <Button variant="ghost" size="icon" className="size-8" onClick={onCollapse}>
            <PanelLeftClose className="size-4" />
            <span className="sr-only">{t("sidebar.collapse")}</span>
          </Button>
        </div>
      )}

      <div className={cn("min-h-0", showContent ? "flex-1 overflow-hidden" : "hidden")}>
        {view === "ai-chat" ? <AiSessionsPanel /> : <NotesPanel />}
      </div>

      <ToolbarPanel />
    </aside>
  )
}

function NotesPanel() {
  const { t } = useTranslation()
  const categories = useWorkspace((s) => s.categories)
  const activeCategoryId = useWorkspace((s) => s.activeCategoryId)
  const view = useWorkspace((s) => s.view)
  const addOpen = useWorkspace((s) => s.addCategoryOpen)
  const setAddOpen = useWorkspace((s) => s.setAddCategoryOpen)
  const moveCategory = useWorkspace((s) => s.moveCategory)
  const setSidebarCollapsed = useWorkspace((s) => s.setSidebarCollapsed)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <NotebookPen className="size-4 text-primary" />
        <span className="text-sm font-semibold">{t("sidebar.notes")}</span>
        <span className="text-xs text-muted-foreground">{categories.length}</span>
        <button
          type="button"
          onClick={() => setSidebarCollapsed(true)}
          className="ml-auto flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={t("sidebar.collapse")}
        >
          <PanelLeftClose className="size-4" />
          <span className="sr-only">{t("sidebar.collapse")}</span>
        </button>
      </div>

      <div className="px-3 pt-3">
        <Button className="w-full gap-2" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          {t("sidebar.addCategory")}
        </Button>
      </div>

      <ScrollArea className="mt-3 min-h-0 flex-1 overflow-hidden px-2">
        <nav className="flex flex-col gap-1 pb-4">
          <SectionLabel className="mt-1">{t("sidebar.myCategories")}</SectionLabel>
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
              {t("sidebar.noCategories")}
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
  const { t } = useTranslation()
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

  // 模块级常量表查找而非工厂调用：render 期间调用组件工厂会触发 react-hooks/static-components
  const Icon = ICONS[category.icon] ?? SquarePen
  const isRelation = category.template === "relation"
  const isNovelLike = !isRelation
  const items = category.chapters ?? []

  function doRename() {
    if (renameValue.trim()) {
      renameCategory(category.id, renameValue.trim())
      toast.success(t("sidebar.renamed"))
    }
    setRenaming(false)
  }

  // 菜单与删除/重命名弹窗在关系类、折叠类两种形态下共用
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
        <span className="sr-only">{t("sidebar.categoryActions")}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => setActiveCategory(category.id)}>{t("sidebar.open")}</DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setRenameValue(category.name)
              setRenaming(true)
            }}
          >
            <Pencil className="size-3.5" />
            {t("common.rename")}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmDel(true)}>
            <Trash2 className="size-3.5" />
            {t("common.delete")}
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
            <AlertDialogTitle>{t("sidebar.deleteCatTitle", { name: category.name })}</AlertDialogTitle>
            <AlertDialogDescription>{t("sidebar.deleteCatDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                removeCategory(category.id)
                toast.success(t("sidebar.deletedCat"))
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={renaming} onOpenChange={setRenaming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sidebar.renameCat")}</AlertDialogTitle>
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
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={doRename}>{t("common.save")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  // 关系类：整行点击直接进画布，不走只有单项的折叠下拉
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
            className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-2 text-left text-sm"
          >
            {/* 占位与展开箭头等宽，保证图标/文字对齐 */}
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
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-2 text-left text-sm">
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
          {t("sidebar.categoryOverview")}
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
              <span className="truncate">{ch.title || t("sidebar.untitled")}</span>
            </button>
          ))}

        {isNovelLike && (
          <button
            type="button"
            onClick={() => {
              addChapter(category.id)
              toast.success(t("sidebar.addedItem"))
            }}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-primary"
          >
            <Plus className="size-3" />
            {t("sidebar.addItem")}
          </button>
        )}
      </CollapsibleContent>

      {dialogs}
    </Collapsible>
  )
}
