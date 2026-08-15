import type { Category, CalendarData, SearchResult, SearchScope } from "./types"

function makeSnippet(text: string, query: string, len = 60): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text.slice(0, len)
  const start = Math.max(0, idx - 20)
  return (start > 0 ? "…" : "") + text.slice(start, start + len)
}

export function runSearch(
  categories: Category[],
  calendar: CalendarData,
  rawQuery: string,
  scope: SearchScope,
  activeCategoryId: string | null,
): SearchResult[] {
  const query = rawQuery.trim()
  if (!query) return []
  const q = query.toLowerCase()
  const results: SearchResult[] = []
  const match = (t?: string) => !!t && t.toLowerCase().includes(q)

  const scanCategory = (cat: Category) => {
    // 章节 / 通用条目
    if (cat.chapters) {
      for (const ch of cat.chapters) {
        const hay = [ch.title, ch.content, ...ch.tags].join(" ")
        if (match(hay)) {
          results.push({
            id: `ch-${ch.id}`,
            type: "chapter",
            typeLabel: cat.template === "novel" ? "篇目" : "笔记",
            title: ch.title || "未命名",
            snippet: makeSnippet(ch.content || ch.title, query),
            source: cat.name,
            categoryId: cat.id,
            targetId: ch.id,
          })
        }
      }
    }
    // 思维导图节点与解决方案
    if (cat.relation) {
      for (const n of cat.relation.nodes) {
        const hay = [n.title, n.content, n.cause, n.leadTo, n.result].join(" ")
        if (match(hay)) {
          results.push({
            id: `node-${n.id}`,
            type: "node",
            typeLabel: "Todo",
            title: n.title,
            snippet: makeSnippet(
              [n.content, n.cause && `原因:${n.cause}`, n.leadTo && `导向:${n.leadTo}`, n.result && `结果:${n.result}`]
                .filter(Boolean)
                .join(" · "),
              query,
            ),
            source: cat.name,
            categoryId: cat.id,
            targetId: n.id,
          })
        }
        if (n.solution && match(n.solution.content)) {
          results.push({
            id: `sol-${n.id}`,
            type: "solution",
            typeLabel: "解决方案",
            title: `${n.title} 的解决方案`,
            snippet: makeSnippet(n.solution.content, query),
            source: cat.name,
            categoryId: cat.id,
            targetId: n.id,
          })
        }
      }
    }
  }

  // 分类范围
  if (scope === "all" || scope === "category" || scope === "todo" || scope === "mindmap") {
    for (const cat of categories) {
      if (scope === "category" && cat.id !== activeCategoryId) continue
      if (scope === "todo" && !cat.relation) continue
      if (scope === "mindmap" && cat.template !== "relation") continue
      scanCategory(cat)
    }
  }

  // 日历
  if (scope === "all" || scope === "calendar") {
    for (const [date, day] of Object.entries(calendar)) {
      if (match(day.note)) {
        results.push({
          id: `note-${date}`,
          type: "note",
          typeLabel: "笔记",
          title: date,
          snippet: makeSnippet(day.note, query),
          source: "日历",
          categoryId: null,
          targetId: date,
          date,
        })
      }
      for (const todo of day.todos) {
        if (match(todo.content)) {
          results.push({
            id: `ctodo-${todo.id}`,
            type: "calendar-todo",
            typeLabel: "日历Todo",
            title: todo.content,
            snippet: `${date}${todo.done ? " · 已完成" : ""}`,
            source: "日历",
            categoryId: null,
            targetId: date,
            date,
          })
        }
      }
    }
  }

  return results
}
