"use client"

// AI 品牌元素（TODO 57）：
// - AiIcon：原子样式图标（主人指定的 SVG：三椭圆环绕），签名兼容 lucide（接收 className、currentColor 描边）；
// - AiText：渐变彩色「AI」字，用于各处按钮文本里替换普通 "AI" 字样（bg-clip-text 渐变裁剪）。

import { cn } from "@/lib/utils"

export function AiIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse
        cx="24"
        cy="24"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        rx="7.5"
        ry="20.5"
      />
      <ellipse
        cx="24"
        cy="24"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        rx="7.5"
        ry="20.5"
        transform="rotate(-60 24 24)"
      />
      <ellipse
        cx="24"
        cy="24"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        rx="20.5"
        ry="7.5"
        transform="rotate(-30 24 24)"
      />
    </svg>
  )
}

export function AiText({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "bg-gradient-to-r from-violet-500 via-fuchsia-500 to-sky-400 bg-clip-text font-semibold text-transparent",
        className,
      )}
    >
      AI
    </span>
  )
}
