// ============================================================
// weather-proxy-lib.mjs — 天气数据本地代理（零依赖，纯 Node）
//
// 为什么需要它：中国天气网接口（d1.weather.com.cn 等）会校验请求头
// Referer 必须是 https://www.weather.com.cn/，否则返回拦截页；且响应仅在
// Referer 正确时才带 Access-Control-Allow-Origin: *。浏览器既不能伪造
// Referer（禁设请求头），又因静态导出（output:"export"）无法使用 Next
// Route Handler，故用这个独立 Node 进程在服务端带 Referer 抓取，再回给前端。
//
// 数据逻辑等价于 npm 包 weather-com-cn-api 的 getWeatherIndex / searchCity /
// getIpLocation（该包 main 是 .ts 且卷入了原生 sharp，纯 Node 无法直接消费，
// 故此处用纯 JS 重写其 fetch 部分，避免打包坑）。包仍作为数据来源参考与已声明
// 依赖（见 lib/licenses.ts）。
// ============================================================
import { createServer } from "node:http"
import { createRequire } from "node:module"

const D1 = "https://d1.weather.com.cn"
const WX_H = {
  "Referer": "https://www.weather.com.cn/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
}

/** 解析多段 `var x = {...};` JSONP（weather_index 接口返回 cityDZ/dataSK/dataZS/...） */
function parseJsonpMulti(text) {
  const result = {}
  const segments = text.split(/;(?=\s*var\s)/)
  for (const seg of segments) {
    const m = seg.match(/var\s+(\w+)\s*=\s*([\s\S]+)/)
    if (!m) continue
    const json = m[2].trim().replace(/;$/, "")
    try {
      result[m[1]] = JSON.parse(json)
    } catch {
      // 单段解析失败时跳过，尽量保留其余字段
    }
  }
  return result
}

async function fetchWeatherRaw(cityCode) {
  const resp = await fetch(`${D1}/weather_index/${encodeURIComponent(cityCode)}.html`, {
    headers: WX_H,
  })
  if (!resp.ok) return null
  const parsed = parseJsonpMulti(await resp.text())
  const sk = parsed.dataSK
  if (!sk || typeof sk !== "object") return null
  return sk
}

/** 实时天气（温度/天气现象/AQI/湿度/风/观测时间） */
export async function fetchWeather(cityCode) {
  let sk = await fetchWeatherRaw(cityCode)
  // 边缘情况：用户手输 11 位区县级码时，回退到前 9 位市级码
  if (!sk && cityCode.length > 9) sk = await fetchWeatherRaw(cityCode.slice(0, 9))
  if (!sk) throw new Error("未获取到天气数据")
  return {
    city: sk.cityname || sk.city || "",
    temp: typeof sk.temp === "string" ? sk.temp : String(sk.temp ?? ""),
    weather: sk.weather ?? "",
    weathercode: sk.weathercode ?? "",
    aqi: sk.aqi ?? "",
    humidity: sk.SD ?? "",
    windDir: sk.WD ?? "",
    windScale: sk.WS ?? "",
    time: sk.time ?? "",
  }
}

/** 城市搜索：基于本地 weathercityid 索引做名称/别名模糊匹配，返回 { code, name, province } 列表 */
export function searchCity(name) {
  const q = (name || "").trim().toLowerCase()
  if (!q) return []
  const idx = getCityIndex()
  const out = []
  for (const c of idx) {
    // 回显真正匹配 query 的那个名称（避免同码下省名覆盖市名）
    const matched = c.names.find((n) => n.toLowerCase().includes(q))
    if (matched) {
      out.push({ code: c.code, name: matched, province: "" })
      if (out.length >= 20) break
    }
  }
  return out
}

// ---- 城市搜索索引（weathercityid：行政区 → 天气码，用于选择器）----
const require = createRequire(import.meta.url)
let _cityIdTable = null
function getCityIdTable() {
  if (!_cityIdTable) {
    const mod = require("weathercityid")
    _cityIdTable = mod.cityId || mod.default?.cityId || mod
  }
  return _cityIdTable
}
let _cityIndex = null
function getCityIndex() {
  if (_cityIndex) return _cityIndex
  const cityId = getCityIdTable()
  const map = new Map()
  for (const prov of Object.keys(cityId)) {
    const cities = cityId[prov]
    for (const code of Object.keys(cities)) {
      const { cityName, unofficialCityName, weatherId } = cities[code]
      const id = String(weatherId)
      if (!map.has(id)) map.set(id, { code: id, names: new Set() })
      const e = map.get(id)
      if (cityName) e.names.add(cityName)
      if (unofficialCityName) e.names.add(unofficialCityName)
    }
  }
  _cityIndex = [...map.values()].map((e) => ({ code: e.code, names: [...e.names] }))
  return _cityIndex
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  })
  res.end(body)
}

/** 处理天气相关请求；返回 true 表示已处理，false 表示路径不匹配（交给调用方） */
export async function handleWeatherRequest(req, res, url) {
  const path = url.pathname
  try {
    if (path === "/api/weather" || path === "/api/weather/") {
      const city = url.searchParams.get("city")
      if (!city) {
        sendJson(res, 400, { error: "缺少 city 参数" })
        return true
      }
      sendJson(res, 200, await fetchWeather(city))
      return true
    }
    if (path === "/api/weather/search") {
      const name = url.searchParams.get("name") ?? ""
      sendJson(res, 200, { list: await searchCity(name) })
      return true
    }
  } catch (e) {
    sendJson(res, 502, { error: e instanceof Error ? e.message : String(e) })
    return true
  }
  return false
}

/** 启动天气代理 HTTP 服务，返回 server 实例 */
export function startWeatherProxy(port = 3005) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`)
      const handled = await handleWeatherRequest(req, res, url)
      if (!handled) {
        res.writeHead(404)
        res.end("Not Found")
      }
    } catch (err) {
      res.writeHead(500)
      res.end("Internal Server Error")
      console.error("[weather-proxy] 处理失败:", err)
    }
  })
  server.listen(port, () => {
    console.log(`✔ 天气代理已启动  http://127.0.0.1:${port}/api/weather`)
  })
  return server
}
