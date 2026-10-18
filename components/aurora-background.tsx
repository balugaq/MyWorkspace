"use client"

// TODO 75：全局游动极光背景（绘制逻辑忠实移植 refs/polar-light.txt）。
// app/page.tsx 在最外层挂载一次（settings.auroraBackground 开启时），组件内自管理
// resize 与 requestAnimationFrame，卸载时取消动画帧并移除监听。
// 纯 canvas 原生实现，无第三方依赖。

import { useEffect, useRef } from "react"
import { useTheme } from "next-themes"

// ---- 调参常量（视觉效果由宿主目视后在此迭代）----

/** 波浪游动速度：每帧时间增量 */
const WAVE_SPEED = 0.003
/** 波浪基础振幅（px），各层按倍数缩放 */
const WAVE_AMPLITUDE = 40
/** 波浪横向采样步长（px），越小越平滑 */
const WAVE_STEP = 5
/** 星光点数量（2026-10-18 主人口径：20 个） */
const STAR_COUNT = 20
/** 星光点半径（2026-10-18 主人口径：约 10px；四芒十字星形，#EEEEEE 清晰明亮无模糊） */
const STAR_RADIUS = 10
/** 生命周期周期（ms）：每到周期随机熄灭 5 个 + 新生 5 个 */
const LIFE_CYCLE_MS = 10_000
/** 每周期熄灭/新生的数量 */
const EXPIRE_PER_CYCLE = 5
/** 生命星点淡入/淡出速率（每帧 alpha 变化量） */
const LIFE_FADE_STEP = 0.012

/** 单层波浪：rgb 波峰色；baseY / amp 为相对屏幕高度（振幅相对 WAVE_AMPLITUDE）的系数；
 *  freq 频率；phase 相位偏移；alpha 波峰不透明度 */
interface WaveLayer {
  r: number
  g: number
  b: number
  baseY: number
  amp: number
  freq: number
  phase: number
  alpha: number
}

interface Palette {
  /** 每帧清屏底色 */
  bg: { r: number; g: number; b: number }
  /** 星光点 rgb（暗色 = 白色，浅色 = 深色暗点） */
  star: string
  /** 星光点目标 alpha 上限 */
  starAlpha: number
  /** 生命星点光晕色（rgba 前缀）与模糊半径，用于与常驻星区分 */
  lifeStarHalo: string
  lifeStarHaloBlur: number
  /** 四层波浪：背景暗紫 → 中间深蓝 → 前景青绿 → 细节亮青 */
  waves: WaveLayer[]
}

/** 暗色主题调色板：原版 refs/polar-light.txt 的参数原样移植 */
const DARK_PALETTE: Palette = {
  bg: { r: 0, g: 0, b: 0 },
  star: "195, 195, 195",
  starAlpha: 1,
  lifeStarHalo: "180, 255, 240",
  lifeStarHaloBlur: 12,
  waves: [
    // 背景层：暗紫
    { r: 80, g: 0, b: 150, baseY: 0.65, amp: 1.5, freq: 0.002, phase: 0, alpha: 0.4 },
    // 中间层：深蓝
    { r: 0, g: 150, b: 255, baseY: 0.6, amp: 1.2, freq: 0.003, phase: Math.PI / 2, alpha: 0.5 },
    // 前景层：极光青绿
    { r: 0, g: 255, b: 180, baseY: 0.55, amp: 1, freq: 0.004, phase: Math.PI, alpha: 0.6 },
    // 细节层：极细的亮青色顶部
    { r: 0, g: 255, b: 220, baseY: 0.52, amp: 0.8, freq: 0.005, phase: Math.PI * 1.5, alpha: 0.3 },
  ],
}

/** 浅色主题（light / green / purple / orange 彩色主题均为浅色基调）淡化版：
 *  底色浅青灰，波浪降饱和 + 降透明度，星点改深色暗点且整体压暗，保证浅色 UI 可读 */
const LIGHT_PALETTE: Palette = {
  bg: { r: 238, g: 244, b: 242 },
  star: "60, 80, 95",
  starAlpha: 0.55,
  lifeStarHalo: "40, 120, 110",
  lifeStarHaloBlur: 8,
  waves: [
    { r: 150, g: 130, b: 190, baseY: 0.65, amp: 1.5, freq: 0.002, phase: 0, alpha: 0.18 },
    { r: 110, g: 170, b: 225, baseY: 0.6, amp: 1.2, freq: 0.003, phase: Math.PI / 2, alpha: 0.22 },
    { r: 120, g: 200, b: 175, baseY: 0.55, amp: 1, freq: 0.004, phase: Math.PI, alpha: 0.26 },
    { r: 130, g: 210, b: 200, baseY: 0.52, amp: 0.8, freq: 0.005, phase: Math.PI * 1.5, alpha: 0.15 },
  ],
}

/** 星光点：淡入到目标亮度 → 存活 → 淡出（熄灭）→ 到期重生新位置再淡入。
 *  全屏只有 STAR_COUNT 个（2026-10-18 主人口径：每 10s 随机熄灭 5 个再新生 5 个）。 */
interface Star {
  x: number
  y: number
  radius: number
  alpha: number
  targetAlpha: number
}

export function AuroraBackground() {
  // 双 canvas 分层（主人 2026-10-18 层级口径：星光点在「模糊背景」之上、内容 UI 之下）：
  //   waves canvas（z-0）→ 被上层毛玻璃层模糊成柔和氛围背景；
  //   stars canvas（z-[8]）→ 清晰四芒星，不被毛玻璃模糊，也不遮挡内容。
  const wavesRef = useRef<HTMLCanvasElement>(null)
  const starsRef = useRef<HTMLCanvasElement>(null)
  // 彩色主题（green/purple/orange）是浅色基调固定配色（globals.css，不响应 .dark），
  // 因此除 resolvedTheme === "dark" 外一律走浅色淡化调色板
  const resolvedTheme = useTheme().resolvedTheme

  useEffect(() => {
    const wavesCanvas = wavesRef.current
    const starsCanvas = starsRef.current
    if (!wavesCanvas || !starsCanvas) return
    const wavesCtx = wavesCanvas.getContext("2d")
    const starsCtx = starsCanvas.getContext("2d")
    if (!wavesCtx || !starsCtx) return

    const palette = resolvedTheme === "dark" ? DARK_PALETTE : LIGHT_PALETTE

    let width = 0
    let height = 0
    let time = 0
    let raf = 0
    let stars: Star[] = []
    let lastCycle = performance.now()

    const makeStar = (): Star => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: STAR_RADIUS * (0.8 + Math.random() * 0.8),
      alpha: 0,
      targetAlpha: (0.55 + Math.random() * 0.45) * palette.starAlpha,
    })

    const initStars = () => {
      stars = Array.from({ length: STAR_COUNT }, () => makeStar())
    }

    /** 每周期：随机熄灭 EXPIRE_PER_CYCLE 个（targetAlpha→0 淡出），淡出后随机重生同数（新位置淡入） */
    const expireAndRespawn = () => {
      const alive = stars.filter((s) => s.targetAlpha > 0)
      const picks = new Set<number>()
      while (picks.size < Math.min(EXPIRE_PER_CYCLE, alive.length)) {
        picks.add(Math.floor(Math.random() * alive.length))
      }
      for (const idx of picks) alive[idx].targetAlpha = 0
    }

    const resize = () => {
      // 适配 devicePixelRatio：canvas 物理像素 = CSS 像素 × dpr，绘制坐标系 scale 回 CSS 像素。
      // 否则 Windows 显示缩放（125%/150%）下 1px 级的星点被放大模糊成不可见的淡斑。
      const dpr = window.devicePixelRatio || 1
      width = window.innerWidth
      height = window.innerHeight
      for (const c of [wavesCanvas, starsCanvas]) {
        c.width = Math.floor(width * dpr)
        c.height = Math.floor(height * dpr)
        c.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
      initStars()
      lastCycle = performance.now()
    }

    /** 四芒十字星：垂直/水平两条菱形光线交叉 + 中心亮点（常见的「星星闪光」标识形状） */
    const drawStarShape = (target: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number) => {
      // 光线宽度随半径缩放，保持形状匀称
      const w = r * 0.14
      target.fillStyle = `rgba(${palette.star}, ${alpha})`
      // 垂直菱形
      target.beginPath()
      target.moveTo(x, y - r)
      target.lineTo(x + w, y)
      target.lineTo(x, y + r)
      target.lineTo(x - w, y)
      target.closePath()
      target.fill()
      // 水平菱形
      target.beginPath()
      target.moveTo(x - r, y)
      target.lineTo(x, y - w)
      target.lineTo(x + r, y)
      target.lineTo(x, y + w)
      target.closePath()
      target.fill()
      // 对角短线（45° 方向，长度减半，更接近常见星光标识）
      const d = r * 0.45
      const dw = w * 0.8
      target.beginPath()
      target.moveTo(x - d, y - d)
      target.lineTo(x + dw * 0.5, y - dw * 0.5)
      target.lineTo(x + d, y + d)
      target.lineTo(x - dw * 0.5, y + dw * 0.5)
      target.closePath()
      target.fill()
      target.beginPath()
      target.moveTo(x + d, y - d)
      target.lineTo(x + dw * 0.5, y + dw * 0.5)
      target.lineTo(x - d, y + d)
      target.lineTo(x - dw * 0.5, y - dw * 0.5)
      target.closePath()
      target.fill()
      // 中心亮点
      target.beginPath()
      target.arc(x, y, r * 0.22, 0, Math.PI * 2)
      target.fill()
    }

    const drawWave = (target: CanvasRenderingContext2D, layer: WaveLayer) => {
      const baseY = height * layer.baseY
      const amplitude = WAVE_AMPLITUDE * layer.amp
      target.beginPath()
      target.moveTo(0, height) // 起点：左下角
      for (let x = 0; x <= width; x += WAVE_STEP) {
        const y = baseY + Math.sin(x * layer.freq + time + layer.phase) * amplitude
        target.lineTo(x, y)
      }
      target.lineTo(width, height) // 终点：右下角
      target.closePath()
      // 线性渐变：从波峰色渐隐到透明底色
      const gradient = target.createLinearGradient(0, baseY - amplitude, 0, height)
      gradient.addColorStop(0, `rgba(${layer.r}, ${layer.g}, ${layer.b}, ${layer.alpha})`)
      gradient.addColorStop(1, `rgba(${palette.bg.r}, ${palette.bg.g}, ${palette.bg.b}, 0)`)
      target.fillStyle = gradient
      target.fill()
    }

    const animate = () => {
      // waves canvas：底色 + 波浪（被上层的毛玻璃层模糊成柔和氛围）
      wavesCtx.fillStyle = `rgb(${palette.bg.r}, ${palette.bg.g}, ${palette.bg.b})`
      wavesCtx.fillRect(0, 0, width, height)

      // 时间流动，驱动波浪游动
      time += WAVE_SPEED

      for (const layer of palette.waves) {
        drawWave(wavesCtx, layer)
      }

      // stars canvas：透明清屏后画清晰星光点（在毛玻璃层之上、内容 UI 之下）
      starsCtx.clearRect(0, 0, width, height)
      if (performance.now() - lastCycle >= LIFE_CYCLE_MS) {
        lastCycle = performance.now()
        expireAndRespawn()
      }
      for (const star of stars) {
        if (star.alpha < star.targetAlpha) {
          star.alpha = Math.min(star.targetAlpha, star.alpha + LIFE_FADE_STEP)
        } else if (star.alpha > star.targetAlpha) {
          star.alpha = Math.max(star.targetAlpha, star.alpha - LIFE_FADE_STEP)
        }
        if (star.targetAlpha === 0 && star.alpha === 0) {
          star.x = Math.random() * width
          star.y = Math.random() * height
          star.radius = STAR_RADIUS * (0.8 + Math.random() * 0.4)
          star.targetAlpha = (0.55 + Math.random() * 0.45) * palette.starAlpha
        }
        drawStarShape(starsCtx, star.x, star.y, star.radius, star.alpha)
      }

      raf = requestAnimationFrame(animate)
    }

    window.addEventListener("resize", resize)
    resize()
    raf = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
    }
  }, [resolvedTheme])

  return (
    <>
      {/* 波浪层：z-0，被上层的全屏毛玻璃模糊成柔和氛围背景 */}
      <canvas
        ref={wavesRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 block h-full w-full"
      />
      {/* 星光点层：z-[8]，在毛玻璃之上（清晰锐利）、内容 UI 之下；不拦截指针 */}
      <canvas
        ref={starsRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[8] block h-full w-full"
      />
    </>
  )
}
