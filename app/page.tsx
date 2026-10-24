"use client"

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react"
import { useWorkspace } from "@/lib/store"
import { useTranslation } from "react-i18next"
import { useGlobalShortcuts } from "@/hooks/use-shortcuts"
import { AppSidebar, SidebarContent } from "@/components/app-sidebar"
import { BrandHeader } from "@/components/brand-header"
import { ToolbarPanel } from "@/components/toolbar-panel"
import { SidebarToggleFab } from "@/components/sidebar-toggle-fab"
import { NovelWorkspace } from "@/components/novel-workspace"
import { MindmapWorkspace } from "@/components/mindmap-workspace"
import { CalendarWorkspace } from "@/components/calendar-workspace"
import { ContactsWorkspace } from "@/components/contacts-workspace"
import { VaultWorkspace } from "@/components/vault/vault-workspace"
import { AIChatWorkspace } from "@/components/ai-chat"
import { ProfileWorkspace } from "@/components/profile-workspace"
import { GlobalSearch } from "@/components/global-search"
import { SettingsView } from "@/components/settings-view"
import { NotificationsWorkspace } from "@/components/notifications/notifications-workspace"
import { GithubQueueWorkspace } from "@/components/github-queue-workspace"
import { VocabularyWorkspace } from "@/components/vocabulary-workspace"
import { NotificationToastQueue } from "@/components/notifications/notification-toast-queue"
import { HealthReminderToasts } from "@/components/notifications/health-reminder-toasts"
import { AutoBackupWatcher } from "@/components/auto-backup-watcher"
import { startNotificationScheduler } from "@/lib/notifications/scheduler"
import { syncLocale } from "@/lib/i18n"
import { ConfigEditorDialog } from "@/components/config-editor-dialog"
import { ImageCacheDialog } from "@/components/image-cache-dialog"
import { StatusBar } from "@/components/status-bar"
import { AuroraBackground } from "@/components/aurora-background"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { LayoutGrid } from "lucide-react"

// TODO 75 调参：极光开启时容器毛玻璃样式（透明度/模糊度待目视迭代）；容器透明使星光 canvas（z-[8]）可见，文字 z-10 在其上
const AURORA_GLASS = "relative z-10 bg-transparent"

export default function Page() {
  const hydrated = useWorkspace((s) => s.hydrated)
  const view = useWorkspace((s) => s.view)
  const uiLanguage = useWorkspace((s) => s.settings.uiLanguage)
  const auroraBackground = useWorkspace((s) => s.settings.auroraBackground)
  const { t } = useTranslation()
  const activeCategoryId = useWorkspace((s) => s.activeCategoryId)
  const categories = useWorkspace((s) => s.categories)
  const configEditorOpen = useWorkspace((s) => s.configEditorOpen)
  const setConfigEditorOpen = useWorkspace((s) => s.setConfigEditorOpen)
  const imagesOpen = useWorkspace((s) => s.imagesOpen)
  const setImagesOpen = useWorkspace((s) => s.setImagesOpen)
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)

  // 侧边栏宽度：本地 state 保证拖动流畅，松手写入 store 持久化
  const sidebarWidth = useWorkspace((s) => s.sidebarWidth)
  const setSidebarWidth = useWorkspace((s) => s.setSidebarWidth)
  const sidebarCollapsed = useWorkspace((s) => s.sidebarCollapsed)
  const [sidebarWidthLocal, setSidebarWidthLocal] = useState(sidebarWidth)
  const latestSidebarWidth = useRef(sidebarWidth)
  const sidebarDragging = useRef(false)
  const sidebarHostRef = useRef<HTMLDivElement>(null)
  const SIDEBAR_MIN = 200
  const SIDEBAR_MAX = 420
  useEffect(() => {
    // setState 延迟一拍：effect 体内同步 setState 会触发 react-hooks/set-state-in-effect
    const t = window.setTimeout(() => setSidebarWidthLocal(sidebarWidth), 0)
    latestSidebarWidth.current = sidebarWidth
    return () => window.clearTimeout(t)
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

  useGlobalShortcuts()

  // TODO 40：hydrate 后按 uiLanguage 同步 i18next，切换语言时跟随
  useEffect(() => {
    if (hydrated) syncLocale(uiLanguage)
  }, [hydrated, uiLanguage])

  // TODO 25：个人主页收起工具栏，其他页面自动展开
  const setToolbarCollapsed = useWorkspace((s) => s.setToolbarCollapsed)
  useEffect(() => {
    setToolbarCollapsed(view === "profile")
  }, [view, setToolbarCollapsed])

  useEffect(() => {
    const onOpenSearch = () => setSearchOpen(true)
    window.addEventListener("dsh:open-search", onOpenSearch)
    return () => window.removeEventListener("dsh:open-search", onOpenSearch)
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => setMobileNav(false), 0)
    return () => window.clearTimeout(t)
  }, [activeCategoryId, view])

  // TODO 20/18：hydrate 后启动通知调度器（内部幂等，重复调用安全）；每 5 分钟扫描新动态 + 心跳
  useEffect(() => {
    if (!hydrated) return
    startNotificationScheduler()
  }, [hydrated])


  const activeCategory = categories.find((c) => c.id === activeCategoryId)

  // TODO 75：极光开启时根容器透明，露出底层极光 canvas
  return (
    <div
      className={`flex h-svh flex-col overflow-hidden${auroraBackground ? "" : " bg-background"}`}
    >
      {auroraBackground && (
        <>
          <AuroraBackground />
          {/* 模糊层仅作用于下方波浪 canvas，星光点 canvas 在此层之上保持清晰 */}
          <div className="pointer-events-none fixed inset-0 z-[5] bg-background/25 backdrop-blur-md" />
        </>
      )}

      <BrandHeader onOpenNav={() => setMobileNav(true)} onOpenSearch={() => setSearchOpen(true)} />

      <div className="flex min-h-0 flex-1">
        {/* 左列双分支：AI 对话/随笔/日历/保险库且未收起 → 完整左列；否则不渲染，工具栏 fixed 钉左下角保证始终有导航入口 */}
        {(view === "ai-chat" ||
          view === "workspace" ||
          view === "calendar" ||
          view === "vault") &&
        !sidebarCollapsed ? (
          <>
            <div
              ref={sidebarHostRef}
              /* md:block 后必须留空格：Tailwind oxide 提取不了紧贴 ${ 的候选类，紧贴会导致该类不进编译产物、侧边栏永远 display:none */
              className={`hidden shrink-0 border-r md:block ${auroraBackground ? AURORA_GLASS : ""}`}
              style={{ width: sidebarWidthLocal }}
            >
              <div className="grid h-full grid-rows-[1fr_auto]">
                <div className="min-h-0 overflow-hidden">
                  <SidebarContent />
                </div>
                <ToolbarPanel />
              </div>
            </div>

            <div
              onMouseDown={startResizeSidebar}
              role="separator"
              aria-orientation="vertical"
              aria-label={t("home.resizeSidebar")}
              className="hidden w-1.5 shrink-0 cursor-col-resize items-stretch bg-border/40 transition-colors hover:bg-primary/50 md:flex"
            >
              <div className="mx-auto my-auto h-10 w-0.5 rounded-full bg-border" />
            </div>
          </>
        ) : (
          <div
            className={`fixed bottom-0 left-0 z-40 hidden shrink-0 border-r border-t md:block ${
              auroraBackground ? "bg-sidebar/70" : "bg-sidebar"
            }`}
            style={{ width: sidebarWidthLocal }}
          >
            <ToolbarPanel />
          </div>
        )}

        <Sheet open={mobileNav} onOpenChange={setMobileNav}>
          <SheetContent side="left" className="w-72 p-0" showCloseButton={false}>
            <SheetTitle className="sr-only">{t("home.nav")}</SheetTitle>
            <AppSidebar onCollapse={() => setMobileNav(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
        <main
          className={`min-h-0 flex-1 overflow-hidden${auroraBackground ? ` ${AURORA_GLASS}` : ""}`}
        >
          {!hydrated ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t("home.loading")}
            </div>
          ) : view === "calendar" ? (
            <CalendarWorkspace />
          ) : view === "contacts" ? (
            <ContactsWorkspace />
          ) : view === "vault" ? (
            <VaultWorkspace />
          ) : view === "ai-chat" ? (
            <AIChatWorkspace />
          ) : view === "profile" ? (
            <ProfileWorkspace />
          ) : view === "settings" ? (
            <SettingsView />
          ) : view === "notifications" ? (
            <NotificationsWorkspace />
          ) : view === "github-queue" ? (
            <GithubQueueWorkspace />
          ) : view === "vocabulary" ? (
            <VocabularyWorkspace />
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
                  {/* TODO 58 */}
                  {categories.length > 0 ? (
                    <>
                      <EmptyTitle>{t("home.openCategory")}</EmptyTitle>
                      <EmptyDescription>{t("home.pickFromSidebar")}</EmptyDescription>
                    </>
                  ) : (
                    <>
                      <EmptyTitle>{t("home.noCategories")}</EmptyTitle>
                      <EmptyDescription>
                        {t("home.createGuide")}
                      </EmptyDescription>
                    </>
                  )}
                </EmptyHeader>
              </Empty>
            </div>
          )}
        </main>

        <StatusBar />
        </div>
      </div>

      {/* 贴边悬浮展开开关：可上下拖动，位置持久化 */}
      {(view === "ai-chat" || view === "workspace") && sidebarCollapsed && (
        <SidebarToggleFab />
      )}

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <ConfigEditorDialog open={configEditorOpen} onOpenChange={setConfigEditorOpen} />
      <ImageCacheDialog open={imagesOpen} onOpenChange={setImagesOpen} />
      <NotificationToastQueue />
      <HealthReminderToasts />
      <AutoBackupWatcher />
    </div>
  )
}
