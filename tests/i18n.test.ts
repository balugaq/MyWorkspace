// lib/i18n 的测试（node:test，`npm test` 跑）：i18next 可在 node 直接 init（无 DOM 依赖）。
// 覆盖 TODO 40：中英字典切换 / 回落 / {lang:key} 正文占位符替换（含代码块豁免与坏 key 保留）。
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { getI18n, replaceLangTokens, syncLocale } from "../lib/i18n/index.ts"
import { zh } from "../lib/i18n/locales/zh.ts"
import { en } from "../lib/i18n/locales/en.ts"

/** 收集字典全部叶子 key 路径（用于 en/zh 同构校验） */
function leafPaths(obj: Record<string, unknown>, prefix = ""): Set<string> {
  const out = new Set<string>()
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "object") for (const p of leafPaths(v as Record<string, unknown>, `${prefix}${k}.`)) out.add(p)
    else out.add(`${prefix}${k}`)
  }
  return out
}

describe("en/zh 字典同构（TODO 40 防漂移）", () => {
  it("en 的 key 集合与 zh 完全一致（无缺失/多余）", () => {
    const zp = leafPaths(zh)
    const ep = leafPaths(en)
    const missing = [...zp].filter((k) => !ep.has(k))
    const extra = [...ep].filter((k) => !zp.has(k))
    assert.deepEqual({ missing, extra }, { missing: [], extra: [] })
  })

  it("en 抽查：关键 key 均为英文（非中文回落）", () => {
    assert.equal((en as unknown as Record<string, Record<string, string>>).settings.title, "Settings")
    assert.equal((en as unknown as Record<string, Record<string, string>>).aiChat.thinking, "Thinking…")
    assert.equal(
      (en as unknown as { vocab: Record<string, string> }).vocab.submitAnswers,
      "Submit answers ({{done}} / {{total}} answered)",
    )
  })
})

describe("i18n 初始化与切换", () => {
  it("默认中文；changeLanguage 后切英文", () => {
    syncLocale("zh")
    assert.equal(getI18n().t("settings.title"), "设置")
    syncLocale("en")
    assert.equal(getI18n().t("settings.title"), "Settings")
    assert.equal(getI18n().t("settings.general.theme"), "Theme")
  })

  it("en 缺 key 回落中文", () => {
    syncLocale("en")
    assert.equal(getI18n().t("not.extracted.yet"), "not.extracted.yet")
  })

  it("非法语言值回落中文", () => {
    syncLocale("fr")
    assert.equal(getI18n().language, "fr") // i18next 允许未知 lng，资源回落 fallbackLng=zh
    assert.equal(getI18n().t("settings.title"), "设置")
  })
})

describe("replaceLangTokens", () => {
  it("替换正文里的 {lang:key} 为当前语言文本", () => {
    syncLocale("zh")
    assert.equal(
      replaceLangTokens("当前主题见{lang:settings.general.theme}设置。"),
      "当前主题见主题设置。",
    )
    syncLocale("en")
    assert.equal(
      replaceLangTokens("See {lang:settings.general.theme} settings."),
      "See Theme settings.",
    )
  })

  it("未命中 key 保留原文（方便发现坏 key）", () => {
    syncLocale("zh")
    const text = "坏 key：{lang:not.a.real_key} 保留。"
    assert.equal(replaceLangTokens(text), text)
  })

  it("围栏代码块内的 token 不替换", () => {
    syncLocale("en")
    const text = "正文 {lang:settings.title}\n```\n{lang:settings.title}\n```"
    const out = replaceLangTokens(text)
    assert.ok(out.includes("Settings"))
    assert.ok(out.includes("{lang:settings.title}"))
  })

  it("普通代码/花括号不受影响", () => {
    syncLocale("zh")
    assert.equal(replaceLangTokens("a { b } {lang} c"), "a { b } {lang} c")
  })
})
