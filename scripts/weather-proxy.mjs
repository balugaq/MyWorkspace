// 独立启动天气代理（默认 :3005）。通常无需单独运行——serve 与 dev 流程已自动挂载。
// 用法：node scripts/weather-proxy.mjs [port]
import { startWeatherProxy } from "./weather-proxy-lib.mjs"

const port = Number(process.argv[2]) || 3005
startWeatherProxy(port)
