"use client"

import { useEffect, useState } from "react"
import { ImagePlus, Trash2, RefreshCw } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import {
  getImageURL,
  deleteImage,
  setStaged,
  type StoredImage,
} from "@/lib/image-store"
import { getImageInventory } from "@/lib/backup"
import { useWorkspace } from "@/lib/store"
import { useEscapeClose } from "@/hooks/use-escape-close"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

/**
 * 图片缓存 / 暂存区管理。
 * - 展示被引用与暂存（无引用）的图片。
 * - 「扫描」把无引用的图片标记为暂存。
 * - 暂存区图片可被用户手动删除（不会删除仍被引用的图片）。
 */
export function ImageCacheDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { t } = useTranslation()
  const [all, setAll] = useState<StoredImage[]>([])
  const [referenced, setReferenced] = useState<Set<string>>(new Set())
  const [tiles, setTiles] = useState<Record<string, string>>({})

  // ESC 关闭弹窗（与其它弹窗行为一致）
  useEscapeClose(open, () => onOpenChange(false))

  async function refresh() {
    const { all, referenced } = await getImageInventory()
    setAll(all)
    setReferenced(referenced)
    // 生成缩略图 objectURL（仅显示）
    const map: Record<string, string> = {}
    for (const img of all) {
      const url = await getImageURL(img.id)
      if (url) map[img.id] = url
    }
    setTiles(map)
  }

  useEffect(() => {
    if (open) refresh()
  }, [open])

  async function runScan() {
    const s = useWorkspace.getState()
    const { collectReferencedImageIds } = await import("@/lib/image-refs")
    const refs = collectReferencedImageIds(s.categories, Object.values(s.relationFamilies), s.calendar)
    let stagedCount = 0
    for (const img of all) {
      if (!refs.has(img.id) && !img.staged) {
        await setStaged(img.id, true)
        stagedCount++
      }
    }
    await refresh()
    toast.success(stagedCount ? t("imgCache.stagedToast", { n: stagedCount }) : t("imgCache.nothingToStage"))
  }

  async function remove(id: string) {
    await deleteImage(id)
    await refresh()
    toast.success(t("imgCache.deleted"))
  }

  const staged = all.filter((i) => i.staged)
  const used = all.filter((i) => !i.staged && referenced.has(i.id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("imgCache.title")}</DialogTitle>
          <DialogDescription>
            {t("imgCache.desc")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {t("imgCache.stats", { all: all.length, used: used.length, staged: staged.length })}
          </span>
          <Button size="sm" variant="outline" onClick={runScan}>
            <RefreshCw className="size-3.5" />
            {t("imgCache.scan")}
          </Button>
        </div>

        <ScrollArea className="h-64">
          {all.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t("imgCache.empty")}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {all.map((img) => {
                const inUse = referenced.has(img.id)
                const tile = tiles[img.id]
                return (
                  <div
                    key={img.id}
                    className="flex flex-col gap-1.5 overflow-hidden rounded-lg border bg-card p-2"
                  >
                    <div className="flex h-20 items-center justify-center overflow-hidden bg-muted">
                      {tile ? (
                        // eslint-disable-next-line @next/next/no-img-element -- IndexedDB 缩略图
                        <img src={tile} alt="" className="max-h-full max-w-full object-contain" />
                      ) : (
                        <ImagePlus className="size-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={
                          inUse
                            ? "rounded bg-primary/10 px-1 text-[10px] text-primary"
                            : "rounded bg-warning/15 px-1 text-[10px] text-foreground"
                        }
                      >
                        {inUse ? t("imgCache.inUse") : img.staged ? t("imgCache.staged") : t("imgCache.unreferenced")}
                      </span>
                      {!inUse && (
                        <button
                          type="button"
                          onClick={() => remove(img.id)}
                          className="text-muted-foreground transition-colors hover:text-destructive"
                          title={t("imgCache.deleteTitle")}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
