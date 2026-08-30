// 读取 public/skills 下的 .md 技能文件，解析为可供 AI 调用的「技能说明书」。
//
// 静态导出站点无法在运行时列目录，因此用一个 manifest.json 登记文件名清单；
// 前端先取清单，再并发读取各 .md 正文。每个 .md 即一个 skill：
//   - 文件名（去扩展名、转 slug）作为 tool 名
//   - 首个 "# 标题" 作为展示名
//   - 标题之后的首段非空文本作为给 AI 选择用的描述
//   - 全文作为「说明书正文」，AI 调用该 skill 时由前端回传，AI 据此处理用户输入。

export interface Skill {
  /** tool 名（slug） */
  name: string
  /** 展示名（来自 # 标题） */
  displayName: string
  /** 给 AI 选择用的描述（首段） */
  description: string
  /** 说明书全文 */
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
