// i18n 基建（TODO 40）：react-i18next 客户端单例（纯前端 static export + 单页 view 切换，
// 无路由，不需要 next-intl 的路由能力）。语言持久化在 settings.uiLanguage（lib/types.ts），
// 本模块只管翻译与替换；locale 切换由设置页与 app/page.tsx 的启动同步调用 syncLocale。
//
// 正文占位符（主人 2026-10-11 口径）：内容里写 {lang:settings.general.theme} 这样的 token，
// 只读渲染时替换为当前语言字典文本（编辑态保留原文）——与内链同一思路：token 是存储协议，渲染层翻译。
// 围栏代码块内的 token 不替换（代码是字面量）。未命中 key 保留原文，方便发现坏 key。

import i18next, { type i18n as I18nInstance } from "i18next"
import { initReactI18next } from "react-i18next"
import { zh } from "./locales/zh.ts"
import { en } from "./locales/en.ts"

export type { i18n as I18nInstance } from "i18next"

/** 界面语言选项（与 lib/types.ts 的 UILanguage 一致；label 本身按各自语言展示） */
export const APP_LOCALES = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
] as const

export const DEFAULT_LOCALE = "zh"

// 单例初始化：react-i18next 绑定，组件用 useTranslation() 自动随语言切换 re-render
void i18next.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE, // en 缺 key 回落中文
  interpolation: { escapeValue: false }, // React 渲染本身防注入
  returnNull: false,
})

export function getI18n(): I18nInstance {
  return i18next
}

/** 切换语言（同值 no-op）；settings.uiLanguage 变化与启动同步都走这里。
 * changeLanguage 失败会打日志——排查「下拉显示 A 语言但内容回落中文」类问题（en 缺 key 回落 zh 的表象）。 */
export function syncLocale(locale: string): void {
  if (i18next.language !== locale) {
    void i18next.changeLanguage(locale).catch((err: unknown) => {
      console.error(`[MyWorkspace] i18n 切换到 ${locale} 失败`, err)
    })
  }
}

const LANG_TOKEN_G = /\{lang:([a-zA-Z0-9_.-]+)\}/g
const FENCE_SPLIT = /(```[\s\S]*?(?:```|$))/g

/**
 * 替换正文里的 {lang:key} 占位符为当前语言字典文本。
 * - 围栏代码块（``` 段）内不替换；未命中 key 保留原文。
 * - 作用于只读渲染（RichTextView / MarkdownView），编辑态不替换（token 是存储协议）。
 */
export function replaceLangTokens(text: string): string {
  return text
    .split(FENCE_SPLIT)
    .map((seg) =>
      seg.startsWith("```")
        ? seg
        : seg.replace(LANG_TOKEN_G, (token, key: string) =>
            i18next.exists(key) ? String(i18next.t(key)) : token,
          ),
    )
    .join("")
}
