"use client"

// 设置工作区（独立 view，由顶栏设置按钮经 goSettings() 进入；原 settings-dialog 弹窗改造而来）。
// 分区：通用/基础 → 快捷键/键位 → 账户与同步 → AI 助手 → 高级 → GitHub 集成。
// 各块业务逻辑自旧弹窗原样迁移，仅重排分组；子弹窗（模型/人设/技能/许可证/导入方式）随迁。

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { RefreshCw, Keyboard, Download, Upload, FileCog, Image as ImageIcon, Scale, User, Sparkles, Wrench, Bot, Trash2, ChevronRight, Check, Braces } from "lucide-react"
import { cn } from "@/lib/utils"
import { useWorkspace } from "@/lib/store"
import {
  exportBackupZip,
  importBackup,
  parseBackupFile,
  importBackupZip,
  type ImportMode,
} from "@/lib/backup"
import {
  SHORTCUT_META,
  DEFAULT_NOTIFICATION_SCAN_TYPES,
  DEFAULT_QQ_RELAY_URL,
  type ShortcutBinding,
  type DefaultView,
  type ThemePreference,
  type UIFontFamily,
  type NotificationScanTypes,
  type NotificationLogEntry,
} from "@/lib/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { normalizeDayStartOffset } from "@/lib/contributions"
import { NOTIFICATION_CHANNELS } from "@/lib/notifications/channels"
import { LicenseDialog } from "@/components/license-dialog"
import { ModelManagerDialog } from "@/components/ai-models-dialog"
import { PersonaManagerDialog } from "@/components/ai-personas-dialog"
import { SkillsToggleDialog } from "@/components/ai-skills-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import pkg from "../package.json"

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
]

const DEFAULT_VIEWS: { value: DefaultView; label: string }[] = [
  { value: "ai-chat", label: "AI 对话" },
  { value: "workspace", label: "随笔" },
  { value: "calendar", label: "日历" },
  { value: "last", label: "打开上次的视图" },
]

const FONT_FAMILIES: { value: UIFontFamily; label: string }[] = [
  { value: "system", label: "系统默认" },
  { value: "serif", label: "衬线" },
  { value: "mono", label: "等宽" },
]

// 用户头像压缩：限制最长边 256px，转 JPEG 控制体积（避免撑爆 localStorage）。
const MAX_AVATAR = 256
function compressAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error("图片读取失败"))
      img.onload = () => {
        const scale = Math.min(1, MAX_AVATAR / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement("canvas")
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext("2d")
        if (!ctx) return reject(new Error("无法创建画布"))
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL("image/jpeg", 0.85))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

// 仓库格式：owner/name（允许字母数字 . - _）
const REPO_RE = /^[\w.-]+\/[\w.-]+$/

// 扫描类型开关元信息（键对应 NotificationScanTypes；label 用于仓库行内的紧凑勾选）
const SCAN_TYPE_META: { key: keyof NotificationScanTypes; label: string }[] = [
  { key: "commits", label: "提交" },
  { key: "issues", label: "Issue" },
  { key: "prs", label: "PR" },
  { key: "releases", label: "发布" },
]

// 设置分类清单（TODO 25 打磨）：左侧导航按钮按此渲染，右侧只显示选中分类的内容
const SETTINGS_SECTIONS = [
  { id: "general", label: "通用 / 基础" },
  { id: "shortcuts", label: "快捷键 / 键位" },
  { id: "account", label: "账户与同步" },
  { id: "ai", label: "AI 助手" },
  { id: "advanced", label: "高级" },
  { id: "notifications", label: "GitHub 集成" },
] as const

// 通知日志导出（TODO 27 配套）：把 store 里持久化的扫描/条目日志落成文件下载。
// txt = 人类可读的时间线；json = 原始结构化数据（便于程序处理或归档）。
function stamp(at: number): string {
  const d = new Date(at)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function exportNotificationLogs(logs: NotificationLogEntry[], format: "txt" | "json"): void {
  if (logs.length === 0) {
    toast.info("暂无日志可导出")
    return
  }
  const ts = stamp(Date.now()).replace(/[-: ]/g, "")
  let content: string
  let mime: string
  if (format === "json") {
    content = JSON.stringify(logs, null, 2)
    mime = "application/json;charset=utf-8"
  } else {
    content = logs
      .map((e) => {
        const kind = e.kind === "scan" ? "扫描" : "条目"
        const flag = e.kind === "item" ? (e.notified ? "已通知" : "未通知") : ""
        return `[${stamp(e.at)}] [${kind}]${flag ? ` [${flag}]` : ""} ${e.message}`
      })
      .join("\n")
    mime = "text/plain;charset=utf-8"
  }
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `notification-logs-${ts}.${format}`
  a.click()
  URL.revokeObjectURL(url)
  toast.success(`已导出 ${logs.length} 条日志`)
}

// 分区容器：小标题 + 分隔线 + 内容块
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="border-b pb-2 text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  )
}

export function SettingsView() {
  const settings = useWorkspace((s) => s.settings)
  const notificationLogs = useWorkspace((s) => s.notificationLogs)
  const updateSettings = useWorkspace((s) => s.updateSettings)
  const setShortcut = useWorkspace((s) => s.setShortcut)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const aiAvatarInputRef = useRef<HTMLInputElement>(null)
  const setConfigEditorOpen = useWorkspace((s) => s.setConfigEditorOpen)
  const setImagesOpen = useWorkspace((s) => s.setImagesOpen)
  const fileRef = useRef<HTMLInputElement>(null)
  // 待导入的已解包 ZIP 文件映射（选中 zip 后、弹出替换/合并选择前暂存）
  const [pendingFiles, setPendingFiles] = useState<Record<string, Uint8Array> | null>(null)
  const [licenseOpen, setLicenseOpen] = useState(false)
  const [modelsOpen, setModelsOpen] = useState(false)
  const [personasOpen, setPersonasOpen] = useState(false)
  const [skillsOpen, setSkillsOpen] = useState(false)
  // 通知：仓库输入框暂存文本 + 格式错误提示（落库走 updateSettings）
  const [repoInput, setRepoInput] = useState("")
  const [repoError, setRepoError] = useState("")
  // 设置分类导航（TODO 25 打磨）：左侧分类按钮 + 右侧只显示选中分类的内容；默认打开第一个分类
  const [activeSectionId, setActiveSectionId] = useState<(typeof SETTINGS_SECTIONS)[number]["id"]>(
    SETTINGS_SECTIONS[0].id,
  )

  function addNotificationRepo() {
    const v = repoInput.trim()
    if (!v) return
    if (!REPO_RE.test(v)) {
      setRepoError("格式应为 owner/name（仅限字母数字与 . - _）")
      return
    }
    if (settings.notificationRepos.some((r) => r.repo === v)) {
      setRepoError("该仓库已在列表中")
      return
    }
    setRepoError("")
    setRepoInput("")
    updateSettings({
      notificationRepos: [
        ...settings.notificationRepos,
        {
          repo: v,
          scanTypes: { ...DEFAULT_NOTIFICATION_SCAN_TYPES },
          commitMonitorOnly: false,
          // 扫描起点 = 添加时刻：只扫这之后的内容，不做历史回扫
          scanSince: Date.now(),
        },
      ],
    })
  }

  const activeModelEntry =
    settings.aiModels.find((m) => m.id === settings.aiActiveModelId) ?? settings.aiModels[0]
  const modelLabel = activeModelEntry?.label ?? "未配置"

  async function onExport() {
    try {
      const blob = await exportBackupZip()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      // 文件名用用户本地时区的日期：避免 toISOString()（UTC）在 GMT+8 等时区下差一天
      const now = new Date()
      const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
      a.download = `workplace-backup-${stamp}.zip`
      a.click()
      URL.revokeObjectURL(url)
      toast.success("已导出备份（ZIP：含分类/日历/设置与全部图片）")
    } catch {
      toast.error("导出失败")
    }
  }

  async function onImportFile(file: File | undefined) {
    if (!file) return
    try {
      const parsed = await parseBackupFile(file)
      if (parsed.kind === "zip") {
        if (!parsed.files["workspace.json"]) {
          toast.error("不是有效的备份文件（缺少 workspace.json）")
          return
        }
        setPendingFiles(parsed.files)
      } else {
        // 旧版纯 JSON 备份：按替换方式导入
        const res = await importBackup(parsed.json)
        if (res.ok) {
          toast.success(`导入成功，已恢复数据与 ${res.images} 张图片`)
        } else {
          toast.error("导入失败：文件格式不正确")
        }
      }
    } catch {
      toast.error("导入失败：无法读取文件")
    }
  }

  async function doImport(mode: ImportMode) {
    if (!pendingFiles) return
    const files = pendingFiles
    setPendingFiles(null)
    try {
      const res = await importBackupZip(files, mode)
      if (res.ok) {
        toast.success(`已${mode === "replace" ? "替换" : "合并"}导入，恢复 ${res.images} 张图片`)
      } else {
        toast.error(`导入失败：${res.reason ?? "数据解析失败"}`)
      }
    } catch {
      toast.error("导入失败：文件格式不正确")
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 顶栏：标题（风格与 Profile 等工作区一致） */}
      <header className="flex items-center px-8 py-6">
        <h1 className="text-2xl font-bold leading-tight text-foreground">设置</h1>
      </header>

      {/* 分类导航 + 内容区（TODO 25 打磨）：左侧分类按钮，右侧只显示选中分类的设置内容 */}
      <div className="flex min-h-0 flex-1">
        <nav className="w-44 shrink-0 border-r px-2 py-3">
          <div className="flex flex-col gap-0.5">
            {SETTINGS_SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSectionId(s.id)}
                className={cn(
                  "rounded-md px-3 py-2 text-left text-sm transition-colors",
                  activeSectionId === s.id
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </nav>

        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-8 pb-8">
            {activeSectionId === "general" && (
              <Section title="通用 / 基础">
            <section className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">主题</Label>
              <Select
                value={settings.theme}
                onValueChange={(v) => {
                  if (v) updateSettings({ theme: v })
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {THEMES.find((t) => t.value === settings.theme)?.label ?? "选择主题"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {THEMES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>

            <section className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">语言</Label>
              <Select value="zh-CN" disabled>
                <SelectTrigger className="w-full">
                  <SelectValue>中文</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh-CN">中文</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">更多语言支持计划中。</p>
            </section>

            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground">字体大小</Label>
                <span className="text-xs text-muted-foreground">{settings.fontSize}px</span>
              </div>
              <input
                type="range"
                min={12}
                max={24}
                step={1}
                value={settings.fontSize}
                onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })}
                className="w-full accent-primary"
              />
              <p className="text-xs text-muted-foreground">调整全局基础字号（12–24px），实时应用到整个界面。</p>
              <div className="mt-2 flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground">字体家族</Label>
              </div>
              <Select
                value={settings.uiFontFamily}
                onValueChange={(v) => {
                  if (v) updateSettings({ uiFontFamily: v })
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {FONT_FAMILIES.find((f) => f.value === settings.uiFontFamily)?.label ??
                      "选择字体家族"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {FONT_FAMILIES.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">切换界面整体字体（系统默认 / 衬线 / 等宽）。</p>
            </section>

            <section className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">启动行为</Label>
              <Select
                value={settings.defaultView}
                onValueChange={(v) => {
                  if (v) updateSettings({ defaultView: v })
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {DEFAULT_VIEWS.find((v) => v.value === settings.defaultView)?.label ??
                      "选择默认视图"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_VIEWS.map((v) => (
                    <SelectItem key={v.value} value={v.value}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">应用每次打开时默认进入的界面。</p>
            </section>
            </Section>
            )}

            {activeSectionId === "shortcuts" && (
              <Section title="快捷键 / 键位">
            <section className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <Keyboard className="size-3.5 text-muted-foreground" />
                <Label className="text-xs font-medium text-muted-foreground">快捷键</Label>
              </div>
              <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
                {SHORTCUT_META.map((meta) => (
                  <ShortcutRow
                    key={meta.action}
                    meta={meta}
                    binding={settings.shortcuts[meta.action]}
                    onSave={(b) => {
                      setShortcut(meta.action, b)
                      toast.success(`已更新「${meta.label}」快捷键`)
                    }}
                  />
                ))}
              </div>
            </section>
            </Section>
            )}

            {activeSectionId === "account" && (
              <Section title="账户与同步">
            <section className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">登录信息</Label>
              <div className="flex items-center gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground ring-1 ring-border">
                  {settings.aiUserAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={settings.aiUserAvatar}
                      alt="用户头像"
                      className="size-full object-cover"
                    />
                  ) : (
                    <User className="size-5" />
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    <ImageIcon className="size-3.5" />
                    {settings.aiUserAvatar ? "更换头像" : "上传头像"}
                  </Button>
                  {settings.aiUserAvatar && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-muted-foreground"
                      onClick={() => updateSettings({ aiUserAvatar: "" })}
                    >
                      清除
                    </Button>
                  )}
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ""
                    if (!f) return
                    try {
                      const dataUrl = await compressAvatar(f)
                      updateSettings({ aiUserAvatar: dataUrl })
                    } catch {
                      toast.error("头像读取失败，请换一张图片")
                    }
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="account-name" className="text-xs font-medium text-muted-foreground">名称</Label>
                <Input
                  id="account-name"
                  value={settings.userName}
                  placeholder="未命名用户"
                  onChange={(e) => updateSettings({ userName: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  个人主页展示的昵称；留空显示「未命名用户」。GitHub 贡献比对也使用该名称。
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="account-location" className="text-xs font-medium text-muted-foreground">地理位置</Label>
                <Input
                  id="account-location"
                  value={settings.location}
                  placeholder="中国"
                  onChange={(e) => updateSettings({ location: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  个人主页头像下方展示的所在地区标签；留空显示「中国」。
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                登录信息仅作本地展示，无实际账号体系。
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">生日</Label>
              <Input
                type="date"
                value={settings.birthday}
                onChange={(e) => updateSettings({ birthday: e.target.value })}
                className="max-w-48"
              />
              <p className="text-xs text-muted-foreground">
                用于日历侧栏的「人生进度条」（按 30000 天 ≈ 82 年计）。
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">版本信息</Label>
              <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
                <span className="text-sm font-medium">My Workspace</span>
                <span className="text-xs text-muted-foreground">v{pkg.version}</span>
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">数据备份（含图片）</Label>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-2" onClick={onExport}>
                  <Download className="size-4" />
                  导出备份
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="size-4" />
                  导入备份
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".zip,application/zip,application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    onImportFile(e.target.files?.[0])
                    e.target.value = ""
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                导出为 ZIP（含分类/日历/设置与全部图片）。导入时可选「替换」或「合并」。
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <Label htmlFor="day-start-offset" className="text-xs font-medium text-muted-foreground">
                每天翻篇时间
              </Label>
              <Input
                id="day-start-offset"
                type="time"
                step="60"
                value={settings.dayStartOffset}
                onChange={(e) => {
                  const v = e.target.value
                  // 编辑过程中 type=time 可能回空串：不写入（避免把默认值强行顶回去），只在拿到合法值时落库
                  if (v) updateSettings({ dayStartOffset: normalizeDayStartOffset(v) })
                }}
                className="w-40"
              />
              <p className="text-xs text-muted-foreground">
                {settings.dayStartOffset} 之前仍算前一天（影响贡献热力图与后续签到）。
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">开源许可证</Label>
              <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setLicenseOpen(true)}>
                <Scale className="size-4" />
                查看开源软件许可证
              </Button>
            </section>
            </Section>
            )}

            {activeSectionId === "ai" && (
              <Section title="AI 助手">
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2">
                <div className="min-w-0">
                  <Label className="text-xs font-medium">模型</Label>
                  <p className="truncate text-xs text-muted-foreground">
                    {settings.aiModels.length === 0
                      ? "尚未配置（点击添加）"
                      : `已配置 ${settings.aiModels.length} 个 · 当前：${modelLabel}`}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setModelsOpen(true)}
                >
                  <Sparkles className="size-4" />
                  管理模型
                </Button>
              </div>

              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                onClick={() => setSkillsOpen(true)}
              >
                <Wrench className="size-4" />
                技能启停
              </Button>

              <div className="flex flex-col gap-1">
                <Label className="text-xs font-medium">联网搜索 API Key（百度千帆 AI 搜索）</Label>
                <Input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={settings.baiduAiSearchApiKey}
                  placeholder="bce-v3/…（可选；配置后 AI 可使用 wb_web_search 联网搜索技能）"
                  onChange={(e) => updateSettings({ baiduAiSearchApiKey: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  配置后 AI 需要实时信息时会自动调用联网搜索技能（千帆 AI 搜索，有免费额度）。Key 仅本机存储，经本地代理转发。
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2">
                <div className="min-w-0">
                  <Label className="text-xs font-medium">人设</Label>
                  <p className="truncate text-xs text-muted-foreground">
                    {settings.aiActivePersonaId
                      ? `当前：${settings.aiPersonas.find((p) => p.id === settings.aiActivePersonaId)?.name ?? "—"}`
                      : "未使用（仅默认提示词）"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setPersonasOpen(true)}
                >
                  <Sparkles className="size-4" />
                  管理人设
                </Button>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary ring-1 ring-border">
                  {settings.aiAssistantAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={settings.aiAssistantAvatar}
                      alt="AI 头像"
                      className="size-full object-cover"
                    />
                  ) : (
                    <Bot className="size-5" />
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">AI 头像</span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => aiAvatarInputRef.current?.click()}
                    >
                      <ImageIcon className="size-3.5" />
                      {settings.aiAssistantAvatar ? "更换" : "上传"}
                    </Button>
                    {settings.aiAssistantAvatar && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-muted-foreground"
                        onClick={() => updateSettings({ aiAssistantAvatar: "" })}
                      >
                        清除
                      </Button>
                    )}
                  </div>
                  <input
                    ref={aiAvatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0]
                      e.target.value = ""
                      if (!f) return
                      try {
                        const dataUrl = await compressAvatar(f)
                        updateSettings({ aiAssistantAvatar: dataUrl })
                      } catch {
                        toast.error("头像读取失败，请换一张图片")
                      }
                    }}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                仅本机明文存储于 localStorage，请不要在共享环境使用。
              </p>
              <div className="mt-2 flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
                <div className="min-w-0">
                  <Label className="text-xs font-medium">AI 对话强制同步</Label>
                  <p className="text-xs text-muted-foreground">
                    开启后，所有对话的用户请求统一进入单队列、串行处理；关闭则允许并发。无论是否开启，切换会话 / 切走视图都不会中断在途请求。
                  </p>
                </div>
                <Switch
                  checked={settings.aiForceSync}
                  onCheckedChange={(v) => updateSettings({ aiForceSync: v })}
                />
              </div>
            </section>
            </Section>
            )}

            {activeSectionId === "advanced" && (
              <Section title="高级">
            <section className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">图片缓存</Label>
              <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setImagesOpen(true)}>
                <ImageIcon className="size-4" />
                查看并管理图片缓存 / 暂存区
              </Button>
            </section>

            <section className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">配置文件</Label>
              <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setConfigEditorOpen(true)}>
                <FileCog className="size-4" />
                编辑器打开配置文件（源文本）
              </Button>
              <p className="text-xs text-muted-foreground">
                直接查看/编辑持久化 JSON（分类/日历/设置/脚本）。高风险，仅供高级用户。
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">日志导出</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 justify-start gap-2"
                  onClick={() => exportNotificationLogs(notificationLogs, "txt")}
                >
                  <Download className="size-4" />
                  导出为文本（.txt）
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 justify-start gap-2"
                  onClick={() => exportNotificationLogs(notificationLogs, "json")}
                >
                  <Braces className="size-4" />
                  导出为 JSON
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                导出通知系统的扫描与内容日志（每轮扫描检查了哪些仓库、发现了哪些新 commit / Issue / PR / 发布、是否发送了通知提示）。按时间倒序，上限 500 条。
              </p>
            </section>
            </Section>
            )}

            {activeSectionId === "notifications" && (
              <Section title="GitHub 集成">
            <section className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">GitHub 令牌</Label>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={settings.githubToken}
                placeholder="ghp_…（GitHub 个人访问令牌，可选）"
                onChange={(e) => updateSettings({ githubToken: e.target.value })}
                className="w-full rounded-lg border bg-background px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
              <p className="text-xs text-muted-foreground">
                GitHub 预览卡与仓库扫描共用的 API 限额令牌（仅本机明文存储于 localStorage，请勿在共享环境使用）。留空则匿名访问（60 次/小时/IP）。
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">通知方式</Label>
              <div className="flex flex-col gap-1.5">
                {NOTIFICATION_CHANNELS.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm transition-colors hover:bg-muted/70"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-primary"
                      checked={settings.notificationChannels[c.id as keyof typeof settings.notificationChannels]}
                      onChange={(e) =>
                        updateSettings({
                          notificationChannels: {
                            ...settings.notificationChannels,
                            [c.id]: e.target.checked,
                          },
                        })
                      }
                    />
                    <span className="flex flex-col gap-0.5">
                      <span>{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.description}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-medium text-muted-foreground">QQ 中转服务地址</Label>
                <Input
                  value={settings.qqRelayUrl}
                  placeholder={DEFAULT_QQ_RELAY_URL}
                  spellCheck={false}
                  className="font-mono"
                  onChange={(e) => updateSettings({ qqRelayUrl: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  {`本机常驻中转服务的地址（POST JSON {"text":"..."}）；留空回落默认值。QQ 通知仅在本机运行工作台且中转服务常驻时可用。`}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                两个都不勾选时，新通知仍会入库到通知中心，只是不做任何弹窗或推送。
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">扫描仓库</Label>
              <div className="flex gap-2">
                <Input
                  value={repoInput}
                  placeholder="owner/name，如 torvalds/linux"
                  spellCheck={false}
                  className="font-mono"
                  onChange={(e) => {
                    setRepoInput(e.target.value)
                    if (repoError) setRepoError("")
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) addNotificationRepo()
                  }}
                />
                <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={addNotificationRepo}>
                  添加
                </Button>
              </div>
              {repoError && <p className="text-xs text-destructive">{repoError}</p>}
              {settings.notificationRepos.length > 0 && (
                <div className="flex flex-col gap-1 rounded-lg border bg-muted/40 p-2">
                  {settings.notificationRepos.map((r) => (
                    <div
                      key={r.repo}
                      className="flex items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-muted/70"
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-xs" title={r.repo}>
                        {r.repo}
                      </span>
                      {/* 每仓库独立的扫描类型开关（新增默认：提交关，其余开） */}
                      <div className="flex shrink-0 items-center gap-2">
                        {/* 「仅监听 commit」下拉：commit 照扫并计贡献，但不产生通知/弹窗 */}
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <button
                                type="button"
                                aria-label={`${r.repo} 的 commit 监听方式`}
                                title={
                                  r.commitMonitorOnly
                                    ? "仅监听：commit 计贡献但不弹通知（点击更改）"
                                    : "commit 监听方式（点击设置仅监听）"
                                }
                                className={cn(
                                  "flex size-5 items-center justify-center rounded transition-colors hover:bg-muted",
                                  r.commitMonitorOnly
                                    ? "text-primary"
                                    : "text-muted-foreground hover:text-foreground",
                                )}
                              />
                            }
                          >
                            <ChevronRight className="size-3.5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-32">
                            <DropdownMenuItem
                              onClick={() =>
                                updateSettings({
                                  notificationRepos: settings.notificationRepos.map((cfg) =>
                                    cfg.repo === r.repo
                                      ? { ...cfg, commitMonitorOnly: !cfg.commitMonitorOnly }
                                      : cfg
                                  ),
                                })
                              }
                            >
                              {r.commitMonitorOnly ? <Check className="text-primary" /> : <span className="size-4" aria-hidden />}
                              仅监听
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {SCAN_TYPE_META.map((t) => (
                          <label
                            key={t.key}
                            className="flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <input
                              type="checkbox"
                              className="accent-primary"
                              checked={r.scanTypes[t.key]}
                              onChange={(e) =>
                                updateSettings({
                                  notificationRepos: settings.notificationRepos.map((cfg) =>
                                    cfg.repo === r.repo
                                      ? {
                                          ...cfg,
                                          scanTypes: { ...cfg.scanTypes, [t.key]: e.target.checked },
                                          // 启用（关→开）某类扫描时重置扫描起点 = 当前时刻，只扫之后的内容
                                          scanSince:
                                            e.target.checked && !cfg.scanTypes[t.key]
                                              ? Date.now()
                                              : cfg.scanSince,
                                        }
                                      : cfg
                                  ),
                                })
                              }
                            />
                            {t.label}
                          </label>
                        ))}
                      </div>
                      <button
                        type="button"
                        aria-label={`移除 ${r.repo}`}
                        className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        onClick={() =>
                          updateSettings({
                            notificationRepos: settings.notificationRepos.filter((x) => x.repo !== r.repo),
                          })
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                通知调度器每 5 分钟扫描一次这些仓库的新动态（复用上方 GitHub 令牌，可选）。每个仓库可单独勾选要扫描的类型，新增仓库默认只扫 Issue / PR / 发布；点仓库行的小耳朵图标可把 commit 设为「仅监听」——照常计入贡献热力图但不弹通知。扫描到的 commit / Issue / PR 若作者与「账户与同步 → 名称」一致，会计入个人主页贡献热力图（commit 计 1，Issue / PR 各计 2）。改动在下一轮扫描（5 分钟内）生效。扫描起点为添加仓库 / 勾选启用某类扫描的时刻，此前产生的历史内容不做回扫。
              </p>
            </section>
            </Section>
            )}

          <ModelManagerDialog open={modelsOpen} onOpenChange={setModelsOpen} />
          <PersonaManagerDialog open={personasOpen} onOpenChange={setPersonasOpen} />
          <SkillsToggleDialog open={skillsOpen} onOpenChange={setSkillsOpen} />
          <LicenseDialog open={licenseOpen} onOpenChange={setLicenseOpen} />

          {/* 导入模式选择：替换 / 合并 */}
          <Dialog open={!!pendingFiles} onOpenChange={(v) => { if (!v) setPendingFiles(null) }}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>选择导入方式</DialogTitle>
                <DialogDescription>
                  备份包含分类、日历、设置与图片。替换会覆盖当前全部数据；合并则按 id / 日期合并、保留现有数据。
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Button onClick={() => doImport("replace")}>替换导入（覆盖当前数据）</Button>
                <Button variant="outline" onClick={() => doImport("merge")}>
                  合并导入（保留现有，按 id / 日期合并）
                </Button>
                <Button variant="ghost" onClick={() => setPendingFiles(null)}>
                  取消
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

function ShortcutRow({
  meta,
  binding,
  onSave,
}: {
  meta: (typeof SHORTCUT_META)[number]
  binding: ShortcutBinding
  onSave: (b: ShortcutBinding) => void
}) {
  const [recording, setRecording] = useState(false)

  // 录音状态下捕获组合键
  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      // 记录 [ctrl/cmd] + 单字符；忽略 Shift/Alt（不纳入组合）
      const key = e.key.toLowerCase()
      if (key.length === 1 && key >= "a" && key <= "z") {
        onSave({ modifier: e.ctrlKey || e.metaKey, key })
        setRecording(false)
      } else if (e.key === "Escape") {
        setRecording(false)
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [recording, onSave])

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{meta.label}</p>
        <p className="truncate text-xs text-muted-foreground">{meta.description}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {recording ? (
          <span className="rounded-md border border-primary bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
            按下组合键…
          </span>
        ) : (
          <kbd className="rounded-md border bg-background px-2 py-1 text-xs font-semibold uppercase">
            {binding.modifier ? "Ctrl+" : ""}
            {binding.key}
          </kbd>
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => setRecording((v) => !v)}
        >
          {recording ? "取消" : "修改"}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          title="重置为默认"
          onClick={() => onSave({ ...meta.defaults })}
        >
          <RefreshCw className="size-3.5" />
          <span className="sr-only">重置</span>
        </Button>
      </div>
    </div>
  )
}
