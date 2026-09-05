// 前端天气数据客户端：天气接口由托管本应用的同源服务器提供
// （scripts/serve-static.mjs 已内置 /api/weather；开发期由 scripts/dev.mjs 拉起的
// 独立代理在 :3005 提供）。默认使用相对路径（同源），故跨设备/局域网访问也能工作；
// 仅当显式设置 NEXT_PUBLIC_WEATHER_PROXY 时才改用该基址（开发期指向上面那个 :3005 代理）。

export interface WeatherNow {
  /** 城市名（中文） */
  city: string
  /** 当前温度（℃），字符串 */
  temp: string
  /** 天气现象，如 "多云转晴" / "雨" */
  weather: string
  /** 天气代码（weather.com.cn weathercode），用于选图标 */
  weathercode: string
  /** AQI 空气质量指数 */
  aqi: string
  /** 相对湿度，如 "88%" */
  humidity: string
  /** 风向，如 "东北风" */
  windDir: string
  /** 风力等级，如 "2级" */
  windScale: string
  /** 观测时间，如 "12:55" */
  time: string
}

export interface CityOption {
  /** 9 位城市代码 */
  code: string
  /** 城市名 */
  name: string
  /** 省份 */
  province: string
}

// 默认同源（相对路径）；开发期 dev.mjs 会注入 NEXT_PUBLIC_WEATHER_PROXY 指向 :3005 代理。
const PROXY_BASE = process.env.NEXT_PUBLIC_WEATHER_PROXY?.replace(/\/+$/, "") || ""

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${PROXY_BASE}${path}`)
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(detail || `请求失败（${res.status}）`)
  }
  return (await res.json()) as T
}

/** 获取指定城市的实时天气 */
export async function fetchWeather(cityCode: string): Promise<WeatherNow> {
  return getJson<WeatherNow>(`/api/weather?city=${encodeURIComponent(cityCode)}`)
}

/** 按名称搜索城市，返回候选列表 */
export async function searchCity(name: string): Promise<CityOption[]> {
  const r = await getJson<{ list: CityOption[] }>(
    `/api/weather/search?name=${encodeURIComponent(name)}`
  )
  return r.list ?? []
}
