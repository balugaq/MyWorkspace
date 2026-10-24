"use client"

// 天气卡片（TODO 34）：UAPI（uapis.cn）接口浏览器直连，按客户端 IP 自动定位；
// 结果缓存 2 小时（仅手动刷新绕过）；命中 429 后前端冷却 10 分钟（持久化）。

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
import { useTranslation } from "react-i18next"
import { useWorkspace } from "@/lib/store"
import { Button } from "@/components/ui/button"
import {
  fetchWeather,
  getCooldownRemainingMs,
  RateLimitedError,
  type WeatherNow,
} from "@/lib/weather"

function WeatherGlyph({ weather, className }: { weather: string; className?: string }) {
  if (weather.includes("雨")) return <CloudRain className={className} />
  if (weather.includes("晴")) return <Sun className={className} />
  if (weather.includes("阴") || weather.includes("云")) return <Cloud className={className} />
  return <CloudSun className={className} />
}

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
  const { t } = useTranslation()
  const uapiToken = useWorkspace((s) => s.settings.uapiToken)
  const [data, setData] = useState<WeatherNow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // 429 冷却剩余毫秒（>0 禁用刷新）；localStorage 持久化，刷新页面不绕过
  const [cooldownMs, setCooldownMs] = useState(0)

  const load = useCallback(async (token: string, force: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const w = await fetchWeather(token, { force })
      setData(w)
    } catch (e) {
      if (e instanceof RateLimitedError) {
        // 限流：保留旧数据展示，只进冷却并提示
        setError(e.message)
        setCooldownMs(getCooldownRemainingMs())
      } else {
        setError(e instanceof Error ? e.message : t("weather.fetchFail"))
        setData(null)
      }
    } finally {
      setLoading(false)
    }
  }, [t])

  // 挂载：恢复冷却状态 + 非强制拉一次（缓存命中直接复用）；setState 延迟一拍避开 set-state-in-effect
  useEffect(() => {
    const t = window.setTimeout(() => setCooldownMs(getCooldownRemainingMs()), 0)
    void load(uapiToken, false)
    return () => window.clearTimeout(t)
  }, [uapiToken, load])

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
            {data ? [data.city, data.district].filter(Boolean).join(" · ") || t("weather.currentLocation") : loading ? t("weather.locating") : t("weather.currentLocation")}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={() => void load(uapiToken, true)}
          disabled={loading || cooling}
          title={cooling ? t("weather.cooling", { n: Math.max(1, Math.ceil(cooldownMs / 60_000)) }) : t("weather.refreshTip")}
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          <span className="sr-only">{t("common.refresh")}</span>
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
            <p className="mt-1 text-[10px] text-muted-foreground">{t("weather.updatedAt")} {data.reportTime}</p>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{loading ? t("weather.fetching") : t("weather.noData")}</p>
      )}
    </div>
  )
}
