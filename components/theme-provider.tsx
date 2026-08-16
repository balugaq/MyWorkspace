"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes"
import { useWorkspace } from "@/lib/store"

function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      <ThemeHotkey />
      <ThemeFromStore />
      <FontSizeSetter />
      {children}
    </NextThemesProvider>
  )
}

// 将全局基础字号（settings.fontSize）应用到 html 根元素
function FontSizeSetter() {
  const fontSize = useWorkspace((s) => s.settings.fontSize)
  const hydrated = useWorkspace((s) => s.hydrated)

  React.useEffect(() => {
    if (!hydrated) return
    document.documentElement.style.fontSize = `${Math.min(24, Math.max(12, fontSize))}px`
  }, [fontSize, hydrated])

  return null
}

// 将 store.settings.theme 作为主题的唯一来源，同步到 next-themes
function ThemeFromStore() {
  const theme = useWorkspace((s) => s.settings.theme)
  const hydrated = useWorkspace((s) => s.hydrated)
  const { setTheme } = useTheme()

  React.useEffect(() => {
    if (hydrated) setTheme(theme)
  }, [theme, hydrated, setTheme])

  return null
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

function ThemeHotkey() {
  const { resolvedTheme, setTheme } = useTheme()

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (event.key.toLowerCase() !== "d") {
        return
      }

      if (isTypingTarget(event.target)) {
        return
      }

      setTheme(resolvedTheme === "dark" ? "light" : "dark")
    }

    window.addEventListener("keydown", onKeyDown)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [resolvedTheme, setTheme])

  return null
}

export { ThemeProvider }
