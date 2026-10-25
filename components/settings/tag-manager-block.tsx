"use client"

// TODO 67：全站标签统一管理（随笔章节 / 思维图节点 / 联系人角色 / 标签库）；重命名撞名自动合并，删除全站清理

import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Tag as TagIcon, Plus, Pencil, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useWorkspace } from "@/lib/store"
import { collectAllTagsWithKnown, collectTagUsage } from "@/lib/tags"
import { matchTextPinyin } from "@/lib/pinyin"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

export function TagManagerBlock() {
  const { t } = useTranslation()
  const categories = useWorkspace((s) => s.categories)
  const relationFamilies = useWorkspace((s) => s.relationFamilies)
  const knownTags = useWorkspace((s) => s.knownTags)
  const contacts = useWorkspace((s) => s.contacts)
  const renameTag = useWorkspace((s) => s.renameTag)
  const deleteTag = useWorkspace((s) => s.deleteTag)
  const addKnownTags = useWorkspace((s) => s.addKnownTags)

  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState(false)
  const [createName, setCreateName] = useState("")
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState("")
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const familyList = useMemo(() => Object.values(relationFamilies), [relationFamilies])
  const usage = useMemo(
    () => collectTagUsage(categories, familyList, contacts),
    [categories, familyList, contacts],
  )
  const allTags = useMemo(
    () => collectAllTagsWithKnown(categories, familyList, knownTags),
    [categories, familyList, knownTags],
  )
  const visible = useMemo(() => {
    const q = query.trim()
    if (!q) return allTags
    return allTags.filter((t) => matchTextPinyin(t, q))
  }, [allTags, query])

  const commitCreate = () => {
    const name = createName.trim()
    setCreating(false)
    setCreateName("")
    if (!name) return
    if (allTags.some((t) => t === name)) {
      toast.error(t("settings.tagExists", { name }))
      return
    }
    addKnownTags([name])
    toast.success(t("settings.tagCreated", { name }))
  }

  const commitRename = () => {
    const from = renaming
    setRenaming(null)
    setRenameDraft("")
    if (!from) return
    const to = renameDraft.trim()
    if (!to || to === from) return
    const merged = allTags.some((t) => t === to)
    const changed = renameTag(from, to)
    if (merged) {
      toast.success(t("settings.tagMerged", { to, n: changed }))
    } else {
      toast.success(changed > 0 ? t("settings.tagRenamedWith", { to, n: changed }) : t("settings.tagRenamed", { to }))
    }
  }

  const doDelete = () => {
    const name = confirmDel
    setConfirmDel(null)
    if (!name) return
    const removed = deleteTag(name)
    toast.success(removed > 0 ? t("settings.tagDeletedWith", { name, n: removed }) : t("settings.tagDeleted", { name }))
  }

  const delCount = confirmDel ? (usage.get(confirmDel) ?? 0) : 0

  return (
    <section className="flex flex-col gap-2">
      <Label className="text-xs font-medium text-muted-foreground">{t("settings.tagManage")}</Label>
      <div className="flex items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("settings.tagSearchPlaceholder")}
          className="h-8 flex-1"
        />
        {creating ? (
          <Input
            autoFocus
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onBlur={commitCreate}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                commitCreate()
              } else if (e.key === "Escape") {
                e.preventDefault()
                setCreating(false)
                setCreateName("")
              }
            }}
            placeholder={t("settings.newTagPlaceholder")}
            className="h-8 w-36"
          />
        ) : (
          <Button
            variant="outline"
            className="h-8 shrink-0 gap-1.5"
            onClick={() => {
              setCreating(true)
              setCreateName("")
            }}
          >
            <Plus className="size-3.5" />
            {t("settings.createTag")}
          </Button>
        )}
      </div>

      {visible.length > 0 ? (
        <ul className="native-scroll flex max-h-64 flex-col gap-1 overflow-auto pr-1">
          {visible.map((tg) => (
            <li
              key={tg}
              className="group flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-xs"
            >
              {renaming === tg ? (
                <input
                  autoFocus
                  ref={renameInputRef}
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      commitRename()
                    } else if (e.key === "Escape") {
                      e.preventDefault()
                      setRenaming(null)
                      setRenameDraft("")
                    }
                  }}
                  maxLength={30}
                  className="h-6 min-w-0 flex-1 rounded border bg-background px-1.5 outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              ) : (
                <>
                  <TagIcon className="size-3 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-foreground" title={tg}>
                    {tg}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {(usage.get(tg) ?? 0) > 0 ? t("settings.tagUsage", { n: usage.get(tg) ?? 0 }) : t("settings.tagOnlyLib")}
                  </span>
                  <button
                    type="button"
                    title={t("common.rename")}
                    aria-label={t("settings.renameTagAria", { name: tg })}
                    onClick={() => {
                      setRenaming(tg)
                      setRenameDraft(tg)
                    }}
                    className="hidden size-5 shrink-0 items-center justify-center rounded hover:bg-primary/10 group-hover:flex"
                  >
                    <Pencil className="size-3 text-muted-foreground" />
                  </button>
                  <button
                    type="button"
                    title={t("common.delete")}
                    aria-label={t("settings.deleteTagAria", { name: tg })}
                    onClick={() => setConfirmDel(tg)}
                    className="hidden size-5 shrink-0 items-center justify-center rounded hover:bg-destructive/10 group-hover:flex"
                  >
                    <Trash2 className="size-3 text-destructive" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          {allTags.length === 0 ? t("settings.noTags") : t("settings.noTagMatch")}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {t("settings.tagDesc")}
      </p>

      <AlertDialog
        open={confirmDel !== null}
        onOpenChange={(v) => !v && setConfirmDel(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.deleteTagTitle", { name: confirmDel ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {delCount > 0
                ? t("settings.deleteTagDescUsed", { n: delCount })
                : t("settings.deleteTagDescUnused")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDel(null)}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}