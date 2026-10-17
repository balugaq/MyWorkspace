"use client"

import { useTranslation } from "react-i18next"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { THIRD_PARTY_LICENSES } from "@/lib/licenses"

export function LicenseDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("licenses.title")}</DialogTitle>
          <DialogDescription>{t("licenses.desc")}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] min-h-0 flex-1 overflow-hidden pr-2">
          <div className="flex flex-col">
            {THIRD_PARTY_LICENSES.map((item) => (
              <div key={item.name} className="border-t border-dashed py-3 first:border-t-0">
                <p className="font-medium">--------</p>
                <p className="font-medium">{item.name}</p>
                <p className="text-sm">{t("licenses.author")}: {item.author}</p>
                <p className="text-sm">{t("licenses.descLabel")}: {item.description}</p>
                <p className="text-sm">
                  {t("licenses.license")}:{" "}
                  <a
                    href={item.licenseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline underline-offset-2"
                  >
                    {item.license}
                  </a>
                </p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
