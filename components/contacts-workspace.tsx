"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Search,
  Users,
  Copy,
  ChevronDown,
  Contact as ContactIcon,
} from "lucide-react"
import { toast } from "sonner"
import { loadAddressBook, parseBirthday, type Person } from "@/lib/address-book"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/**
 * 联系人工作区（只读）。
 *
 * 数据源：public/address_book.yml（用户自行编辑，不可在界面修改）。
 * 展示：列表形式（参考思维导图列表样式），支持全文搜索（范围含
 * name / description / birthday / address / roles / contact）。
 * 每个联系人为可点击的 dropdown，展开后显示 contact，每个 contact 项可一键复制 value。
 */

const TYPE_LABEL: Record<string, string> = {
  phone: "电话",
  qq: "QQ",
  email: "邮箱",
  wechat: "微信",
}

export function ContactsWorkspace() {
  const [people, setPeople] = useState<Person[]>([])
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    let active = true
    loadAddressBook().then((p) => {
      if (active) setPeople(p)
    })
    return () => {
      active = false
    }
  }, [])

  // 监听 public 数据加载失败 → 顶部 toast（失败可跳过，不阻塞）
  useEffect(() => {
    const onErr = (e: Event) => {
      const detail = (e as CustomEvent<{ file?: string }>).detail
      const file = detail?.file
      toast.error(file ? `${file} 加载失败，已跳过` : "联系人数据加载失败，已跳过")
    }
    window.addEventListener("dsh:data-load-error", onErr)
    return () => window.removeEventListener("dsh:data-load-error", onErr)
  }, [])

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

  const toggle = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
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
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
          <Users className="size-8" />
          <p className="text-sm">
            {people.length === 0 ? "暂无联系人，请在 public/address_book.yml 中编辑。" : "没有匹配「" + query + "」的联系人"}
          </p>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto w-full max-w-3xl px-6 py-6">
            <div className="flex flex-col gap-3">
              {filtered.map((p) => {
                const isOpen = expanded.has(p.name)
                return (
                  <div key={p.name} className="flex w-full flex-col rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50">
                    {/* 头部：点击展开/收起 */}
                    <button
                      type="button"
                      onClick={() => toggle(p.name)}
                      className="flex w-full items-center gap-2"
                    >
                      <UserAvatar />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{p.name}</span>
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
    </div>
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
