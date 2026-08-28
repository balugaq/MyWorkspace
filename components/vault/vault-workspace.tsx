"use client"

import { useMemo, useState } from "react"
import {
  KeyRound,
  Plus,
  Eye,
  EyeOff,
  Copy,
  Pencil,
  Trash2,
  Lock,
  ShieldCheck,
  Search,
} from "lucide-react"
import { toast } from "sonner"
import { useVault, type VaultEntry } from "./vault-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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

export function VaultWorkspace() {
  const vault = useVault()

  if (vault.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        正在检查保险库…
      </div>
    )
  }

  if (vault.status === "no-vault") return <CreateVault />
  if (vault.status === "locked") return <UnlockVault />

  return <VaultHome />
}

/** 尚未创建保险库：设置主密码 */
function CreateVault() {
  const { create, busy, error } = useVault()
  const [pw, setPw] = useState("")
  const [confirm, setConfirm] = useState("")

  async function submit() {
    if (pw.length < 4) {
      toast.error("主密码至少 4 位")
      return
    }
    if (pw !== confirm) {
      toast.error("两次输入的密码不一致")
      return
    }
    await create(pw)
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">创建密码保险库</h2>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          设置一个主密码。所有条目（名称 + 值）将用
          <span className="font-medium"> AES-256 </span>
          加密后存入浏览器数据库，<span className="font-medium">主密码不会保存、无法找回</span>
          ，请务必牢记。
        </p>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">主密码</Label>
            <Input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) submit()
              }}
              placeholder="用于解锁保险库"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">确认主密码</Label>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) submit()
              }}
              placeholder="再次输入"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button onClick={submit} disabled={busy} className="mt-1 gap-1.5">
            <KeyRound className="size-4" />
            {busy ? "创建中…" : "创建并解锁"}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** 已锁定：输入主密码解锁 */
function UnlockVault() {
  const { unlock, busy, error } = useVault()
  const [pw, setPw] = useState("")

  async function submit() {
    if (!pw) return
    await unlock(pw)
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Lock className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">解锁密码保险库</h2>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          输入主密码以解密并查看条目。
        </p>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">主密码</Label>
            <Input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) submit()
              }}
              placeholder="主密码"
              autoFocus
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button onClick={submit} disabled={busy} className="mt-1 gap-1.5">
            <KeyRound className="size-4" />
            {busy ? "解锁中…" : "解锁"}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** 已解锁：条目管理 */
function VaultHome() {
  const { entries, lock, busy, error, addEntry, changePassword, destroy } = useVault()
  const [query, setQuery] = useState("")
  const [name, setName] = useState("")
  const [value, setValue] = useState("")
  const [showPwDialog, setShowPwDialog] = useState(false)
  const [destroyOpen, setDestroyOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(
      (e) => e.name.toLowerCase().includes(q) || e.value.toLowerCase().includes(q),
    )
  }, [entries, query])

  async function submitAdd() {
    if (!name.trim()) {
      toast.error("请填写名称")
      return
    }
    await addEntry(name.trim(), value)
    setName("")
    setValue("")
    if (!error) toast.success("已添加条目")
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" />
          <div className="leading-tight">
            <h2 className="text-sm font-semibold">密码保险库</h2>
            <p className="text-xs text-muted-foreground">
              {entries.length} 条 · AES-256 加密
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowPwDialog(true)}>
            <KeyRound className="size-3.5" />
            改密码
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-destructive hover:text-destructive"
            onClick={() => setDestroyOpen(true)}
          >
            <Trash2 className="size-3.5" />
            销毁
          </Button>
          <Button variant="ghost" size="icon" className="size-8" title="锁定" onClick={lock}>
            <Lock className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 py-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索名称或内容…"
              className="pl-8"
            />
          </div>
        </div>

        <div className="rounded-lg border bg-card p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">新增条目（名称 : 值）</p>
          <div className="flex flex-col gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="名称，如：微博 / 恢复码 / 混合信息"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) submitAdd()
              }}
            />
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="值：账号、密码或任意混合内容，完全由你填写"
              className="min-h-16 resize-y"
            />
            <Button onClick={submitAdd} disabled={busy} className="self-start gap-1.5">
              <Plus className="size-4" />
              添加
            </Button>
          </div>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {entries.length === 0 ? "还没有任何条目，先在上方添加一条。" : "没有匹配的条目。"}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((e) => (
              <EntryCard key={e.id} entry={e} />
            ))}
          </div>
        )}
      </ScrollArea>

      <ChangePasswordDialog open={showPwDialog} onOpenChange={setShowPwDialog} onConfirm={changePassword} busy={busy} />
      <AlertDialog open={destroyOpen} onOpenChange={setDestroyOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>销毁保险库？</AlertDialogTitle>
            <AlertDialogDescription>
              这将删除本地全部加密数据（需重新用主密码创建）。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                destroy()
                setDestroyOpen(false)
              }}
            >
              确认销毁
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function EntryCard({ entry }: { entry: VaultEntry }) {
  const { updateEntry, removeEntry, busy } = useVault()
  const [revealed, setRevealed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [name, setName] = useState(entry.name)
  const [value, setValue] = useState(entry.value)

  async function copy() {
    try {
      await navigator.clipboard.writeText(entry.value)
      toast.success("已复制值")
    } catch {
      toast.error("复制失败")
    }
  }

  async function saveEdit() {
    if (!name.trim()) {
      toast.error("名称不能为空")
      return
    }
    await updateEntry(entry.id, { name: name.trim(), value })
    setEditing(false)
    toast.success("已保存")
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="名称" />
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-h-16 resize-y"
          placeholder="值"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            取消
          </Button>
          <Button size="sm" className="gap-1.5" onClick={saveEdit} disabled={busy}>
            保存
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{entry.name}</p>
          <p
            className={cn(
              "mt-0.5 break-words whitespace-pre-wrap text-sm text-muted-foreground",
              !revealed && "tracking-widest text-foreground/70",
            )}
          >
            {revealed ? entry.value || <span className="text-muted-foreground">（空）</span> : "••••••••••••"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title={revealed ? "隐藏" : "显示"}
            onClick={() => setRevealed((v) => !v)}
          >
            {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="size-7" title="复制值" onClick={copy}>
            <Copy className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title="编辑"
            onClick={() => {
              setName(entry.name)
              setValue(entry.value)
              setEditing(true)
            }}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-destructive hover:text-destructive"
            title="删除"
            onClick={() => setDelOpen(true)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除「{entry.name}」？</AlertDialogTitle>
            <AlertDialogDescription>此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => removeEntry(entry.id)}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ChangePasswordDialog({
  open,
  onOpenChange,
  onConfirm,
  busy,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onConfirm: (pw: string) => Promise<void>
  busy: boolean
}) {
  const [pw, setPw] = useState("")
  const [confirm, setConfirm] = useState("")

  async function submit() {
    if (pw.length < 4) {
      toast.error("新密码至少 4 位")
      return
    }
    if (pw !== confirm) {
      toast.error("两次输入不一致")
      return
    }
    await onConfirm(pw)
    toast.success("主密码已更新")
    setPw("")
    setConfirm("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>修改主密码</DialogTitle>
          <DialogDescription>修改后立即用新密码重新加密全部条目。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">新主密码</Label>
            <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">确认新主密码</Label>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) submit()
              }}
            />
          </div>
          <Button onClick={submit} disabled={busy} className="gap-1.5">
            <KeyRound className="size-4" />
            确认修改
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
