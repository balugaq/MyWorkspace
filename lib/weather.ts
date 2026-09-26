// UAPI 天气数据客户端：浏览器直连 uapis.cn 官方接口（TODO 34，替代原中国天气网本地代理）。
//
// 接口：GET https://uapis.cn/api/v1/misc/weather（与官方 SDK getMiscWeather 同源同参）
// - 不传 city / adcode：接口按客户端 IP 自动定位（todo 示例口径：city 不要提供）
// - Authorization: Bearer <UAPI 令牌> 可选（设置 → 高级 中配置）；无令牌也可调用
// - 缓存：成功结果落 localStorage（mw:weather-cache），2 小时内直接复用；
//   仅用户手动点击刷新（force）时绕过缓存重新获取
// - 429 限流：命中后进入 10 分钟前端冷却（mw:weather-cooldown 持久化，刷新页面不绕过），
//   冷却期内所有请求直接抛 RateLimitedError，由 UI 提示「10 分钟后再调用」

const UAPI_WEATHER_URL = "https://uapis.cn/api/v1/misc/weather"
const CACHE_TTL_MS = 2 * 60 * 60 * 1000 // 2 小时获取 1 次
const COOLDOWN_MS = 10 * 60 * 1000 // 429 后 10 分钟内不再发起请求
const CACHE_KEY = "mw:weather-cache"
const COOLDOWN_KEY = "mw:weather-cooldown"

/** 429 限流 / 冷却期内抛出；message 为可直接展示的提示文案 */
export class RateLimitedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RateLimitedError"
  }
}

/** UAPI 响应中本应用消费的字段（完整响应见 uapis.cn 文档，其余字段按需再取） */
interface UapiWeatherResponse {
  province?: string
  city?: string
  district?: string
  weather?: string
  temperature?: number
  wind_direction?: string
  wind_power?: string
  humidity?: number
  report_time?: string
  aqi?: number
}

export interface WeatherNow {
  /** 城市名（中文），如「北京」 */
  city: string
  /** 区县 / 更细一级行政区（IP 定位时常有），如「海淀区」 */
  district: string
  /** 当前温度 ℃ */
  temperature: number | null
  /** 天气现象描述，如「晴」「多云」 */
  weather: string
  /** 风向，如「西南风」 */
  windDirection: string
  /** 风力等级，如「微风」 */
  windPower: string
  /** 相对湿度 % */
  humidity: number | null
  /** 数据更新时间（原样字符串，如 "2026-02-19 15:25:58"） */
  reportTime: string
  /** AQI（基础调用可能不返回；null 时 UI 隐藏徽标） */
  aqi: number | null
}

interface WeatherCache {
  fetchedAt: number
  data: WeatherNow
}

function readCache(): WeatherCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WeatherCache
    return parsed && typeof parsed.fetchedAt === "number" && parsed.data ? parsed : null
  } catch {
    return null
  }
}

function writeCache(cache: WeatherCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // 隐私模式 / 配额超限：缓存失败不影响主流程（下次直接重新请求）
  }
}

/** 当前 429 冷却剩余毫秒数（0 = 不在冷却期） */
export function getCooldownRemainingMs(): number {
  try {
    const raw = localStorage.getItem(COOLDOWN_KEY)
    const until = raw ? Number(raw) : 0
    return Number.isFinite(until) ? Math.max(0, until - Date.now()) : 0
  } catch {
    return 0
  }
}

function enterCooldown(): void {
  try {
    localStorage.setItem(COOLDOWN_KEY, String(Date.now() + COOLDOWN_MS))
  } catch {
    // 写不进就仅本次会话内存生效（下次 429 再进）
  }
}

function normalize(payload: UapiWeatherResponse): WeatherNow {
  return {
    city: payload.city ?? "",
    district: payload.district ?? "",
    temperature:
      typeof payload.temperature === "number" && Number.isFinite(payload.temperature)
        ? payload.temperature
        : null,
    weather: payload.weather ?? "",
    windDirection: payload.wind_direction ?? "",
    windPower: payload.wind_power ?? "",
    humidity:
      typeof payload.humidity === "number" && Number.isFinite(payload.humidity)
        ? payload.humidity
        : null,
    reportTime: payload.report_time ?? "",
    aqi:
      typeof payload.aqi === "number" && Number.isFinite(payload.aqi) && payload.aqi > 0
        ? payload.aqi
        : null,
  }
}

async function requestWeather(token: string): Promise<WeatherNow> {
  const headers: Record<string, string> = {}
  const t = token.trim()
  if (t) headers.Authorization = `Bearer ${t}`
  let res: Response
  try {
    res = await fetch(UAPI_WEATHER_URL, { headers })
  } catch {
    throw new Error("天气服务连接失败")
  }
  if (res.status === 429) {
    enterCooldown()
    throw new RateLimitedError("天气接口访问过于频繁，请 10 分钟后再调用")
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(detail ? `天气请求失败（${res.status}）` : `天气请求失败（${res.status}）`)
  }
  return normalize((await res.json()) as UapiWeatherResponse)
}

/**
 * 获取当前天气（IP 自动定位）。
 * @param token UAPI 令牌（可选，留空匿名调用）
 * @param opts.force true = 用户手动刷新，绕过 2 小时缓存强制获取
 */
export async function fetchWeather(
  token: string,
  opts?: { force?: boolean },
): Promise<WeatherNow> {
  const remaining = getCooldownRemainingMs()
  if (remaining > 0) {
    const minutes = Math.max(1, Math.ceil(remaining / 60_000))
    throw new RateLimitedError(`天气接口限流中，请约 ${minutes} 分钟后再调用`)
  }
  if (!opts?.force) {
    const cached = readCache()
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.data
    }
  }
  const data = await requestWeather(token)
  writeCache({ fetchedAt: Date.now(), data })
  return data
}
