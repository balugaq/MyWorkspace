"use client"

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>开源许可证</DialogTitle>
          <DialogDescription>本项目所使用开源软件及其许可证。</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] min-h-0 flex-1 overflow-hidden pr-2">
          <div className="flex flex-col">
            {THIRD_PARTY_LICENSES.map((item) => (
              <div key={item.name} className="border-t border-dashed py-3 first:border-t-0">
                <p className="font-medium">--------</p>
                <p className="font-medium">{item.name}</p>
                <p className="text-sm">作者: {item.author}</p>
                <p className="text-sm">描述: {item.description}</p>
                <p className="text-sm">
                  许可证:{" "}
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
