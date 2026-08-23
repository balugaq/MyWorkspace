"use client"

import { Lunar } from "lunar-javascript"

/**
 * 「日期外显短提示」适配层 —— 日历日期格内、日期数字下方的那行小字。
 *
 * 当前用途：显示该公历日期的农历日名（如「初五」「二十」）。
 *
 * ⚠️ 未来扩展点：此位置可能根据其他因素渲染不同文字（节日、纪念日、打卡状态等），
 * 不局限于农历。扩展方式：在本函数内按需增加分支，返回对应字符串即可；
 * 若需返回富内容（JSX），把此文件改为导出 React 组件亦可（届时同步更新调用处与类型）。
 */
export function dayShortHint(date: Date): string {
  // 目前仅返回农历日名。未来业务在此追加分支。
  try {
    return Lunar.fromDate(date).getDayInChinese()
  } catch {
    return ""
  }
}
