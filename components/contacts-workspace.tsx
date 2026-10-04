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
 * 联系人工作区（TODO 48：持久化驱动，可增删改）。
 *
 * 数据源 = store 的 contacts（localStorage 持久化）；public/address_book.yml
 * 降级为「设置 → 从 yml 导入」的手动导入源，导入整表覆盖。
 * 展示：列表形式（参考思维导图列表样式），支持全文搜索（范围含
 * name / description / birthday / address / roles / contact）。
 * 每个联系人为可点击的 dropdown，展开后显示 contact，每个 contact 项可一键复制 value。
 * 工具栏「新建」与卡片上的「编辑 / 删除」直接写 store。
 */

const TYPE_LABEL: Record<string, string> = {
  phone: "电话",
  qq: "QQ",
  email: "邮箱",
  wechat: "微信",
}

const TYPE_OPTIONS = ["phone", "qq", "email", "wechat"] as const

export function ContactsWorkspace() {
  const people = useWorkspace((s) => s.contacts)
  const addContact = useWorkspace((s) => s.addContact)
  const updateContact = useWorkspace((s) => s.updateContact)
  const removeContact = useWorkspace((s) => s.removeContact)
  const addKnownTags = useWorkspace((s) => s.addKnownTags)
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // 编辑弹窗：editingId = null 表示新建（保存时先 addContact 拿 id 再写入草稿字段）
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // 联系人 roles 汇入全局标签库（导入 / 界面编辑后都会跟随更新；已存在则忽略，幂等）
  useEffect(() => {
    const roles = Array.from(new Set(people.flatMap((p) => p.roles ?? [])))
    if (roles.length > 0) addKnownTags(roles)
  }, [people, addKnownTags])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return people
    const match = (s?: string) => !!s && s.toLowerCase().includes(q)
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
      toast.success(`已复制 ${label}`)
    } catch {
      toast.error("复制失败，请手动复制")
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
      toast.success("已保存修改")
    } else {
      const id = addContact()
      updateContact(id, fields)
      toast.success("已新建联系人")
    }
  }

  function handleRemove(p: Person) {
    removeContact(p.id)
    toast.success(`已删除「${p.name}」`)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <h1 className="font-serif text-lg font-semibold">联系人</h1>
        <div className="flex-1" />
        {/* 搜索 */}
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-1.5">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索姓名 / 简介 / 生日 / 地址 / 角色 / 联系方式…"
            className="w-64 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
        </div>
        {/* 新建（TODO 48） */}
        <Button size="sm" className="gap-1.5" onClick={openCreate}>
          <Plus className="size-4" />
          新建联系人
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
          <Users className="size-8" />
          <p className="text-sm">
            {people.length === 0
              ? "暂无联系人：点右上角「新建联系人」，或在设置 → 从 yml 导入。"
              : "没有匹配「" + query + "」的联系人"}
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
                    {/* 头部：点击展开/收起 */}
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
                      {/* 编辑 / 删除（TODO 48） */}
                      <button
                        type="button"
                        title="编辑"
                        onClick={() => openEdit(p)}
                        className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        title="删除"
                        onClick={() => handleRemove(p)}
                        className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>

                    {/* 概览信息（展开时显示更全；生日/地址始终可读） */}
                    <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                      {p.birthday && <MetaItem label="生日" value={p.birthday} lunar={parseBirthday(p.birthday)?.lunar} />}
                      {p.address && <MetaItem label="地址" value={p.address} />}
                    </div>

                    {/* contact 展开区 */}
                    {isOpen && (
                      <div className="mt-3 flex flex-col gap-1.5 border-t pt-3">
                        {(p.contact ?? []).length === 0 ? (
                          <p className="text-xs text-muted-foreground">暂无联系方式</p>
                        ) : (
                          (p.contact ?? []).map((c, i) => {
                            const label = TYPE_LABEL[c.type ?? ""] ?? c.type
                            return (
                              <div
                                key={`${c.type}-${i}`}
                                className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5"
                              >
                                <Badge variant="secondary" className="w-12 shrink-0 justify-center text-[10px]">
                                  {label || "联系"}
                                </Badge>
                                <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                                  {c.value}
                                </span>
                                <button
                                  type="button"
                                  title="复制"
                                  onClick={() => copyValue(c.value ?? "", label ?? "联系方式")}
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

      {/* 新建 / 编辑表单（TODO 48） */}
      <ContactFormDialog
        open={formOpen}
        initial={editingId ? (people.find((p) => p.id === editingId) ?? null) : null}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
      />
    </div>
  )
}

// ---- 编辑表单弹窗（TODO 48） ----

interface ContactDraft {
  name: string
  description: string
  birthdayType: "none" | "solar" | "lunar"
  birthYear: string
  birthMonth: string
  birthDay: string
  address: string
  rolesText: string
  /** 表单内非可选（空串表示未填），保存时再按值过滤 */
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
  const [draft, setDraft] = useState<ContactDraft>(() => draftFromPerson(null))

  // 打开时按 initial 重置草稿（新建 = 空模板）
  useEffect(() => {
    if (open) setDraft(draftFromPerson(initial))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const patch = (p: Partial<ContactDraft>) => setDraft((d) => ({ ...d, ...p }))

  function save() {
    const name = draft.name.trim()
    if (!name) {
      toast.error("姓名不能为空")
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
        toast.error(`生日日期不合法（年 1900-2100，月 1-12，日 1-${maxDay}）`)
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
    // 显式写全所有可选字段（空值置 undefined）：updateContact 是浅合并，
    // 若用条件展开省略字段，清空简介/地址/生日等操作会被旧值覆盖回去（保存无效的根因）
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
        // 直接关闭（X / 点遮罩 / Esc）时自动保存：姓名非空走保存（校验失败会 toast 并保持打开）；空姓名直接关闭
        if (draft.name.trim()) {
          save()
        } else {
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "编辑联系人" : "新建联系人"}</DialogTitle>
          <DialogDescription>
            数据保存在本地（store 持久化）；如需批量维护，可在 public/address_book.yml 编辑后到设置页导入（整表覆盖）。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-name">姓名 *</Label>
            <Input
              id="c-name"
              value={draft.name}
              placeholder="必填"
              onChange={(e) => patch({ name: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-desc">简介</Label>
            <Input
              id="c-desc"
              value={draft.description}
              placeholder="一句话介绍（可空）"
              onChange={(e) => patch({ description: e.target.value })}
            />
          </div>
          {/* 生日：类型切换 + 年月日（与 yml 格式一致：公历 YYYY-MM-DD / 农历 LYYYY-MM-DD） */}
          <div className="flex flex-col gap-1.5">
            <Label>生日</Label>
            <div className="flex items-center gap-2">
              <select
                value={draft.birthdayType}
                onChange={(e) => patch({ birthdayType: e.target.value as ContactDraft["birthdayType"] })}
                className="h-9 rounded-md border bg-transparent px-2 text-sm outline-none"
              >
                <option value="none">无</option>
                <option value="solar">公历</option>
                <option value="lunar">农历</option>
              </select>
              {draft.birthdayType !== "none" && (
                <>
                  <Input
                    type="number"
                    value={draft.birthYear}
                    placeholder="年"
                    className="w-24"
                    onChange={(e) => patch({ birthYear: e.target.value })}
                  />
                  <Input
                    type="number"
                    value={draft.birthMonth}
                    placeholder="月"
                    className="w-20"
                    onChange={(e) => patch({ birthMonth: e.target.value })}
                  />
                  <Input
                    type="number"
                    value={draft.birthDay}
                    placeholder="日"
                    className="w-20"
                    onChange={(e) => patch({ birthDay: e.target.value })}
                  />
                </>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-addr">地址</Label>
            <Input
              id="c-addr"
              value={draft.address}
              placeholder="可空"
              onChange={(e) => patch({ address: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-roles">角色标签</Label>
            <Input
              id="c-roles"
              value={draft.rolesText}
              placeholder="用顿号/逗号分隔，如：同事、球友"
              onChange={(e) => patch({ rolesText: e.target.value })}
            />
          </div>
          {/* 联系方式：动态行 */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label>联系方式</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => patch({ contacts: [...draft.contacts, { type: "phone", value: "" }] })}
              >
                <Plus className="size-3.5" />
                添加一项
              </Button>
            </div>
            {draft.contacts.length === 0 ? (
              <p className="text-xs text-muted-foreground">暂无联系方式</p>
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
                    {TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABEL[t]}
                      </option>
                    ))}
                    <option value="custom">自定义</option>
                  </select>
                  {!(TYPE_OPTIONS as readonly string[]).includes(c.type) && (
                    <Input
                      value={c.type}
                      placeholder="类型"
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
                    placeholder="内容"
                    className="flex-1"
                    onChange={(e) =>
                      patch({
                        contacts: draft.contacts.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                      })
                    }
                  />
                  <button
                    type="button"
                    title="移除此项"
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
              取消
            </Button>
            <Button onClick={save}>保存</Button>
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
  // 农历生日：去掉 L 前缀（由「农历」徽标承担语义），避免与 `L` 重复
  const shown = lunar && value.startsWith("L") ? value.slice(1) : value
  return (
    <span className="flex items-center gap-1">
      <span className="shrink-0 text-muted-foreground/60">{label}：</span>
      {lunar && (
        <Badge variant="secondary" className="shrink-0 px-1 text-[9px]">
          农历
        </Badge>
      )}
      <span className="truncate">{shown}</span>
    </span>
  )
}
