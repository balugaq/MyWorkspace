import type { Metadata } from "next"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { VaultProvider } from "@/components/vault/vault-provider"
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
      {/* 严格 CSP：禁用任意行内脚本（抵御 XSS 拖库），仅放行同源外部脚本与框架自带的
          必需行内脚本（按 SHA-256 精确白名单，在 build 时由 scripts/inject-csp.mjs 注入真实策略）。
          此处为占位符，开发模式（npm run dev）下忽略，不影响本地调试。 */}
      <meta httpEquiv="Content-Security-Policy" content="__CSP_INJECTED_AT_BUILD__" />
      {/* suppressHydrationWarning：屏蔽浏览器翻译/划词扩展向 <body> 注入 ai-translate-* 等属性导致的
          服务端/客户端不匹配告警（此类扩展会修改服务端 HTML，与本应用逻辑无关）。 */}
      <body suppressHydrationWarning>
        <ThemeProvider>
          <VaultProvider>{children}</VaultProvider>
        </ThemeProvider>
        <Toaster position="top-center" />
      </body>
    </html>
  )
}
