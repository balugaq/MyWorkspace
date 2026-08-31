"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useEscapeClose } from "@/hooks/use-escape-close"
import { RefreshCw, Keyboard, Download, Upload, FileCog, Image as ImageIcon, Scale, User, Sparkles, Wrench, Bot } from "lucide-react"
// import { Wand2 } from "lucide-react" // 日历标记脚本入口（已弃用停用）
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
  type ShortcutBinding,
  type DefaultView,
  type ThemePreference,
} from "@/lib/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
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

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
]

const DEFAULT_VIEWS: { value: DefaultView; label: string }[] = [
  { value: "workspace", label: "工作台" },
  { value: "calendar", label: "日历" },
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

export function SettingsDialog() {
  const open = useWorkspace((s) => s.settingsOpen)
  const setOpen = useWorkspace((s) => s.setSettingsOpen)
  const settings = useWorkspace((s) => s.settings)
  const updateSettings = useWorkspace((s) => s.updateSettings)
  const setShortcut = useWorkspace((s) => s.setShortcut)
  // const setScriptsOpen = useWorkspace((s) => s.setScriptsOpen) // 日历标记脚本（已弃用停用）
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

  const activeModelEntry =
    settings.aiModels.find((m) => m.id === settings.aiActiveModelId) ?? settings.aiModels[0]
  const modelLabel = activeModelEntry?.label ?? "未配置"

  // ESC 关闭设置弹窗（与其它弹窗行为一致）
  useEscapeClose(open, () => setOpen(false))

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
          setOpen(false)
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
        setOpen(false)
      } else {
        toast.error(`导入失败：${res.reason ?? "数据解析失败"}`)
      }
    } catch {
      toast.error("导入失败：文件格式不正确")
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>调整默认启动视图、主题、全局快捷键，以及数据备份。</DialogDescription>
        </DialogHeader>

        <div className="flex h-full flex-col gap-6 py-2">
          <ScrollArea className="max-h-[60vh] min-h-0 flex-1 overflow-hidden pr-2">
            <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <Label className="text-xs font-medium text-muted-foreground">默认视图</Label>
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
          </section>

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

          {/* 日历标记脚本（已弃用停用：隐藏入口）
          <section className="flex flex-col gap-2">
            <Label className="text-xs font-medium text-muted-foreground">日历标记</Label>
            <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setScriptsOpen(true)}>
              <Wand2 className="size-4" />
              管理日历标记脚本
            </Button>
            <p className="text-xs text-muted-foreground">
              编写脚本订阅 RenderDateEvent，用 JSON/YAML/XML 为单个日期块绘制标记。
            </p>
          </section>
          */}

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
            <Label className="text-xs font-medium text-muted-foreground">GitHub 集成</Label>
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
              GitHub 预览卡的 API 限额令牌（仅本机明文存储于 localStorage，请勿在共享环境使用）。留空则匿名访问（60 次/小时/IP）。
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <Label className="text-xs font-medium text-muted-foreground">AI 助手</Label>

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
            <div className="mt-1 flex items-center gap-3">
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
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">用户头像</span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    <ImageIcon className="size-3.5" />
                    {settings.aiUserAvatar ? "更换" : "上传"}
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

          <ModelManagerDialog open={modelsOpen} onOpenChange={setModelsOpen} />
          <PersonaManagerDialog open={personasOpen} onOpenChange={setPersonasOpen} />
          <SkillsToggleDialog open={skillsOpen} onOpenChange={setSkillsOpen} />

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
            <Label className="text-xs font-medium text-muted-foreground">图片缓存</Label>
            <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setImagesOpen(true)}>
              <ImageIcon className="size-4" />
              查看并管理图片缓存 / 暂存区
            </Button>
          </section>

          <section className="flex flex-col gap-2">
            <Label className="text-xs font-medium text-muted-foreground">开源许可证</Label>
            <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setLicenseOpen(true)}>
              <Scale className="size-4" />
              查看开源软件许可证
            </Button>
          </section>
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>

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

    <LicenseDialog open={licenseOpen} onOpenChange={setLicenseOpen} />
    </>
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
