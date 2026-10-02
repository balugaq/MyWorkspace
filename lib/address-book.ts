"use client"

import { loadPublicYaml } from "./fetch-data"
import type { Person } from "./types"

/**
 * 通讯录数据（TODO 48：持久化驱动）。
 *
 * 数据主源 = store 的 contacts（localStorage 持久化，界面可增删改）；
 * public/address_book.yml 降级为「设置 → 从 yml 导入」的来源：用户手改 yml 后
 * 在设置里点导入，整表替换 store 数据。
 *
 * yml schema（与 store 的 Person 一致，但无 id 字段——导入时自动分配）：
 *   people:
 *     - name
 *       description
 *       birthday: "YYYY-MM-DD" 公历，或 "L1995-06-15" 农历（L 前缀）
 *       address
 *       roles: []
 *       contact: [{ type: phone|qq|email|wechat, value }]
 */

// Person / ContactItem 自 TODO 48 起迁入 lib/types.ts（store 持久化类型，Person 含 id）；
// 此处 re-export 保持既有 import 路径（联系人页 / 日历 / AI 技能等消费点无需改动）。
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

/**
 * yml 导入辅助（TODO 48）：给无 id 的 yml 条目分配稳定 id，过滤无效条目（无 name）。
 * 每次导入都重新分配 id——yml 本身没有 id，外部也不存在对旧 id 的引用。
 */
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
  // 形如 1995-06-15
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
