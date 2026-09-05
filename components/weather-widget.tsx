"use client"

import { useCallback, useEffect, useState } from "react"
import {
  MapPin,
  RefreshCw,
  Search,
  Droplets,
  Wind,
  Sun,
  Cloud,
  CloudRain,
  CloudSun,
  Pencil,
} from "lucide-react"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useWorkspace } from "@/lib/store"
import {
  fetchWeather,
  searchCity,
  type WeatherNow,
  type CityOption,
} from "@/lib/weather"

/** 天气现象选一个小图标（晴/雨/阴云/其他） */
function WeatherGlyph({ weather, className }: { weather: string; className?: string }) {
  if (weather.includes("雨")) return <CloudRain className={className} />
  if (weather.includes("晴")) return <Sun className={className} />
  if (weather.includes("阴") || weather.includes("云")) return <Cloud className={className} />
  return <CloudSun className={className} />
}

/** 温度占位符：weather.com.cn 夜间常以 999 表示无有效温度 */
function fmtTemp(t: string) {
  return t === "999" || t === "" ? "—" : t
}

/** AQI 等级徽标（颜色随污染程度变化） */
function AQIBadge({ aqi }: { aqi: string }) {
  const v = Number(aqi)
  if (!Number.isFinite(v) || v <= 0) return null
  let cls = "bg-green-500/15 text-green-400"
  if (v <= 50) {
    cls = "bg-green-500/15 text-green-400"
  } else if (v <= 100) {
    cls = "bg-yellow-500/15 text-yellow-400"
  } else if (v <= 150) {
    cls = "bg-orange-500/15 text-orange-400"
  } else if (v <= 200) {
    cls = "bg-red-500/15 text-red-400"
  } else if (v <= 300) {
    cls = "bg-purple-500/15 text-purple-400"
  } else {
    cls = "bg-rose-500/20 text-rose-300"
  }
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>AQI {v}</span>
  )
}

export function WeatherWidget() {
  const cityCode = useWorkspace((s) => s.weatherCityCode)
  const setCityCode = useWorkspace((s) => s.setWeatherCityCode)
  const [data, setData] = useState<WeatherNow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<CityOption[]>([])
  const [searching, setSearching] = useState(false)

  const load = useCallback(async (code: string) => {
    if (!code) return
    setLoading(true)
    setError(null)
    try {
      const w = await fetchWeather(code)
      setData(w)
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取失败")
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // 无城市代码时不自动定位，等待用户在弹层里手动选择城市。
  useEffect(() => {
    if (cityCode) load(cityCode)
  }, [cityCode, load])

  const onSearch = useCallback(async (q: string) => {
    setQuery(q)
    if (!q.trim()) {
      setResults([])
      return
    }
    setSearching(true)
    try {
      const list = await searchCity(q)
      setResults(list)
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  function pick(city: CityOption) {
    setCityCode(city.code)
    setOpen(false)
    setQuery("")
    setResults([])
    void load(city.code)
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
          <MapPin className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{data?.city || (loading ? "加载中…" : "未选择城市")}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => void load(cityCode)}
            disabled={loading || !cityCode}
            title="刷新天气"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            <span className="sr-only">刷新</span>
          </Button>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="切换城市"
            >
              <Pencil className="size-3.5" />
              <span className="sr-only">切换城市</span>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-3 p-3">
              {error ? (
                <p className="text-xs text-destructive">{error}</p>
              ) : data ? (
                <div className="space-y-1.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold tabular-nums">
                      {fmtTemp(data.temp)}°
                    </span>
                    <span className="text-sm text-muted-foreground">{data.weather}</span>
                    {data.aqi ? <AQIBadge aqi={data.aqi} /> : null}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Droplets className="size-3" />
                      {data.humidity}
                    </span>
                    <span className="flex items-center gap-1">
                      <Wind className="size-3" />
                      {data.windDir} {data.windScale}
                    </span>
                    <span className="col-span-2">观测时间 {data.time}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">加载中或请选择城市</p>
              )}

              <div className="space-y-1.5 border-t pt-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => void onSearch(e.target.value)}
                    placeholder="搜索城市，如 北京"
                    className="h-8 pl-7 text-xs"
                  />
                </div>
                {searching ? (
                  <p className="text-xs text-muted-foreground">搜索中…</p>
                ) : results.length > 0 ? (
                  <ul className="max-h-40 space-y-0.5 overflow-auto">
                    {results.slice(0, 8).map((c) => (
                      <li key={c.code}>
                        <button
                          type="button"
                          onClick={() => pick(c)}
                          className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                        >
                          <span className="truncate">{c.name}</span>
                          <span className="ml-2 shrink-0 text-muted-foreground">{c.province}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : query.trim() ? (
                  <p className="text-xs text-muted-foreground">无匹配结果</p>
                ) : null}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {error && !data ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : data ? (
        <>
          <div className="flex items-center gap-3">
            <WeatherGlyph weather={data.weather} className="size-8 text-amber-500" />
            <div className="flex flex-col">
              <span className="text-2xl font-bold leading-none text-foreground">
                {fmtTemp(data.temp)}°C
              </span>
              <span className="mt-1 text-xs text-muted-foreground">{data.weather}</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {data.aqi ? `AQI ${data.aqi} · ` : ""}湿度 {data.humidity}
            {data.windDir ? ` · ${data.windDir} ${data.windScale}` : ""}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">观测时间 {data.time}</p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          {cityCode ? "加载中…" : "请选择城市查看天气"}
        </p>
      )}
    </div>
  )
}
