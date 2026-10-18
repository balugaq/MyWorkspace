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

// TODO 75 调参：极光开启时内容容器的毛玻璃样式（宿主目视后在此迭代透明度 / 模糊度）
const AURORA_GLASS = "bg-background/60 backdrop-blur-md"

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

  // 桌面端侧边栏宽度（拖拽分隔条调整，持久化到 store）：
  // 实时宽度用本地 state 保证拖动流畅，松手时写入 store，刷新后从 store 恢复。
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

  // 界面语言（TODO 40）：hydrate 后按 settings.uiLanguage 同步 i18next；切换语言时跟随
  useEffect(() => {
    if (hydrated) syncLocale(uiLanguage)
  }, [hydrated, uiLanguage])

  // 工具栏自动收展（TODO 25 打磨）：打开个人主页时收起，其他页面自动展开
  const setToolbarCollapsed = useWorkspace((s) => s.setToolbarCollapsed)
  useEffect(() => {
    setToolbarCollapsed(view === "profile")
  }, [view, setToolbarCollapsed])

  useEffect(() => {
    const onOpenSearch = () => setSearchOpen(true)
    window.addEventListener("dsh:open-search", onOpenSearch)
    return () => window.removeEventListener("dsh:open-search", onOpenSearch)
  }, [])

  // close mobile drawer whenever the active view changes
  useEffect(() => {
    setMobileNav(false)
  }, [activeCategoryId, view])

  // 通知调度器（TODO 20 / 18）：hydrate 后启动（内部模块级 flag 幂等，重复调用安全）。
  // 每 5 分钟扫描配置仓库的新动态 + 维护活跃心跳。
  useEffect(() => {
    if (!hydrated) return
    startNotificationScheduler()
  }, [hydrated])


  const activeCategory = categories.find((c) => c.id === activeCategoryId)

  return (
    // TODO 75：极光开启时根容器透明，露出底层固定定位的游动极光 canvas；关闭回落纯色 bg-background
    <div
      className={`flex h-svh flex-col overflow-hidden${auroraBackground ? "" : " bg-background"}`}
    >
      {/* 游动极光背景（TODO 75）：全局单例，fixed inset-0 z-0，不拦截指针事件 */}
      {auroraBackground && <AuroraBackground />}

      {/* 全局顶栏：移动端导航 + 品牌（点击回主界面）+ 搜索/设置/头像菜单 */}
      <BrandHeader onOpenNav={() => setMobileNav(true)} onOpenSearch={() => setSearchOpen(true)} />

      <div className="flex min-h-0 flex-1">
        {/* 左列（TODO 25）双分支：
            A. AI 对话 / 随笔 / 日历 / 保险库 且未收起 → 完整左列（border + 拖拽分隔条），
               内容区按视图切换（会话列表 / 分类 / AI 快捷提问 / 密码生成器）+ 底部工具栏；
            B. 其他视图（个人主页 / 设置等）或已收起 → 不渲染左列与分隔栏，
               工具栏改为 fixed 钉在左下角，保证任何界面都有导航入口 */}
        {(view === "ai-chat" ||
          view === "workspace" ||
          view === "calendar" ||
          view === "vault") &&
        !sidebarCollapsed ? (
          <>
            <div
              ref={sidebarHostRef}
              className={`hidden shrink-0 border-r md:block${auroraBackground ? ` ${AURORA_GLASS}` : ""}`}
              style={{ width: sidebarWidthLocal }}
            >
              <div className="grid h-full grid-rows-[1fr_auto]">
                <div className="min-h-0 overflow-hidden">
                  <SidebarContent />
                </div>
                <ToolbarPanel />
              </div>
            </div>

            {/* 可拖拽分隔条：桌面端左右拖动调整侧边栏宽度 */}
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
            className={`fixed bottom-0 left-0 z-40 hidden shrink-0 border-r border-t md:block${
              auroraBackground ? " bg-sidebar/60 backdrop-blur-md" : " bg-sidebar"
            }`}
            style={{ width: sidebarWidthLocal }}
          >
            <ToolbarPanel />
          </div>
        )}

        {/* 悬浮 sidebar：移动端 PanelLeft 按钮呼出；仅保留折叠按钮 */}
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
                  {/* TODO 58：有分类但未打开 → 提示打开；一个分类都没有 → 引导创建 */}
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

      {/* 侧边栏收起后的贴边悬浮展开开关：可上下拖动，位置持久化 */}
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
