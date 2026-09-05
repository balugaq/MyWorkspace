// 前端天气数据客户端：经本地代理（scripts/weather-proxy-lib.mjs）获取天气。
// 代理默认在 http://127.0.0.1:3005；可用环境变量 NEXT_PUBLIC_WEATHER_PROXY 覆盖
// （静态导出场景下在构建期内联，故本地托管时一般保持默认即可）。

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

const PROXY_BASE = (
  process.env.NEXT_PUBLIC_WEATHER_PROXY?.replace(/\/+$/, "") ||
  "http://127.0.0.1:3005"
)

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
