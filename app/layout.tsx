import type { Metadata } from "next"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "我的全能工作台",
  description: "集思维导图式 Todo 管理、分类笔记与日历日程于一体的个人工作台",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className={cn("antialiased bg-background font-sans")}>
      {/* suppressHydrationWarning：屏蔽浏览器翻译/划词扩展向 <body> 注入 ai-translate-* 等属性导致的
          服务端/客户端不匹配告警（此类扩展会修改服务端 HTML，与本应用逻辑无关）。 */}
      <body suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
        <Toaster position="top-center" />
      </body>
    </html>
  )
}
