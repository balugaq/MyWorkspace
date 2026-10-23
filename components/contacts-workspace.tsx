"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Search,
  Users,
  Copy,
  ChevronDown,
  Contact as ContactIcon,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import {
  parseBirthday,
  type Person,
} from "@/lib/address-book"
import { useWorkspace } from "@/lib/store"
import { useTranslation } from "react-i18next"
import { matchTextPinyin } from "@/lib/pinyin"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/**
 * 联系人工作区（TODO 48）：store 持久化驱动，可增删改；
 * public/address_book.yml 降级为设置页手动导入源（整表覆盖）。
 */

const TYPE_LABEL: Record<string, string> = {
  phone: "contacts.type.phone",
  qq: "contacts.type.qq",
  email: "contacts.type.email",
  wechat: "contacts.type.wechat",
}

const TYPE_OPTIONS = ["phone", "qq", "email", "wechat"] as const

export function ContactsWorkspace() {
  const { t } = useTranslation()
  const people = useWorkspace((s) => s.contacts)
  const addContact = useWorkspace((s) => s.addContact)
  const updateContact = useWorkspace((s) => s.updateContact)
  const removeContact = useWorkspace((s) => s.removeContact)
  const addKnownTags = useWorkspace((s) => s.addKnownTags)
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // roles 汇入全局标签库（幂等，已存在忽略）
  useEffect(() => {
    const roles = Array.from(new Set(people.flatMap((p) => p.roles ?? [])))
    if (roles.length > 0) addKnownTags(roles)
  }, [people, addKnownTags])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return people
    const match = (s?: string) => matchTextPinyin(s, q)
    return people.filter((p) => {
      if (match(p.name) || match(p.description) || match(p.birthday) || match(p.address)) return true
      if ((p.roles ?? []).some((r) => match(r))) return true
      if ((p.contact ?? []).some((c) => match(c.type) || match(c.value))) return true
      return false
    })
  }, [people, query])

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function copyValue(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(t("contacts.copiedField", { label }))
    } catch {
      toast.error(t("contacts.copyFailed"))
    }
  }

  function openCreate() {
    setEditingId(null)
    setFormOpen(true)
  }

  function openEdit(p: Person) {
    setEditingId(p.id)
    setFormOpen(true)
  }

  function handleSave(fields: Omit<Person, "id">) {
    if (editingId) {
      updateContact(editingId, fields)
      toast.success(t("contacts.saved"))
    } else {
      const id = addContact()
      updateContact(id, fields)
      toast.success(t("contacts.created"))
    }
  }

  function handleRemove(p: Person) {
    removeContact(p.id)
    toast.success(t("contacts.deleted", { name: p.name }))
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <h1 className="font-serif text-lg font-semibold">{t("contacts.title")}</h1>
        <div className="flex-1" />
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-1.5">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("contacts.searchPlaceholder")}
            className="w-64 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
        </div>
        <Button size="sm" className="gap-1.5" onClick={openCreate}>
          <Plus className="size-4" />
          {t("contacts.new")}
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
          <Users className="size-8" />
          <p className="text-sm">
            {people.length === 0
              ? t("contacts.empty")
              : t("contacts.noMatch", { query })}
          </p>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto w-full max-w-3xl px-6 py-6">
            <div className="flex flex-col gap-3">
              {filtered.map((p) => {
                const isOpen = expanded.has(p.id)
                return (
                  <div key={p.id} className="flex w-full flex-col rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50">
                    <div className="flex w-full items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggle(p.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <UserAvatar />
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="max-w-full truncate font-medium" title={p.name}>
                              {p.name}
                            </span>
                            {(p.roles ?? []).map((r) => (
                              <Badge key={r} variant="secondary" className="text-[10px]">
                                {r}
                              </Badge>
                            ))}
                          </div>
                          {p.description && (
                            <p className="line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">
                              {p.description}
                            </p>
                          )}
                        </div>
                        <ChevronDown
                          className={cn(
                            "size-4 shrink-0 text-muted-foreground transition-transform",
                            isOpen && "rotate-180"
                          )}
                        />
                      </button>
                      <button
                        type="button"
                        title={t("common.edit")}
                        onClick={() => openEdit(p)}
                        className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        title={t("common.delete")}
                        onClick={() => handleRemove(p)}
                        className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>

                    <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                      {p.birthday && <MetaItem label={t("contacts.birthday")} value={p.birthday} lunar={parseBirthday(p.birthday)?.lunar} />}
                      {p.address && <MetaItem label={t("contacts.address")} value={p.address} />}
                    </div>

                    {isOpen && (
                      <div className="mt-3 flex flex-col gap-1.5 border-t pt-3">
                        {(p.contact ?? []).length === 0 ? (
                          <p className="text-xs text-muted-foreground">{t("contacts.noMethods")}</p>
                        ) : (
                          (p.contact ?? []).map((c, i) => {
                            const tk = TYPE_LABEL[c.type ?? ""]
                            const label = tk ? t(tk) : (c.type ?? "")
                            return (
                              <div
                                key={`${c.type}-${i}`}
                                className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5"
                              >
                                <Badge variant="secondary" className="w-12 shrink-0 justify-center text-[10px]">
                                  {label || t("contacts.methodFallback")}
                                </Badge>
                                <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                                  {c.value}
                                </span>
                                <button
                                  type="button"
                                  title={t("common.copy")}
                                  onClick={() => copyValue(c.value ?? "", label || t("contacts.methodFallback"))}
                                  className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                >
                                  <Copy className="size-3.5" />
                                </button>
                              </div>
                            )
                          })
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </ScrollArea>
      )}

      <ContactFormDialog
        open={formOpen}
        initial={editingId ? (people.find((p) => p.id === editingId) ?? null) : null}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
      />
    </div>
  )
}

interface ContactDraft {
  name: string
  description: string
  birthdayType: "none" | "solar" | "lunar"
  birthYear: string
  birthMonth: string
  birthDay: string
  address: string
  rolesText: string
  /** 空串 = 未填，保存时按值过滤 */
  contacts: { type: string; value: string }[]
}

function draftFromPerson(p: Person | null): ContactDraft {
  if (!p) {
    return {
      name: "",
      description: "",
      birthdayType: "none",
      birthYear: "",
      birthMonth: "",
      birthDay: "",
      address: "",
      rolesText: "",
      contacts: [],
    }
  }
  const b = parseBirthday(p.birthday)
  return {
    name: p.name,
    description: p.description ?? "",
    birthdayType: b ? (b.lunar ? "lunar" : "solar") : "none",
    birthYear: b ? String(b.year) : "",
    birthMonth: b ? String(b.month) : "",
    birthDay: b ? String(b.day) : "",
    address: p.address ?? "",
    rolesText: (p.roles ?? []).join("、"),
    contacts: (p.contact ?? []).map((c) => ({ type: c.type ?? "", value: c.value ?? "" })),
  }
}

function ContactFormDialog({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean
  /** null = 新建 */
  initial: Person | null
  onClose: () => void
  onSave: (fields: Omit<Person, "id">) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<ContactDraft>(() => draftFromPerson(null))

  useEffect(() => {
    if (open) setDraft(draftFromPerson(initial))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const patch = (p: Partial<ContactDraft>) => setDraft((d) => ({ ...d, ...p }))

  function save() {
    const name = draft.name.trim()
    if (!name) {
      toast.error(t("contacts.errName"))
      return
    }
    let birthday: string | undefined
    if (draft.birthdayType !== "none") {
      const y = Number(draft.birthYear)
      const m = Number(draft.birthMonth)
      const d = Number(draft.birthDay)
      const maxDay = draft.birthdayType === "lunar" ? 30 : 31
      if (
        !Number.isInteger(y) ||
        y < 1900 ||
        y > 2100 ||
        !Number.isInteger(m) ||
        m < 1 ||
        m > 12 ||
        !Number.isInteger(d) ||
        d < 1 ||
        d > maxDay
      ) {
        toast.error(t("contacts.errBirthday", { maxDay }))
        return
      }
      const pad = (n: number) => String(n).padStart(2, "0")
      birthday = `${draft.birthdayType === "lunar" ? "L" : ""}${y}-${pad(m)}-${pad(d)}`
    }
    const roles = draft.rolesText
      .split(/[、,，]/)
      .map((s) => s.trim())
      .filter(Boolean)
    const contacts = draft.contacts
      .map((c) => ({ type: c.type.trim(), value: c.value.trim() }))
      .filter((c) => c.value)
    // updateContact 是浅合并：必须显式写全可选字段（空值置 undefined），
    // 否则清空简介/地址/生日等操作会被旧值覆盖回去
    const fields: Omit<Person, "id"> = {
      name,
      description: draft.description.trim() || undefined,
      birthday: birthday ?? undefined,
      address: draft.address.trim() || undefined,
      roles: roles.length ? roles : undefined,
      contact: contacts.length ? contacts : undefined,
    }
    onSave(fields)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) return
        // 直接关闭（X/遮罩/Esc）时自动保存：姓名非空才保存，否则直接关
        if (draft.name.trim()) {
          save()
        } else {
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? t("contacts.editTitle") : t("contacts.newTitle")}</DialogTitle>
          <DialogDescription>
            {t("contacts.formDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-name">{t("contacts.formName")}</Label>
            <Input
              id="c-name"
              value={draft.name}
              placeholder={t("contacts.required")}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-desc">{t("contacts.desc")}</Label>
            <Input
              id="c-desc"
              value={draft.description}
              placeholder={t("contacts.descPlaceholder")}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </div>
          {/* 生日格式与 yml 一致：公历 YYYY-MM-DD / 农历 LYYYY-MM-DD */}
          <div className="flex flex-col gap-1.5">
            <Label>{t("contacts.birthday")}</Label>
            <div className="flex items-center gap-2">
              <select
                value={draft.birthdayType}
                onChange={(e) => patch({ birthdayType: e.target.value as ContactDraft["birthdayType"] })}
                className="h-9 rounded-md border bg-transparent px-2 text-sm outline-none"
              >
                <option value="none">{t("contacts.bdayNone")}</option>
                <option value="solar">{t("contacts.bdaySolar")}</option>
                <option value="lunar">{t("contacts.bdayLunar")}</option>
              </select>
              {draft.birthdayType !== "none" && (
                <>
                  <Input
                    type="number"
                    value={draft.birthYear}
                    placeholder={t("contacts.year")}
                    className="w-24"
                    onChange={(e) => patch({ birthYear: e.target.value })}
                  />
                  <Input
                    type="number"
                    value={draft.birthMonth}
                    placeholder={t("contacts.month")}
                    className="w-20"
                    onChange={(e) => patch({ birthMonth: e.target.value })}
                  />
                  <Input
                    type="number"
                    value={draft.birthDay}
                    placeholder={t("contacts.day")}
                    className="w-20"
                    onChange={(e) => patch({ birthDay: e.target.value })}
                  />
                </>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-addr">{t("contacts.address")}</Label>
            <Input
              id="c-addr"
              value={draft.address}
              placeholder={t("contacts.optional")}
              onChange={(e) => patch({ address: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-roles">{t("contacts.roles")}</Label>
            <Input
              id="c-roles"
              value={draft.rolesText}
              placeholder={t("contacts.rolesPlaceholder")}
              onChange={(e) => patch({ rolesText: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label>{t("contacts.methods")}</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => patch({ contacts: [...draft.contacts, { type: "phone", value: "" }] })}
              >
                <Plus className="size-3.5" />
                {t("contacts.addMethod")}
              </Button>
            </div>
            {draft.contacts.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("contacts.noMethods")}</p>
            ) : (
              draft.contacts.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={TYPE_OPTIONS.includes(c.type as (typeof TYPE_OPTIONS)[number]) ? c.type : "custom"}
                    onChange={(e) => {
                      const t = e.target.value
                      patch({
                        contacts: draft.contacts.map((x, j) =>
                          j === i ? { ...x, type: t === "custom" ? (x.type || "") : t } : x
                        ),
                      })
                    }}
                    className="h-9 rounded-md border bg-transparent px-2 text-sm outline-none"
                  >
                    {TYPE_OPTIONS.map((tp) => (
                      <option key={tp} value={tp}>
                        {t(TYPE_LABEL[tp])}
                      </option>
                    ))}
                    <option value="custom">{t("contacts.typeCustom")}</option>
                  </select>
                  {!(TYPE_OPTIONS as readonly string[]).includes(c.type) && (
                    <Input
                      value={c.type}
                      placeholder={t("contacts.typePlaceholder")}
                      className="w-24"
                      onChange={(e) =>
                        patch({
                          contacts: draft.contacts.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)),
                        })
                      }
                    />
                  )}
                  <Input
                    value={c.value}
                    placeholder={t("contacts.valuePlaceholder")}
                    className="flex-1"
                    onChange={(e) =>
                      patch({
                        contacts: draft.contacts.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                      })
                    }
                  />
                  <button
                    type="button"
                    title={t("contacts.removeMethod")}
                    onClick={() => patch({ contacts: draft.contacts.filter((_, j) => j !== i) })}
                    className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button onClick={save}>{t("common.save")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function UserAvatar() {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      <ContactIcon className="size-4" />
    </span>
  )
}

function MetaItem({ label, value, lunar }: { label: string; value: string; lunar?: boolean }) {
  const { t } = useTranslation()
  // 去 L 前缀，农历语义由徽标承担
  const shown = lunar && value.startsWith("L") ? value.slice(1) : value
  return (
    <span className="flex items-center gap-1">
      <span className="shrink-0 text-muted-foreground/60">{label}：</span>
      {lunar && (
        <Badge variant="secondary" className="shrink-0 px-1 text-[9px]">
          {t("contacts.bdayLunar")}
        </Badge>
      )}
      <span className="truncate">{shown}</span>
    </span>
  )
}
