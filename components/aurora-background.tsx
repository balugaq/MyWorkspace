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
/** 星星数量 */
const STAR_COUNT = 200
/** 波浪横向采样步长（px），越小越平滑 */
const WAVE_STEP = 5
/** 生命星点数量（白色亮点，带生命周期：每 CYCLE_MS 熄灭 EXPIRE_PER_CYCLE 个再新生同数） */
const LIFE_STAR_COUNT = 50
/** 生命周期周期（ms）：每到周期随机熄灭 5 个 + 新生 5 个 */
const LIFE_CYCLE_MS = 10_000
/** 每周期熄灭/新生的数量 */
const EXPIRE_PER_CYCLE = 5
/** 生命星点淡入/淡出速率（每帧 alpha 变化量） */
const LIFE_FADE_STEP = 0.012
/** 生命星点基础半径（比常驻星略亮略大，区分层次） */
const LIFE_STAR_RADIUS = 1.8

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
  /** 星点 rgb 串（暗色 = 白星，浅色 = 深色暗点） */
  star: string
  /** 星点整体不透明度缩放（浅色下压暗到可读范围） */
  starAlphaScale: number
  /** 星点闪烁下限（原版 0.1，浅色下更低以避免噪点） */
  starAlphaMin: number
  /** 生命星点 rgb（暗色 = 白色亮点，浅色 = 深色暗点） */
  lifeStar: string
  /** 生命星点目标 alpha 上限 */
  lifeStarAlpha: number
  /** 四层波浪：背景暗紫 → 中间深蓝 → 前景青绿 → 细节亮青 */
  waves: WaveLayer[]
}

/** 暗色主题调色板：原版 refs/polar-light.txt 的参数原样移植 */
const DARK_PALETTE: Palette = {
  bg: { r: 0, g: 0, b: 0 },
  star: "255, 255, 255",
  starAlphaScale: 1,
  starAlphaMin: 0.1,
  lifeStar: "255, 255, 255",
  lifeStarAlpha: 0.95,
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
  star: "70, 90, 100",
  starAlphaScale: 0.3,
  starAlphaMin: 0.05,
  lifeStar: "60, 80, 95",
  lifeStarAlpha: 0.5,
  waves: [
    { r: 150, g: 130, b: 190, baseY: 0.65, amp: 1.5, freq: 0.002, phase: 0, alpha: 0.18 },
    { r: 110, g: 170, b: 225, baseY: 0.6, amp: 1.2, freq: 0.003, phase: Math.PI / 2, alpha: 0.22 },
    { r: 120, g: 200, b: 175, baseY: 0.55, amp: 1, freq: 0.004, phase: Math.PI, alpha: 0.26 },
    { r: 130, g: 210, b: 200, baseY: 0.52, amp: 0.8, freq: 0.005, phase: Math.PI * 1.5, alpha: 0.15 },
  ],
}

interface Star {
  x: number
  y: number
  radius: number
  alpha: number
  twinkleSpeed: number
}

/** 生命星点：淡入到目标亮度 → 存活 → 淡出（熄灭）→ 到期重生新位置再淡入 */
interface LifeStar {
  x: number
  y: number
  radius: number
  alpha: number
  targetAlpha: number
}

export function AuroraBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // 彩色主题（green/purple/orange）是浅色基调固定配色（globals.css，不响应 .dark），
  // 因此除 resolvedTheme === "dark" 外一律走浅色淡化调色板
  const resolvedTheme = useTheme().resolvedTheme

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const palette = resolvedTheme === "dark" ? DARK_PALETTE : LIGHT_PALETTE

    let width = 0
    let height = 0
    let time = 0
    let raf = 0
    let stars: Star[] = []
    let lifeStars: LifeStar[] = []
    let lastCycle = performance.now()

    const initStars = () => {
      const next: Star[] = []
      for (let i = 0; i < STAR_COUNT; i++) {
        next.push({
          x: Math.random() * width,
          y: Math.random() * height,
          radius: Math.random() * 1.5,
          alpha: Math.random(),
          twinkleSpeed: Math.random() * 0.02 + 0.005,
        })
      }
      stars = next
    }

    const makeLifeStar = (): LifeStar => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: LIFE_STAR_RADIUS * (0.6 + Math.random() * 0.8),
      alpha: 0,
      targetAlpha: (0.3 + Math.random() * 0.7) * palette.lifeStarAlpha,
    })

    const initLifeStars = () => {
      lifeStars = Array.from({ length: LIFE_STAR_COUNT }, () => makeLifeStar())
    }

    /** 每周期：随机熄灭 EXPIRE_PER_CYCLE 个（targetAlpha→0），到期重生后随机新生同数（新位置淡入） */
    const expireAndRespawn = () => {
      const alive = lifeStars.filter((s) => s.targetAlpha > 0)
      const picks = new Set<number>()
      while (picks.size < Math.min(EXPIRE_PER_CYCLE, alive.length)) {
        picks.add(Math.floor(Math.random() * alive.length))
      }
      for (const idx of picks) alive[idx].targetAlpha = 0
      // 已在熄灭途中（targetAlpha=0）的星即视为「待重生」——新生的 5 个由它们淡出后重置位置承担
    }

    const resize = () => {
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
      initStars()
      initLifeStars()
      lastCycle = performance.now()
    }

    const drawStars = () => {
      for (const star of stars) {
        star.alpha += star.twinkleSpeed
        if (star.alpha > 1 || star.alpha < palette.starAlphaMin) {
          star.twinkleSpeed = -star.twinkleSpeed
        }
        ctx.beginPath()
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${palette.star}, ${Math.abs(star.alpha) * palette.starAlphaScale})`
        ctx.fill()
      }
    }

    const stepAndDrawLifeStars = (now: number) => {
      // 周期触发：每 LIFE_CYCLE_MS 熄灭 5 个 + 随机新生 5 个
      if (now - lastCycle >= LIFE_CYCLE_MS) {
        lastCycle = now
        expireAndRespawn()
      }
      for (const star of lifeStars) {
        // alpha 向 targetAlpha 渐近（淡入/淡出）
        if (star.alpha < star.targetAlpha) {
          star.alpha = Math.min(star.targetAlpha, star.alpha + LIFE_FADE_STEP)
        } else if (star.alpha > star.targetAlpha) {
          star.alpha = Math.max(star.targetAlpha, star.alpha - LIFE_FADE_STEP)
        }
        // 已完全熄灭的星：随机新位置 + 新目标亮度（淡入 = 「随机生成」）
        if (star.targetAlpha === 0 && star.alpha === 0) {
          star.x = Math.random() * width
          star.y = Math.random() * height
          star.radius = LIFE_STAR_RADIUS * (0.6 + Math.random() * 0.8)
          star.targetAlpha = (0.3 + Math.random() * 0.7) * palette.lifeStarAlpha
        }
        ctx.beginPath()
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${palette.lifeStar}, ${star.alpha})`
        ctx.fill()
      }
    }

    const drawWave = (layer: WaveLayer) => {
      const baseY = height * layer.baseY
      const amplitude = WAVE_AMPLITUDE * layer.amp
      ctx.beginPath()
      ctx.moveTo(0, height) // 起点：左下角
      for (let x = 0; x <= width; x += WAVE_STEP) {
        const y = baseY + Math.sin(x * layer.freq + time + layer.phase) * amplitude
        ctx.lineTo(x, y)
      }
      ctx.lineTo(width, height) // 终点：右下角
      ctx.closePath()
      // 线性渐变：从波峰色渐隐到透明底色
      const gradient = ctx.createLinearGradient(0, baseY - amplitude, 0, height)
      gradient.addColorStop(0, `rgba(${layer.r}, ${layer.g}, ${layer.b}, ${layer.alpha})`)
      gradient.addColorStop(1, `rgba(${palette.bg.r}, ${palette.bg.g}, ${palette.bg.b}, 0)`)
      ctx.fillStyle = gradient
      ctx.fill()
    }

    const animate = () => {
      // 背景清空为底色
      ctx.fillStyle = `rgb(${palette.bg.r}, ${palette.bg.g}, ${palette.bg.b})`
      ctx.fillRect(0, 0, width, height)

      drawStars()
      stepAndDrawLifeStars(performance.now())

      // 时间流动，驱动波浪游动
      time += WAVE_SPEED

      for (const layer of palette.waves) {
        drawWave(layer)
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
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 block h-full w-full"
    />
  )
}
