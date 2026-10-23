"use client"

import { Lunar } from "lunar-javascript"

/**
 * 「日期外显短提示」适配层（日历日期格内、日期数字下的小字）：当前显示农历日名（如「初五」）。
 * 未来扩展点：可按节日 / 打卡状态等在此追加分支；若需返回富内容（JSX），改为导出 React 组件（届时同步调用处与类型）。
 */
export function dayShortHint(date: Date): string {
  try {
    return Lunar.fromDate(date).getDayInChinese()
  } catch {
    return ""
  }
}
