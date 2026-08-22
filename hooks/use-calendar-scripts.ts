"use client"

// import { useEffect, useRef } from "react"
// import { useWorkspace } from "@/lib/store"
// import { loadCalendarScript, unloadCalendarScript } from "@/lib/calendar-events"

/**
 * 把 store 中的「启用」日历脚本同步载入事件总线（已弃用 / 注释停用）。
 *
 * 原实现：在应用根组件（page.tsx）挂载一次，随 store.calendarScripts 变化
 * 自动载入/卸载/重载脚本订阅。现因日历标记脚本整体停用而注释。
 * 保留空壳导出以兼容 page.tsx 调用点（调用本身也已注释）。
 */
export function useCalendarScripts() {
  // const scripts = useWorkspace((s) => s.calendarScripts)
  // const loadedRef = useRef<Set<string>>(new Set())
  //
  // useEffect(() => {
  //   const loaded = loadedRef.current
  //   // 停用或被删除的：卸载
  //   for (const id of loaded) {
  //     const cur = scripts.find((x) => x.id === id)
  //     if (!cur || !cur.enabled) {
  //       unloadCalendarScript(id)
  //       loaded.delete(id)
  //     }
  //   }
  //   // 启用需要（重新）载入
  //   for (const s of scripts) {
  //     if (!s.enabled) continue
  //     // 每次脚本对象引用变化（编辑/启停）都重载
  //     loadCalendarScript(s.id, s.code)
  //     loaded.add(s.id)
  //   }
  // }, [scripts])
}
