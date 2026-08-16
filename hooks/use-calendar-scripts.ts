"use client"

import { useEffect, useRef } from "react"
import { useWorkspace } from "@/lib/store"
import { loadCalendarScript, unloadCalendarScript } from "@/lib/calendar-events"

/**
 * 把 store 中的「启用」日历脚本同步载入事件总线；停用/删除/修改时自动重载。
 * 在应用根组件（page.tsx）挂载一次即可。
 */
export function useCalendarScripts() {
  const scripts = useWorkspace((s) => s.calendarScripts)
  const loadedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const loaded = loadedRef.current
    // 停用或被删除的：卸载
    for (const id of loaded) {
      const cur = scripts.find((x) => x.id === id)
      if (!cur || !cur.enabled) {
        unloadCalendarScript(id)
        loaded.delete(id)
      }
    }
    // 启用需要（重新）载入
    for (const s of scripts) {
      if (!s.enabled) continue
      // 每次脚本对象引用变化（编辑/启停）都重载
      loadCalendarScript(s.id, s.code)
      loaded.add(s.id)
    }
  }, [scripts])
}
