"use client"

import { useMemo } from "react"
import { toast } from "sonner"
import { CalendarDays, CalendarCheck, User, Feather } from "lucide-react"
import { useWorkspace } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { WeatherWidget } from "@/components/weather-widget"

// GitHub 风格贡献热力图：53 周 × 7 天。
// 占位：用确定性伪随机（依 index 计算，避免 SSR 水合不一致）填充 5 级强度，
// 后续接真实数据（如笔记/待办完成天数）时替换 level 来源即可。
const WEEKS = 53
const DAYS = 7
const LEVEL_COLORS = [
  "rgba(128,128,128,0.18)", // 0 级：无贡献
  "#0e4429",
  "#006d32",
  "#26a641",
  "#39d353",
]

function buildCells() {
  const cells: number[] = []
  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < DAYS; d++) {
      const seed = (w * 31 + d * 17 + 7) % 100
      const level = seed < 32 ? 0 : seed < 56 ? 1 : seed < 76 ? 2 : seed < 90 ? 3 : 4
      cells.push(level)
    }
  }
  return cells
}

const MONTH_LABELS = ["Jun", "Jul", "", "Aug", "", "", "Sep", "", "", "", "", ""]
const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""]

export function ProfileWorkspace() {
  const settings = useWorkspace((s) => s.settings)

  const cells = useMemo(buildCells, [])

  // 日期 / 星期：实时计算（非占位）
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const weekday = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][now.getDay()]

  // 占位内容（后续接真实数据源时替换）
  const location = "上海, 中国"
  const poem = "海上生明月，天涯共此时。"
  const totalContributions = 342

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto">
      {/* 顶栏：固定左上角 title（350×80） */}
      <header className="flex items-center justify-between px-8 py-6">
        <div className="flex h-20 w-[350px] flex-col justify-center">
          <h1 className="text-2xl font-bold leading-tight text-foreground">全能工作台</h1>
          <span className="text-sm text-muted-foreground">Profile Dashboard</span>
        </div>
        <span className="text-xs text-muted-foreground">Personal Home Screen</span>
      </header>

      {/* 主体双栏 */}
      <div className="grid flex-1 grid-cols-1 gap-6 px-8 pb-4 lg:grid-cols-[auto_1fr]">
        {/* 左栏：头像 + 昵称/地区 + 签到 */}
        <div className="flex flex-col gap-4">
          {/* 用户头像 256×256 圆角 */}
          <div className="size-64 overflow-hidden rounded-2xl border border-border bg-card">
            {settings.aiUserAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.aiUserAvatar}
                alt="用户头像"
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-muted text-muted-foreground">
                <User className="size-20" />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-lg font-semibold text-foreground">未命名用户</span>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <span aria-hidden>📍</span>
              {location}
            </span>
          </div>

          {/* 签到功能（占位：按钮完整，逻辑待接） */}
          <div className="w-64 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <CalendarCheck className="size-4 text-primary" />
              每日签到
            </div>
            <p className="mt-1 text-xs text-muted-foreground">坚持就是胜利，保持活跃。</p>
            <Button
              className="mt-3 w-full"
              onClick={() => toast.info("签到功能开发中")}
            >
              签到
            </Button>
          </div>
        </div>

        {/* 右栏：天气 + 日期（上）；贡献图（下） */}
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* 今天天气（实时数据：本地天气代理 + 中国天气网） */}
            <WeatherWidget />

            {/* 今天日期 + 星期 */}
            <div className="rounded-xl border border-border bg-card p-4">
              {/* 日期数字（约 100×25 像素范围） */}
              <div className="flex h-[25px] w-[100px] items-center rounded bg-muted/60 px-2 text-sm font-semibold text-foreground">
                {month}月{day}日
              </div>
              <div className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
                <CalendarDays className="size-4" />
                {weekday}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">今日暂无待办事项</p>
            </div>
          </div>

          {/* GitHub 式横向贡献热力图 */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                📊 Activity &amp; Contributions
              </span>
              <span className="text-xs text-muted-foreground">{totalContributions} 次</span>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2">
              {/* 周几标签列 */}
              <div className="flex shrink-0 flex-col gap-1 pt-4">
                {WEEKDAY_LABELS.map((label, i) => (
                  <span
                    key={i}
                    className="h-[10px] text-[9px] leading-[10px] text-muted-foreground"
                  >
                    {label}
                  </span>
                ))}
              </div>

              <div>
                {/* 月份标签行 */}
                <div className="mb-1 flex gap-1">
                  {MONTH_LABELS.map((label, i) => (
                    <span
                      key={i}
                      className="w-[10px] text-[9px] text-muted-foreground"
                    >
                      {label}
                    </span>
                  ))}
                </div>

                {/* 热力格子：53 列 × 7 行 */}
                <div className="flex gap-1">
                  {Array.from({ length: WEEKS }).map((_, w) => (
                    <div key={w} className="flex flex-col gap-1">
                      {Array.from({ length: DAYS }).map((_, d) => {
                        const level = cells[w * DAYS + d]
                        return (
                          <span
                            key={d}
                            title={`第 ${w + 1} 周 · 周${d + 1}`}
                            className="size-[10px] rounded-[2px]"
                            style={{ backgroundColor: LEVEL_COLORS[level] }}
                          />
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 图例 */}
            <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
              少
              {LEVEL_COLORS.map((c, i) => (
                <span
                  key={i}
                  className="size-[10px] rounded-[2px]"
                  style={{ backgroundColor: c }}
                />
              ))}
              多
            </div>
          </div>
        </div>
      </div>

      {/* 右下角：每日诗歌（一行小字） */}
      <footer className="px-8 pb-4 text-right text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Feather className="size-3" />
          「{poem}」
        </span>
      </footer>
    </div>
  )
}
