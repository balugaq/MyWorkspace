import type { Category, CalendarData } from "./types"

/** 从一段文本中提取所有 `{{img:<id>}}` 引用 id */
export function imageIdsInText(text?: string): Set<string> {
  const set = new Set<string>()
  if (!text) return set
  const re = /\{\{img:([^}]+)\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const id = m[1].trim()
    if (id) set.add(id)
  }
  return set
}

/** 汇总全库（分类章节 + 思维图节点 + 日历笔记）中被引用的图片 id */
export function collectReferencedImageIds(
  categories: Category[],
  calendar: CalendarData,
): Set<string> {
  const refs = new Set<string>()
  const addText = (t?: string) => {
    for (const id of imageIdsInText(t)) refs.add(id)
  }
  for (const cat of categories) {
    if (cat.chapters) for (const ch of cat.chapters) addText(ch.content)
    if (cat.relation) for (const n of cat.relation.nodes) addText(n.content)
  }
  for (const d of Object.values(calendar)) {
    addText(d.note)
  }
  return refs
}
