// 读取 public/skills 下的 .md 技能文件，解析为「技能说明书」：文件名转 slug 作 tool 名，
// 首个 "# 标题" 作展示名，标题后的首段作给 AI 选择用的描述，全文作说明书正文（调用时回传给 AI）。
// 静态导出无法运行时列目录，因此用 manifest.json 登记文件名清单，前端先取清单再并发读取各 .md。

export interface Skill {
  name: string
  displayName: string
  description: string
  body: string
}

function slugify(filename: string): string {
  return filename
    .replace(/\.md$/i, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
}

function parseMarkdown(filename: string, raw: string): Skill {
  const name = slugify(filename)
  const lines = raw.replace(/\r\n/g, "\n").split(/\n+/)
  const headingIdx = lines.findIndex((l) => l.startsWith("# "))
  const displayName = (
    headingIdx >= 0 ? lines[headingIdx].replace(/^#\s*/, "").trim() : ""
  ) || name
  const rest = headingIdx >= 0 ? lines.slice(headingIdx + 1) : lines
  const descLine = rest.find((l) => l.trim().length > 0 && !l.startsWith("#"))
  const description = descLine?.trim() ?? displayName
  return { name, displayName, description, body: raw.trim() }
}

/** 读取全部技能。任何网络/解析失败都安全降级为 []，不影响聊天。 */
export async function loadSkills(): Promise<Skill[]> {
  try {
    const manifestRes = await fetch("/skills/manifest.json", { cache: "no-store" })
    if (!manifestRes.ok) return []
    const manifest = (await manifestRes.json()) as { skills?: string[] }
    const files = manifest.skills ?? []
    const results = await Promise.all(
      files.map(async (f): Promise<Skill | null> => {
        try {
          const res = await fetch(`/skills/${f}`, { cache: "no-store" })
          if (!res.ok) return null
          const raw = await res.text()
          return parseMarkdown(f, raw)
        } catch {
          return null
        }
      }),
    )
    return results.filter((x): x is Skill => x !== null)
  } catch {
    return []
  }
}
