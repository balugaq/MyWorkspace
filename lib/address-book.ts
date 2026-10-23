"use client"

import { loadPublicYaml } from "./fetch-data"
import type { Person } from "./types"

/**
 * 通讯录数据（TODO 48）：主源 = store 的 contacts（localStorage）；public/address_book.yml
 * 供「设置 → 从 yml 导入」整表替换。yml schema 与 store 的 Person 一致（无 id 字段，导入时分配），
 * birthday 支持 "YYYY-MM-DD" 公历 / "L1995-06-15" 农历（L 前缀）。
 */

// 自 TODO 48 迁入 lib/types.ts；re-export 保持既有 import 路径（联系人页 / 日历 / AI 技能等无需改动）。
export type { Person, ContactItem } from "./types"

export interface AddressBookFile {
  /** yml 原始结构：条目无 id（导入时由导入逻辑分配） */
  people?: Omit<Person, "id">[]
}

let cache: AddressBookFile | null = null

/** 读取通讯录 yml（带模块级缓存；TODO 48 起仅「设置 → 从 yml 导入」使用）。失败返回 null（fetch-data 已发全局错误事件）。 */
export async function loadAddressBook(): Promise<AddressBookFile | null> {
  if (cache) return cache
  const data = await loadPublicYaml<AddressBookFile>("address_book.yml")
  // 注意：示例文件可能是全注释的（people: 为空数组），属正常
  cache = data ?? { people: [] }
  return cache
}

/** yml 导入辅助（TODO 48）：给无 id 条目分配 id、过滤无 name 条目；每次导入重新分配——yml 无 id，外部无旧 id 引用。 */
export function withIds(people: Omit<Person, "id">[]): Person[] {
  return people
    .filter((p) => typeof p.name === "string" && p.name.trim().length > 0)
    .map((p) => ({
      ...p,
      name: p.name.trim(),
      id: Math.random().toString(36).slice(2, 10),
    }))
}

/** 解析 birthday 字段，返回 { lunar, year, month, day }；非法返回 null。year 供编辑表单回填。 */
export function parseBirthday(
  birthday?: string
): { lunar: boolean; year: number; month: number; day: number } | null {
  if (!birthday) return null
  const s = birthday.trim()
  if (!s) return null
  let lunar = false
  let core = s
  if (s.startsWith("L")) {
    lunar = true
    core = s.slice(1)
  }
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(core)
  if (m) {
    const year = Number(m[1])
    const month = Number(m[2])
    const day = Number(m[3])
    if (month >= 1 && month <= 12 && day >= 1 && day <= (lunar ? 30 : 31)) {
      return { lunar, year, month, day }
    }
  }
  return null
}
