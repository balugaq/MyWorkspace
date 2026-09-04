// 思维导图节点风格配色工具：ARGB（#AARRGGBB）存储 + 渲染转换 + 预设调色板 + 随机和谐色。
// 不引入第三方色盘库——取色器 UI（预设 + 原生 color input + 透明度滑块 + 随机）自绘即可，
// 避免新增依赖与 THIRD_PARTY_LICENSES 登记负担。

/**
 * 预设调色板：选取明度/饱和度均衡、在浅色与深色主题下都可读的颜色。
 * 每项均为不透明 ARGB（alpha=FF），UI 内可再用透明度滑块调低。
 */
export const NODE_PALETTE: string[] = [
  "#FFFF5C8A", // 粉红
  "#FFFFA94D", // 橙
  "#FFFFD43B", // 黄
  "#FF69DB7C", // 绿
  "#FF38D9A9", // 青绿
  "#FF4DABF7", // 蓝
  "#FF748FFC", // 靛
  "#FFB197FC", // 紫
  "#FFF783AC", // 品红
  "#FF9775FA", // 浅紫
  "#FF63E6BE", // 薄荷
  "#FF868E96", // 灰
]

/** 把 ARGB 字符串解析为 UI 用的 { rgb: #RRGGBB, alpha: 0–100 }；无效/为空返回默认。 */
export function parseArgb(v?: string): { rgb: string; alpha: number } {
  if (!v) return { rgb: "#3385FF", alpha: 100 }
  const hex = v.replace("#", "").toUpperCase()
  if (hex.length === 8) {
    const a = parseInt(hex.slice(0, 2), 16)
    return { rgb: `#${hex.slice(2)}`, alpha: Math.round((a / 255) * 100) }
  }
  if (hex.length === 6) return { rgb: `#${hex}`, alpha: 100 }
  return { rgb: "#3385FF", alpha: 100 }
}

/** 由 UI 的 { rgb, alpha } 合成 ARGB 存储串（始终 8 位 #AARRGGBB）。
 *  rgb 既接受 6 位 #RRGGBB，也接受 8 位 #AARRGGBB（前置 alpha 字节会被剥掉，改用入参 alpha）。 */
export function toArgb(rgb: string, alpha: number): string {
  let hex = rgb.replace("#", "").toUpperCase()
  if (hex.length === 8) hex = hex.slice(2) // 剥掉 ARGB 前置 alpha 字节，保留 RRGGBB
  const a = Math.round((Math.max(0, Math.min(100, alpha)) / 100) * 255)
    .toString(16)
    .toUpperCase()
    .padStart(2, "0")
  return `#${a}${hex}`
}

/**
 * 渲染用：把 ARGB 存储串转为 CSS 颜色。
 * - 8 位 → rgba(r,g,b,a)
 * - 6 位 → #RRGGBB
 * - 空/非法 → undefined（调用方回落主题默认）
 */
export function argbToCss(v?: string): string | undefined {
  if (!v) return undefined
  const hex = v.replace("#", "").toUpperCase()
  if (hex.length === 8) {
    const a = parseInt(hex.slice(0, 2), 16) / 255
    const r = parseInt(hex.slice(2, 4), 16)
    const g = parseInt(hex.slice(4, 6), 16)
    const b = parseInt(hex.slice(6, 8), 16)
    return `rgba(${r}, ${g}, ${b}, ${a})`
  }
  if (hex.length === 6) return `#${hex}`
  return undefined
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0,
    g = 0,
    b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ]
}

/**
 * 生成一条「合适」的随机和谐色：随机色相 + 受限饱和度/明度，避免过暗/过灰/过艳。
 * 返回不透明 ARGB（alpha=FF）。
 */
export function randomHarmoniousColor(): string {
  const h = Math.floor(Math.random() * 360)
  const s = 0.55 + Math.random() * 0.2 // 0.55–0.75
  const l = 0.55 + Math.random() * 0.1 // 0.55–0.65
  const [r, g, b] = hslToRgb(h, s, l)
  const rgb = `#${r.toString(16).padStart(2, "0")}${g
    .toString(16)
    .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toUpperCase()
  return toArgb(rgb, 100)
}
