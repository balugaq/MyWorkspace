// 富文本 16 色文本标签（TODO 32）：调色板取自 Minecraft 格式化代码 §0–§f
// （名称与色值对齐 zh.minecraft.wiki「格式化代码」页的颜色代码表）。
//
// 形态：行内标签 <色名>文字</色名>，如 <blue>蓝色的字</blue>。
// 渲染层（TipTap FormatColor mark / MarkdownView）把它解析为带内联色值的 span，
// 正文存储与 AI 输出里始终是纯文本标签——不落任何原始 HTML，XSS 防线不变。

export interface FormatColorEntry {
  /** 标签名（即 <tag>…</tag> 的 tag） */
  tag: string
  /** 十六进制色值 */
  hex: string
  /** 中文名（技能文档 / 提示词用） */
  label: string
}

/** Minecraft 16 色（§0–§f） */
export const FORMAT_COLORS: FormatColorEntry[] = [
  { tag: "black", hex: "#000000", label: "黑色" },
  { tag: "dark_blue", hex: "#0000AA", label: "深蓝" },
  { tag: "dark_green", hex: "#00AA00", label: "深绿" },
  { tag: "dark_aqua", hex: "#00AAAA", label: "深青" },
  { tag: "dark_red", hex: "#AA0000", label: "暗红" },
  { tag: "dark_purple", hex: "#AA00AA", label: "深紫" },
  { tag: "gold", hex: "#FFAA00", label: "金色" },
  { tag: "gray", hex: "#AAAAAA", label: "灰色" },
  { tag: "dark_gray", hex: "#555555", label: "深灰" },
  { tag: "blue", hex: "#5555FF", label: "蓝色" },
  { tag: "green", hex: "#55FF55", label: "绿色" },
  { tag: "aqua", hex: "#55FFFF", label: "天蓝" },
  { tag: "red", hex: "#FF5555", label: "红色" },
  { tag: "light_purple", hex: "#FF55FF", label: "粉紫" },
  { tag: "yellow", hex: "#FFFF55", label: "黄色" },
  { tag: "white", hex: "#FFFFFF", label: "白色" },
]

/** tag → hex 快查表 */
export const FORMAT_COLOR_MAP: Readonly<Record<string, string>> = Object.fromEntries(
  FORMAT_COLORS.map((c) => [c.tag, c.hex]),
)

const FORMAT_COLOR_TAG_SRC = `<(/)?(${FORMAT_COLORS.map((c) => c.tag).join("|")})>`

/** 锚定整串的单标签匹配（开或闭），供逐 token / 逐位置匹配 */
export const FORMAT_COLOR_TAG_AT = new RegExp(`^${FORMAT_COLOR_TAG_SRC}$`)

/** 全局匹配任意色标签（开或闭），供整段扫描；注意 lastIndex，重用前需重置 */
export const FORMAT_COLOR_TAG_RE = new RegExp(FORMAT_COLOR_TAG_SRC, "g")

/** 剥离文本中的色标签（列表预览 / 纯文本摘要等场景用） */
export function stripFormatColorTags(text: string): string {
  return text.replace(FORMAT_COLOR_TAG_RE, "")
}
