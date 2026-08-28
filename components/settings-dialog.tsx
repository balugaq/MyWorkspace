"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useEscapeClose } from "@/hooks/use-escape-close"
import { RefreshCw, Keyboard, Download, Upload, FileCog, Image as ImageIcon, Scale } from "lucide-react"
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
import { LicenseDialog } from "@/components/license-dialog"
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

export function SettingsDialog() {
  const open = useWorkspace((s) => s.settingsOpen)
  const setOpen = useWorkspace((s) => s.setSettingsOpen)
  const settings = useWorkspace((s) => s.settings)
  const updateSettings = useWorkspace((s) => s.updateSettings)
  const setShortcut = useWorkspace((s) => s.setShortcut)
  // const setScriptsOpen = useWorkspace((s) => s.setScriptsOpen) // 日历标记脚本（已弃用停用）
  const setConfigEditorOpen = useWorkspace((s) => s.setConfigEditorOpen)
  const setImagesOpen = useWorkspace((s) => s.setImagesOpen)
  const fileRef = useRef<HTMLInputElement>(null)
  // 待导入的已解包 ZIP 文件映射（选中 zip 后、弹出替换/合并选择前暂存）
  const [pendingFiles, setPendingFiles] = useState<Record<string, Uint8Array> | null>(null)
  const [licenseOpen, setLicenseOpen] = useState(false)

  // ESC 关闭设置弹窗（与其它弹窗行为一致）
  useEscapeClose(open, () => setOpen(false))

  async function onExport() {
    try {
      const blob = await exportBackupZip()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `workplace-backup-${new Date().toISOString().slice(0, 10)}.zip`
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
