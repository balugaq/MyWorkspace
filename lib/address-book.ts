"use client"

import { loadPublicYaml } from "./fetch-data"

/**
 * 通讯录数据（只读）。
 *
 * public/address_book.yml 的 schema：
 *   people:
 *     - name
 *       description
 *       birthday: "YYYY-MM-DD" 公历，或 "L1995-06-15" 农历（L 前缀）
 *       address
 *       roles: []
 *       contact: [{ type: phone|qq|email|wechat, value }]
 *
 * 纯只读展示；不写回文件。
 */

export interface ContactItem {
  type?: string
  value?: string
}

export interface Person {
  name: string
  description?: string
  /** 公历 "YYYY-MM-DD" 或农历 "L...-MM-DD" */
  birthday?: string
  address?: string
  roles?: string[]
  contact?: ContactItem[]
}

export interface AddressBookFile {
  people?: Person[]
}

let cache: AddressBookFile | null = null

/** 读取通讯录（带模块级缓存）。失败返回空数组（已由 fetch-data 统一 toast）。 */
export async function loadAddressBook(): Promise<Person[]> {
  if (cache) return cache.people ?? []
  const data = await loadPublicYaml<AddressBookFile>("address_book.yml")
  // 注意：示例文件可能是全注释的（people: 为空数组），属正常
  cache = data ?? { people: [] }
  return cache.people ?? []
}

/** 解析 birthday 字段，返回 { lunar, month, day }；非法返回 null。年份仅作展示，不参与匹配。 */
export function parseBirthday(
  birthday?: string
): { lunar: boolean; month: number; day: number } | null {
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
    const month = Number(m[2])
    const day = Number(m[3])
    if (month >= 1 && month <= 12 && day >= 1 && day <= (lunar ? 30 : 31)) {
      return { lunar, month, day }
    }
  }
  return null
}
