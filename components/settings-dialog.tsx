"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { RefreshCw, Keyboard, Download, Upload, Wand2, FileCog, Image as ImageIcon } from "lucide-react"
import { useWorkspace } from "@/lib/store"
import { exportBackup, importBackup } from "@/lib/backup"
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
  const setScriptsOpen = useWorkspace((s) => s.setScriptsOpen)
  const setConfigEditorOpen = useWorkspace((s) => s.setConfigEditorOpen)
  const setImagesOpen = useWorkspace((s) => s.setImagesOpen)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onExport() {
    const json = await exportBackup()
    if (!json) {
      toast.error("导出失败")
      return
    }
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `workplace-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("已导出备份（含图片）")
  }

  async function onImportFile(file: File | undefined) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const res = await importBackup(String(reader.result ?? ""))
        if (res.ok) {
          toast.success(`导入成功，已恢复数据与 ${res.images} 张图片`)
          setOpen(false)
        } else {
          toast.error("导入失败：文件格式不正确")
        }
      } catch {
        toast.error("导入失败：文件格式不正确")
      }
    }
    reader.readAsText(file)
  }

  return (
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
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  onImportFile(e.target.files?.[0])
                  e.target.value = ""
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">导入会覆盖当前全部数据，请先导出备份。</p>
          </section>

          <section className="flex flex-col gap-2">
            <Label className="text-xs font-medium text-muted-foreground">图片缓存</Label>
            <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setImagesOpen(true)}>
              <ImageIcon className="size-4" />
              查看并管理图片缓存 / 暂存区
            </Button>
          </section>
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
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
