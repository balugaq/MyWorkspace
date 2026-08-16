import { parse as parseYaml } from "yaml"
import { XMLParser } from "fast-xml-parser"

/**
 * 日历标记脚本的事件总线与运行时。
 *
 * 架构：日历在渲染完每天单元格后，对每个单元格 emit 一个 `RenderDateEvent`；
 * 用户编写的「标记脚本」通过 `renderDate(handler)` 订阅该事件，对单个日期块做标记。
 * 事件体携带 `CalendarDisplayType`（month | week | day），脚本可据此区分视图做差异化标记。
 */

/** 日历显示类型 */
export type CalendarDisplayType = "month" | "week" | "day"

/** 脚本可用的解析库门面 */
export interface CalendarLibs {
  json: typeof JSON
  yaml: (text: string) => unknown
  xml: (text: string) => unknown
}

/** 单个日期块的操作 API（由日历注入） */
export interface DateMarkerApi {
  /** 在日期块上追加一个标记节点，返回该元素 */
  addMarker(kind?: string, text?: string): HTMLElement
  /** 在日期块上追加多个标记 */
  addBulk(kinds: string[]): void
  /** 设置/追加一行文本到日期块 */
  addText(text: string): void
}

/** RenderDateEvent 载荷 */
export interface RenderDateEvent {
  displayType: CalendarDisplayType
  /** yyyy-MM-dd */
  date: string
  /** 该日期块对应的 DOM 元素 */
  element: HTMLElement
  /** 标记操作 API */
  api: DateMarkerApi
}

type RenderHandler = (ev: RenderDateEvent) => void

/** 解析库门面（供 useLib / lib 注入） */
export const calendarLibs: CalendarLibs = {
  json: JSON,
  yaml: (text) => parseYaml(text),
  xml: (text) => new XMLParser({ ignoreAttributes: false }).parse(text),
}

// ---- 事件总线 ----
const renderHandlers: Set<RenderHandler> = new Set()

export function onRenderDate(handler: RenderHandler): () => void {
  renderHandlers.add(handler)
  return () => renderHandlers.delete(handler)
}

export function emitRenderDate(ev: RenderDateEvent): void {
  for (const h of renderHandlers) {
    try {
      h(ev)
    } catch (err) {
      console.error("[calendar-scripts] RenderDate handler error:", err)
    }
  }
}

/** 供脚本使用的全局渲染订阅入口 */
export function scriptRenderDate(handler: RenderHandler): void {
  onRenderDate(handler)
}

/**
 * 运行一段「标记脚本」：把代码体包进一个受限函数，向其注入：
 *   renderDate(handler)  订阅日期块渲染事件（返回取消订阅函数）
 *   useLib(name) / lib   获取 JSON / YAML / XML 解析库
 * 脚本抛错会在控制台提示，不影响其它脚本；返回所有已订阅 handler 的取消函数。
 */
export function runCalendarScript(code: string): Array<() => void> {
  const unsubs: Array<() => void> = []
  const renderDate = (h: RenderHandler) => {
    unsubs.push(onRenderDate(h))
  }
  const useLib = (name: keyof CalendarLibs) => calendarLibs[name]
  // 信任的本地脚本：直接使用 Function 构造，注入可用能力
  const factory = new Function(
    "renderDate",
    "useLib",
    "lib",
    "console",
    `"use strict";\n${code}`,
  )
  factory(renderDate, useLib, calendarLibs, console)
  return unsubs
}

// 以脚本 id 为单位的订阅容器，便于重载/停用时清理旧订阅
const scriptSubs = new Map<string, Array<() => void>>()

function clearScriptSubs(id: string): void {
  const subs = scriptSubs.get(id)
  if (subs) {
    for (const unsub of subs) unsub()
    scriptSubs.delete(id)
  }
}

/** 载入（或重载）某脚本：先清理旧订阅，再运行新代码并记录其订阅 */
export function loadCalendarScript(id: string, code: string): void {
  clearScriptSubs(id)
  try {
    const unsubs = runCalendarScript(code)
    scriptSubs.set(id, unsubs)
  } catch (err) {
    console.error(`[calendar-scripts] 脚本 ${id} 运行失败：`, err)
    scriptSubs.delete(id)
  }
}

/** 卸载某脚本订阅 */
export function unloadCalendarScript(id: string): void {
  clearScriptSubs(id)
}

