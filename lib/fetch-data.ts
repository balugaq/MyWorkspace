"use client"

import { parse as parseYaml } from "yaml"

/**
 * 加载 public/ 下的数据文件（YAML）。纯客户端 fetch，装入后解析为 JSON。
 *
 * 项目为纯前端静态导出（output: "export"），public/ 下的文件会原样随构建拷贝到 out/，
 * 运行时用同源 fetch 读取。数据只读，不回写磁盘。
 *
 * 失败策略：返回 null，并通过全局事件让应用层弹 toast 提示（文件名可见），调用方可静默跳过。
 */

const CACHE = new Map<string, unknown>()

let shownErrors = new Set<string>()

/** 通知应用层某文件加载失败（供 page/根组件监听并 toast） */
function notifyLoadError(file: string) {
  if (shownErrors.has(file)) return
  shownErrors.add(file)
  // 避免在非浏览器环境（SSR/hydration 前）调用
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent("dsh:data-load-error", { detail: { file } })
  )
}

/**
 * fetch 并解析一个 public YAML 文件，带缓存。失败返回 null（并触发 toast 提示）。
 * 仅在浏览器环境运行；SSR 阶段返回 null。
 */
export async function loadPublicYaml<T>(file: string): Promise<T | null> {
  if (typeof window === "undefined") return null
  if (CACHE.has(file)) return CACHE.get(file) as T
  try {
    const res = await fetch(`/${file}`, { cache: "no-cache" })
    if (!res.ok) {
      notifyLoadError(file)
      return null
    }
    const text = await res.text()
    const data = parseYaml(text) as T
    CACHE.set(file, data)
    return data
  } catch {
    notifyLoadError(file)
    return null
  }
}

/** 手动刷新缓存（一般在文件更新后调用；当前无写回，仅预留） */
export function clearDataCache() {
  CACHE.clear()
  shownErrors = new Set()
}
