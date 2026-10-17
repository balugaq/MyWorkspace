"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
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
import { NativeScrollArea } from "@/components/ui/native-scroll-area"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { matchTextPinyin } from "@/lib/pinyin"
import {
  scheduleVaultClipboardClear,
  cancelVaultClipboardClear,
} from "@/lib/vault-clipboard"
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
  const { t } = useTranslation()
  const vault = useVault()

  if (vault.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("vault.checking")}
      </div>
    )
  }

  if (vault.status === "no-vault") return <CreateVault />
  if (vault.status === "locked") return <UnlockVault />

  return <VaultHome />
}

/** 尚未创建保险库：设置主密码 */
function CreateVault() {
  const { t } = useTranslation()
  const { create, busy, error } = useVault()
  const [pw, setPw] = useState("")
  const [confirm, setConfirm] = useState("")

  async function submit() {
    if (pw.length < 4) {
      toast.error(t("vault.pwdTooShort"))
      return
    }
    if (pw !== confirm) {
      toast.error(t("vault.pwdMismatch"))
      return
    }
    await create(pw)
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">{t("vault.createTitle")}</h2>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          {t("vault.createDesc1")}
          <span className="font-medium"> AES-256 </span>
          {t("vault.createDesc2")}
          {t("vault.createDesc3")}
        </p>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("vault.masterPwd")}</Label>
            <Input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) submit()
              }}
              placeholder={t("vault.pwdUnlockHint")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("vault.confirmPwd")}</Label>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) submit()
              }}
              placeholder={t("vault.repeatInput")}
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button onClick={submit} disabled={busy} className="mt-1 gap-1.5">
            <KeyRound className="size-4" />
            {busy ? t("vault.creating") : t("vault.createAndUnlock")}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** 已锁定：输入主密码解锁 */
function UnlockVault() {
  const { t } = useTranslation()
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
          <h2 className="text-lg font-semibold">{t("vault.unlockTitle")}</h2>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          {t("vault.unlockDesc")}
        </p>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("vault.masterPwd")}</Label>
            <Input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) submit()
              }}
              placeholder={t("vault.masterPwd")}
              autoFocus
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button onClick={submit} disabled={busy} className="mt-1 gap-1.5">
            <KeyRound className="size-4" />
            {busy ? t("vault.unlocking") : t("vault.unlock")}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** 已解锁：条目管理 */
function VaultHome() {
  const { t } = useTranslation()
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
      // 拼音增强只用于 name；value 是敏感内容（多为账号/密码原文），不进拼音缓存
      (e) => matchTextPinyin(e.name, q) || e.value.toLowerCase().includes(q),
    )
  }, [entries, query])

  // 监听「用户在保险库内选中文本并 Ctrl+C / 右键复制」：若复制源自保险库值，安排 30s 后清剪贴板；
  // 若复制发生在保险库之外，则取消待清计划，避免误清非保险库内容。
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      const t = e.target as Element | null
      if (t && "closest" in t && t.closest("[data-vault-value]")) {
        scheduleVaultClipboardClear()
      } else {
        cancelVaultClipboardClear()
      }
    }
    window.addEventListener("copy", onCopy)
    return () => window.removeEventListener("copy", onCopy)
  }, [])

  async function submitAdd() {
    if (!name.trim()) {
      toast.error(t("vault.errName"))
      return
    }
    await addEntry(name.trim(), value)
    setName("")
    setValue("")
    if (!error) toast.success(t("vault.entryAdded"))
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" />
          <div className="leading-tight">
            <h2 className="text-sm font-semibold">{t("vault.title")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("vault.entryCount", { n: entries.length })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowPwDialog(true)}>
            <KeyRound className="size-3.5" />
            {t("vault.changePwd")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-destructive hover:text-destructive"
            onClick={() => setDestroyOpen(true)}
          >
            <Trash2 className="size-3.5" />
            {t("vault.destroy")}
          </Button>
          <Button variant="ghost" size="icon" className="size-8" title={t("vault.lock")} onClick={lock}>
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
              placeholder={t("vault.searchPlaceholder")}
              className="pl-8"
            />
          </div>
        </div>

        <div className="rounded-lg border bg-card p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t("vault.addEntry")}</p>
          <div className="flex flex-col gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("vault.namePlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) submitAdd()
              }}
            />
            <NativeScrollArea>
              <Textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={t("vault.valuePlaceholder")}
                className="min-h-16 max-h-64 overflow-y-auto resize-none"
              />
            </NativeScrollArea>
            <Button onClick={submitAdd} disabled={busy} className="self-start gap-1.5">
              <Plus className="size-4" />
              {t("common.add")}
            </Button>
          </div>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {entries.length === 0 ? t("vault.noEntries") : t("vault.noMatch")}
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
            <AlertDialogTitle>{t("vault.destroyTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("vault.destroyDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                destroy()
                setDestroyOpen(false)
              }}
            >
              {t("vault.confirmDestroy")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function EntryCard({ entry }: { entry: VaultEntry }) {
  const { t } = useTranslation()
  const { updateEntry, removeEntry, busy } = useVault()
  const [revealed, setRevealed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [name, setName] = useState(entry.name)
  const [value, setValue] = useState(entry.value)

  async function copy() {
    try {
      await navigator.clipboard.writeText(entry.value)
      scheduleVaultClipboardClear()
      toast.success(t("vault.copiedValue"))
    } catch {
      toast.error(t("common.copyFailed"))
    }
  }

  async function saveEdit() {
    if (!name.trim()) {
      toast.error(t("vault.errName"))
      return
    }
    await updateEntry(entry.id, { name: name.trim(), value })
    setEditing(false)
    toast.success(t("vault.saved"))
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("vault.nameShort")} />
        <NativeScrollArea>
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="min-h-16 max-h-64 overflow-y-auto resize-none"
            placeholder={t("vault.valueShort")}
          />
        </NativeScrollArea>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            {t("common.cancel")}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={saveEdit} disabled={busy}>
            {t("common.save")}
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
            data-vault-value
            className={cn(
              "mt-0.5 break-words whitespace-pre-wrap text-sm text-muted-foreground",
              !revealed && "tracking-widest text-foreground/70",
            )}
          >
            {revealed ? entry.value || <span className="text-muted-foreground">{t("vault.empty")}</span> : "••••••••••••"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title={revealed ? t("vault.hide") : t("vault.show")}
            onClick={() => setRevealed((v) => !v)}
          >
            {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="size-7" title={t("vault.copyValue")} onClick={copy}>
            <Copy className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title={t("common.edit")}
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
            title={t("common.delete")}
            onClick={() => setDelOpen(true)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("vault.deleteTitle", { name: entry.name })}</AlertDialogTitle>
            <AlertDialogDescription>{t("vault.deleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => removeEntry(entry.id)}
            >
              {t("common.delete")}
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
  const { t } = useTranslation()
  const [pw, setPw] = useState("")
  const [confirm, setConfirm] = useState("")

  async function submit() {
    if (pw.length < 4) {
      toast.error(t("vault.pwdTooShort"))
      return
    }
    if (pw !== confirm) {
      toast.error(t("vault.pwdMismatch"))
      return
    }
    await onConfirm(pw)
    toast.success(t("vault.pwdUpdated"))
    setPw("")
    setConfirm("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("vault.changePwdTitle")}</DialogTitle>
          <DialogDescription>{t("vault.changePwdDesc")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("vault.newPwd")}</Label>
            <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("vault.confirmNewPwd")}</Label>
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
            {t("vault.confirmChange")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
