"use client"

import { useEffect, useState } from "react"
import { useWorkspace } from "@/lib/store"
import { AppSidebar } from "@/components/app-sidebar"
import { Topbar } from "@/components/topbar"
import { NovelWorkspace } from "@/components/novel-workspace"
import { MindmapWorkspace } from "@/components/mindmap-workspace"
import { CalendarWorkspace } from "@/components/calendar-workspace"
import { GlobalSearch } from "@/components/global-search"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { LayoutGrid, PanelLeft } from "lucide-react"

export default function Page() {
  const hydrated = useWorkspace((s) => s.hydrated)
  const view = useWorkspace((s) => s.view)
  const activeCategoryId = useWorkspace((s) => s.activeCategoryId)
  const categories = useWorkspace((s) => s.categories)
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // close mobile drawer whenever the active view changes
  useEffect(() => {
    setMobileNav(false)
  }, [activeCategoryId, view])

  const activeCategory = categories.find((c) => c.id === activeCategoryId)

  return (
    <div className="flex h-svh overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden w-72 shrink-0 border-r md:block">
        <AppSidebar />
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
      </div>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  )
}
