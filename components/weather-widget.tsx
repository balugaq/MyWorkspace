"use client"

// 天气卡片（TODO 34）：数据源为 UAPI（uapis.cn）官方天气接口，浏览器直连。
// - 位置：接口按客户端 IP 自动定位，不再手动选城市
// - 频率：结果缓存 2 小时；仅手动点击刷新按钮时绕过缓存强制获取
// - 限流：命中 429 后前端冷却 10 分钟（持久化），期间禁用刷新并提示

import { useCallback, useEffect, useState } from "react"
import {
  MapPin,
  RefreshCw,
  Droplets,
  Wind,
  Sun,
  Cloud,
  CloudRain,
  CloudSun,
} from "lucide-react"
import { useWorkspace } from "@/lib/store"
import { Button } from "@/components/ui/button"
import {
  fetchWeather,
  getCooldownRemainingMs,
  RateLimitedError,
  type WeatherNow,
} from "@/lib/weather"

/** 天气现象选一个小图标（晴/雨/阴云/其他） */
function WeatherGlyph({ weather, className }: { weather: string; className?: string }) {
  if (weather.includes("雨")) return <CloudRain className={className} />
  if (weather.includes("晴")) return <Sun className={className} />
  if (weather.includes("阴") || weather.includes("云")) return <Cloud className={className} />
  return <CloudSun className={className} />
}

/** AQI 等级徽标（颜色随污染程度变化） */
function AQIBadge({ aqi }: { aqi: number }) {
  let cls = "bg-green-500/15 text-green-400"
  if (aqi > 300) {
    cls = "bg-rose-500/20 text-rose-300"
  } else if (aqi > 200) {
    cls = "bg-purple-500/15 text-purple-400"
  } else if (aqi > 150) {
    cls = "bg-red-500/15 text-red-400"
  } else if (aqi > 100) {
    cls = "bg-orange-500/15 text-orange-400"
  } else if (aqi > 50) {
    cls = "bg-yellow-500/15 text-yellow-400"
  }
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>AQI {aqi}</span>
  )
}

export function WeatherWidget() {
  const uapiToken = useWorkspace((s) => s.settings.uapiToken)
  const [data, setData] = useState<WeatherNow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // 429 冷却剩余毫秒（>0 时禁用刷新按钮；localStorage 持久化，刷新页面不绕过）
  const [cooldownMs, setCooldownMs] = useState(0)

  const load = useCallback(async (token: string, force: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const w = await fetchWeather(token, { force })
      setData(w)
    } catch (e) {
      if (e instanceof RateLimitedError) {
        // 限流：保留旧数据展示，进入冷却并提示
        setError(e.message)
        setCooldownMs(getCooldownRemainingMs())
      } else {
        setError(e instanceof Error ? e.message : "获取失败")
        setData(null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // 挂载：恢复冷却状态 + 拉一次天气（2 小时缓存命中则直接复用）
  useEffect(() => {
    setCooldownMs(getCooldownRemainingMs())
    void load(uapiToken, false)
  }, [uapiToken, load])

  // 冷却期内每 30 秒刷新一次剩余时间，归零自动解禁刷新按钮
  useEffect(() => {
    if (cooldownMs <= 0) return
    const iv = setInterval(() => setCooldownMs(getCooldownRemainingMs()), 30_000)
    return () => clearInterval(iv)
  }, [cooldownMs])

  const cooling = cooldownMs > 0

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
          <MapPin className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {data ? [data.city, data.district].filter(Boolean).join(" · ") || "当前位置" : loading ? "定位中…" : "当前位置"}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={() => void load(uapiToken, true)}
          disabled={loading || cooling}
          title={cooling ? `限流冷却中，约 ${Math.max(1, Math.ceil(cooldownMs / 60_000))} 分钟后可刷新` : "刷新天气（2 小时缓存，点击强制获取）"}
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          <span className="sr-only">刷新</span>
        </Button>
      </div>

      {error && !data ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : data ? (
        <>
          {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
          <div className="flex items-center gap-3">
            <WeatherGlyph weather={data.weather} className="size-8 text-amber-500" />
            <div className="flex flex-col">
              <span className="text-2xl font-bold leading-none text-foreground">
                {data.temperature == null ? "—" : `${data.temperature}°C`}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">{data.weather}</span>
            </div>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {data.aqi != null && <AQIBadge aqi={data.aqi} />}
            {data.humidity != null && (
              <span className="flex items-center gap-1">
                <Droplets className="size-3" />
                {data.humidity}%
              </span>
            )}
            {data.windDirection && (
              <span className="flex items-center gap-1">
                <Wind className="size-3" />
                {data.windDirection}
                {data.windPower ? ` ${data.windPower}` : ""}
              </span>
            )}
          </p>
          {data.reportTime && (
            <p className="mt-1 text-[10px] text-muted-foreground">更新时间 {data.reportTime}</p>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{loading ? "获取中…" : "暂无天气数据"}</p>
      )}
    </div>
  )
}
