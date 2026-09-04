"use client"

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react"
import { useWorkspace } from "@/lib/store"
import { useGlobalShortcuts } from "@/hooks/use-shortcuts"
import { loadAddressBook } from "@/lib/address-book"
// 日历标记脚本已弃用停用：不再引入 useCalendarScripts
// import { useCalendarScripts } from "@/hooks/use-calendar-scripts"
import { AppSidebar } from "@/components/app-sidebar"
import { Topbar } from "@/components/topbar"
import { NovelWorkspace } from "@/components/novel-workspace"
import { MindmapWorkspace } from "@/components/mindmap-workspace"
import { CalendarWorkspace } from "@/components/calendar-workspace"
import { ContactsWorkspace } from "@/components/contacts-workspace"
import { VaultWorkspace } from "@/components/vault/vault-workspace"
import { AIChatWorkspace } from "@/components/ai-chat"
import { GlobalSearch } from "@/components/global-search"
import { SettingsDialog } from "@/components/settings-dialog"
// 日历标记脚本已弃用停用：不再引入 CalendarScriptsDialog
// import { CalendarScriptsDialog } from "@/components/calendar-scripts-dialog"
import { ConfigEditorDialog } from "@/components/config-editor-dialog"
import { ImageCacheDialog } from "@/components/image-cache-dialog"
import { StatusBar } from "@/components/status-bar"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { LayoutGrid, PanelLeft } from "lucide-react"

export default function Page() {
  const hydrated = useWorkspace((s) => s.hydrated)
  const view = useWorkspace((s) => s.view)
  const activeCategoryId = useWorkspace((s) => s.activeCategoryId)
  const categories = useWorkspace((s) => s.categories)
  // 日历标记脚本已弃用停用：不再订阅 scriptsOpen / setScriptsOpen
  // const scriptsOpen = useWorkspace((s) => s.scriptsOpen)
  // const setScriptsOpen = useWorkspace((s) => s.setScriptsOpen)
  const configEditorOpen = useWorkspace((s) => s.configEditorOpen)
  const setConfigEditorOpen = useWorkspace((s) => s.setConfigEditorOpen)
  const imagesOpen = useWorkspace((s) => s.imagesOpen)
  const setImagesOpen = useWorkspace((s) => s.setImagesOpen)
  const addKnownTags = useWorkspace((s) => s.addKnownTags)
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)

  // 桌面端侧边栏宽度（拖拽分隔条调整，持久化到 store）：
  // 实时宽度用本地 state 保证拖动流畅，松手时写入 store，刷新后从 store 恢复。
  const sidebarWidth = useWorkspace((s) => s.sidebarWidth)
  const setSidebarWidth = useWorkspace((s) => s.setSidebarWidth)
  const [sidebarWidthLocal, setSidebarWidthLocal] = useState(sidebarWidth)
  const latestSidebarWidth = useRef(sidebarWidth)
  const sidebarDragging = useRef(false)
  const sidebarHostRef = useRef<HTMLDivElement>(null)
  const SIDEBAR_MIN = 200
  const SIDEBAR_MAX = 420
  useEffect(() => {
    setSidebarWidthLocal(sidebarWidth)
    latestSidebarWidth.current = sidebarWidth
  }, [sidebarWidth])

  function startResizeSidebar(e: ReactMouseEvent) {
    e.preventDefault()
    sidebarDragging.current = true
    const onMove = (ev: MouseEvent) => {
      if (!sidebarDragging.current || !sidebarHostRef.current) return
      const rect = sidebarHostRef.current.getBoundingClientRect()
      const w = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, ev.clientX - rect.left))
      setSidebarWidthLocal(w)
      latestSidebarWidth.current = w
    }
    const onUp = () => {
      sidebarDragging.current = false
      document.body.style.userSelect = ""
      setSidebarWidth(latestSidebarWidth.current)
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    document.body.style.userSelect = "none"
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  // 统一的全局快捷键（Ctrl+M 新建 / Ctrl+B 日历 / Ctrl+K 搜索，绑定可在设置中修改）
  useGlobalShortcuts()

  // 载入启用的日历标记脚本（已弃用停用：不再调用 useCalendarScripts）
  // useCalendarScripts()

  useEffect(() => {
    const onOpenSearch = () => setSearchOpen(true)
    window.addEventListener("dsh:open-search", onOpenSearch)
    return () => window.removeEventListener("dsh:open-search", onOpenSearch)
  }, [])

  // close mobile drawer whenever the active view changes
  useEffect(() => {
    setMobileNav(false)
  }, [activeCategoryId, view])

  // 启动即把联系人 roles 汇入全局标签库，使标签选择器在任意视图下都可用
  // （ContactsWorkspace 内仍保留一次兜底种入，二者均幂等，不会重复添加）
  useEffect(() => {
    let active = true
    loadAddressBook()
      .then((p) => {
        if (!active) return
        const roles = Array.from(new Set(p.flatMap((person) => person.roles ?? [])))
        if (roles.length > 0) addKnownTags(roles)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [addKnownTags])


  const activeCategory = categories.find((c) => c.id === activeCategoryId)

  return (
    <div className="flex h-svh overflow-hidden bg-background">
      {/* Desktop sidebar（宽度可拖拽，持久化到 store） */}
      <div
        ref={sidebarHostRef}
        className="hidden shrink-0 border-r md:block"
        style={{ width: sidebarWidthLocal }}
      >
        <AppSidebar />
      </div>

      {/* 可拖拽分隔条：桌面端左右拖动调整侧边栏宽度 */}
      <div
        onMouseDown={startResizeSidebar}
        role="separator"
        aria-orientation="vertical"
        aria-label="调整侧边栏宽度"
        className="hidden w-1.5 shrink-0 cursor-col-resize items-stretch bg-border/40 transition-colors hover:bg-primary/50 md:flex"
      >
        <div className="mx-auto my-auto h-10 w-0.5 rounded-full bg-border" />
      </div>

      {/* Mobile sidebar */}
      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">导航</SheetTitle>
          <AppSidebar onCollapse={() => setMobileNav(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="ml-2 size-9 md:hidden"
            onClick={() => setMobileNav(true)}
          >
            <PanelLeft className="size-4" />
            <span className="sr-only">打开导航</span>
          </Button>
          <div className="min-w-0 flex-1">
            <Topbar onOpenSearch={() => setSearchOpen(true)} />
          </div>
        </div>

        <main className="min-h-0 flex-1 overflow-hidden">
          {!hydrated ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              正在加载工作台…
            </div>
          ) : view === "calendar" ? (
            <CalendarWorkspace />
          ) : view === "contacts" ? (
            <ContactsWorkspace />
          ) : view === "vault" ? (
            <VaultWorkspace />
          ) : view === "ai-chat" ? (
            <AIChatWorkspace />
          ) : activeCategory ? (
            activeCategory.template === "relation" ? (
              <MindmapWorkspace key={activeCategory.id} category={activeCategory} />
            ) : (
              <NovelWorkspace key={activeCategory.id} category={activeCategory} />
            )
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <LayoutGrid />
                  </EmptyMedia>
                  <EmptyTitle>还没有分类</EmptyTitle>
                  <EmptyDescription>
                    在左侧点击“添加分类”，选择小说、学习、工作或关系图模板开始使用。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          )}
        </main>

        <StatusBar />
      </div>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <SettingsDialog />
      {/* 日历标记脚本已弃用停用：不再渲染 CalendarScriptsDialog */}
      {/* <CalendarScriptsDialog open={scriptsOpen} onOpenChange={setScriptsOpen} /> */}
      <ConfigEditorDialog open={configEditorOpen} onOpenChange={setConfigEditorOpen} />
      <ImageCacheDialog open={imagesOpen} onOpenChange={setImagesOpen} />
    </div>
  )
}
