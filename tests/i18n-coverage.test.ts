// i18n key 覆盖回归测试（node:test，`npm test` 跑）。
// 静态扫描 components/**/*.tsx|ts 与 lib/types.ts（SHORTCUT_META label）里的
// t("...") 字面 key，断言 zh / en 字典全部命中且值为字符串。
// 背景（2026-10-24 事故）：settings.licenses 字符串被 settingsExtra 同名对象块
// 覆盖、richtext.* 命名空间写错（字典实际叫 rt）等多处 key 悬空，界面显示原文。
// 只做源码文本正则 + 字典对象遍历，不 import 任何组件/浏览器模块。
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { zh } from "../lib/i18n/locales/zh.ts"
import { en } from "../lib/i18n/locales/en.ts"

function flatStrings(
  obj: Record<string, unknown>,
  prefix = "",
  out = new Map<string, string>(),
): Map<string, string> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === "object" && !Array.isArray(v)) {
      flatStrings(v as Record<string, unknown>, key, out)
    } else {
      out.set(key, String(v))
    }
  }
  return out
}

const zhMap = flatStrings(zh)
const enMap = flatStrings(en)

function* walkComponents(dir: string): Generator<string> {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) yield* walkComponents(p)
    else if (p.endsWith(".tsx") || p.endsWith(".ts")) yield p
  }
}

const KEY_RE = /\bt\(\s*["']([a-zA-Z0-9_.-]+)["']/g

function collectUsedKeys(): Map<string, string[]> {
  const used = new Map<string, string[]>()
  for (const p of walkComponents("components")) {
    const src = readFileSync(p, "utf8")
    for (const m of src.matchAll(KEY_RE)) {
      const k = m[1]
      if (!used.has(k)) used.set(k, [])
      used.get(k)!.push(p.replace(/\\/g, "/"))
    }
  }
  // lib/types.ts SHORTCUT_META 的 label 也是 i18n key（hooks/use-shortcuts.ts 里 t(meta.label)）
  const meta = readFileSync("lib/types.ts", "utf8")
  for (const m of meta.matchAll(/label:\s*["']([a-zA-Z0-9_.-]+)["']/g)) {
    const k = m[1]
    if (!used.has(k)) used.set(k, [])
    used.get(k)!.push("lib/types.ts (SHORTCUT_META)")
  }
  return used
}

describe("i18n key 覆盖（静态扫描）", () => {
  const used = collectUsedKeys()

  it("zh 字典非空", () => {
    assert.ok(zhMap.size > 500, `zh 叶子数异常: ${zhMap.size}`)
  })

  it("en 字典非空且与 zh 键集合同构", () => {
    assert.ok(enMap.size > 500, `en 叶子数异常: ${enMap.size}`)
    const onlyZh = [...zhMap.keys()].filter((k) => !enMap.has(k))
    const onlyEn = [...enMap.keys()].filter((k) => !zhMap.has(k))
    assert.deepEqual(
      { onlyZh, onlyEn },
      { onlyZh: [], onlyEn: [] },
      "zh/en 键集合必须完全一致（fallback 只兜值不兜结构）",
    )
  })

  it("所有组件引用的 key 在 zh/en 均为字符串", () => {
    const missing: string[] = []
    for (const [k, files] of [...used].sort()) {
      const inZh = zhMap.has(k)
      const inEn = enMap.has(k)
      if (!inZh || !inEn) {
        missing.push(`${k} ← ${[...new Set(files)].join(", ")}（zh:${inZh ? "✓" : "缺"} en:${inEn ? "✓" : "缺"}）`)
      }
    }
    assert.deepEqual(missing, [], "存在未命中字典的 i18n key，界面会显示原文")
  })

  it("lib/components 数据字段里的 key 形字符串（label/descKey/nameKey 等）也须命中", () => {
    // 背景（2026-10-24 事故）：lib/backup.ts BACKUP_SECTIONS 用顶层 backup.section.*，
    // 但 backup 块错挂在 settings 下，t() 全 miss——t() 调用扫描抓不到藏在数据里的 key。
    // 规则：label/descKey/nameKey/titleKey/placeholderKey 字段的字符串若首段是顶层
    // 命名空间（zh 的一级键），就按 i18n key 断言命中。
    const META_KEY_RE =
      /\b(?:label|descKey|nameKey|titleKey|placeholderKey)\s*:\s*["']([a-zA-Z0-9_.-]+)["']/g
    const namespaces = new Set(
      [...zhMap.keys()].filter((k) => !k.includes(".")),
    )
    const missing: string[] = []
    for (const dir of ["lib", "components"]) {
      for (const p of walkComponents(dir)) {
        const src = readFileSync(p, "utf8")
        for (const m of src.matchAll(META_KEY_RE)) {
          const k = m[1]
          const first = k.split(".")[0]
          if (!namespaces.has(first)) continue
          if (!zhMap.has(k) || !enMap.has(k)) {
            missing.push(
              `${k} ← ${p.replace(/\\/g, "/")}（zh:${zhMap.has(k) ? "✓" : "缺"} en:${enMap.has(k) ? "✓" : "缺"}）`,
            )
          }
        }
      }
    }
    assert.deepEqual(missing, [], "数据字段引用的 i18n key 未命中字典")
  })

  it("backup.section.* 必须存在于顶层（lib/backup.ts BACKUP_SECTIONS 消费）", () => {
    for (const k of [
      "backup.section.notes",
      "backup.section.notesDesc",
      "backup.section.vault",
      "backup.section.vaultDesc",
      "backup.section.vocabulary",
    ]) {
      assert.ok(zhMap.has(k), `zh 缺 ${k}`)
      assert.ok(enMap.has(k), `en 缺 ${k}`)
    }
  })
})
