"use client"

// 设置分区共享件（TODO 85 第二刀）：Section 包装器 + 头像上传（账户 / AI 两处共用）

import { useRef } from "react"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"
import { useWorkspace } from "@/lib/store"

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="border-b pb-2 text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  )
}

// 用户头像压缩：限制最长边 256px，转 JPEG 控制体积（避免撑爆 localStorage）
const MAX_AVATAR = 256
function compressAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error("图片读取失败"))
      img.onload = () => {
        const scale = Math.min(1, MAX_AVATAR / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement("canvas")
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext("2d")
        if (!ctx) return reject(new Error("无法创建画布"))
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL("image/jpeg", 0.85))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

// 头像选择（用户 / AI 两处共用）：压缩后写 settings；返回 Promise，
// 调用处包 void 以满足 no-misused-promises（TODO 84）
export function useAvatarUpload() {
  const { t } = useTranslation()
  const updateSettings = useWorkspace((s) => s.updateSettings)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>, target: "user" | "ai") {
    const f = e.target.files?.[0]
    e.target.value = ""
    if (!f) return
    try {
      const dataUrl = await compressAvatar(f)
      updateSettings(target === "user" ? { aiUserAvatar: dataUrl } : { aiAssistantAvatar: dataUrl })
    } catch {
      toast.error(t("settings.avatarFail"))
    }
  }

  return { inputRef, handleAvatarFile }
}
