// UAPI（uapis.cn）公共客户端（TODO 23 自 TODO 34 抽取）：天气/新闻热榜等 misc 接口共用的请求底座，统一 Bearer 头拼装、GET 与错误归一（429 抛 UapiRateLimitedError，其余非 2xx 及网络错抛 UapiError，status=0 为网络错）。
// 端点均为 GET + query 传参；Bearer 令牌可选（设置 → 高级）。各业务的缓存/冷却策略（如天气 2h 缓存 + 10min 冷却）留在各自模块，不在此层。

export const UAPI_BASE = "https://uapis.cn"

/** UAPI 请求失败（网络错 status=0；HTTP 错带真实状态码） */
export class UapiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "UapiError"
    this.status = status
  }
}

/** 429 限流：调用方按各自业务决定冷却策略 */
export class UapiRateLimitedError extends UapiError {
  constructor(message = "UAPI 接口访问过于频繁（429）") {
    super(message, 429)
    this.name = "UapiRateLimitedError"
  }
}

/** Bearer 头拼装：令牌留空（trim 后）则不带 Authorization，匿名调用 */
export function uapiHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = {}
  const t = token.trim()
  if (t) headers.Authorization = `Bearer ${t}`
  return headers
}

/** GET 一个 UAPI 接口并解析 JSON；path 以 / 开头（如 "/api/v1/misc/weather"），token 留空匿名。 */
export async function uapiGet<T>(
  path: string,
  token: string,
  query?: Record<string, string>,
): Promise<T> {
  const url = new URL(path, UAPI_BASE)
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  }
  let res: Response
  try {
    res = await fetch(url.toString(), { headers: uapiHeaders(token) })
  } catch {
    throw new UapiError("UAPI 服务连接失败", 0)
  }
  if (res.status === 429) throw new UapiRateLimitedError()
  if (!res.ok) throw new UapiError(`UAPI 请求失败（HTTP ${res.status}）`, res.status)
  return (await res.json()) as T
}
