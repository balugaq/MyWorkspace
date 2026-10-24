// npm lockfile peer 依赖一致性校验（纯逻辑，无 DOM / store / React 依赖）。
// 背景（2026-10-24 坑）：tiptap 全家 peer 精确锁版本，dependabot 单包升级
// （b9e9888 只升 @tiptap/extension-table 到 3.32.0）导致 npm ci ERESOLVE，
// 且当时 PR 上没有 CI 拦截，坏 lock 直接进了 master。
// 本模块被 scripts/check-peer-deps.ts（CI 首步）与 tests/peer-deps-check.test.ts 共用。
//
// peer 满足判定模拟 Node 实际解析：从消费包位置向上找——先查兄弟嵌套
// （node_modules/<consumer>/node_modules/<peer>），再查顶层 node_modules/<peer>，
// 任一层版本满足 range 即视为满足（npm 安装的树常见「顶层不符但嵌套副本满足」，
// 如 ajv-formats 的 peer ajv）。

export interface LockPackageEntry {
  version?: string
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
  dev?: boolean
  optional?: boolean
  link?: boolean
}

export interface Lockfile {
  packages?: Record<string, LockPackageEntry>
}

/** 把版本号字符串解析成可比较结构；prerelease 视为小于同版正式版。 */
function parseVersion(
  version: string,
): { parts: number[]; prerelease: boolean } {
  const m = /^v?(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?$/.exec(version.trim())
  if (!m) {
    throw new Error(`无法解析的版本号: "${version}"`)
  }
  const parts = m[1].split(".").map(Number)
  return { parts, prerelease: Boolean(m[2]) }
}

/** 逐段比较，短版本补 0。返回 -1 / 0 / 1。 */
function compareVersions(a: string, b: string): number {
  const va = parseVersion(a)
  const vb = parseVersion(b)
  const len = Math.max(va.parts.length, vb.parts.length)
  for (let i = 0; i < len; i++) {
    const ai = va.parts[i] ?? 0
    const bi = vb.parts[i] ?? 0
    if (ai !== bi) return ai < bi ? -1 : 1
  }
  if (va.prerelease !== vb.prerelease) return va.prerelease ? -1 : 1
  return 0
}

/** 单比较器：op + 基准版本；op=any 恒真。 */
type Comparator = { op: string; version: string }

/** x-range（1.x / 17.x.x / 1.2.x）展开为 [lower, upper) 两条比较器；全通配返回空。 */
function expandXRange(token: string): Comparator[] {
  const segs = token.split(".")
  const hasX = segs.some((s) => s === "x" || s === "X" || s === "*")
  if (!hasX) return []
  const nums = segs.map((s) =>
    s === "x" || s === "X" || s === "*" ? null : Number(s),
  )
  if (nums.some((n) => n !== null && Number.isNaN(n))) {
    throw new Error(`无法解析的 semver 比较器: "${token}"`)
  }
  const firstX = nums.indexOf(null)
  // 下界：null 之前取实际值，之后补 0
  const lower = nums
    .slice(0, firstX)
    .concat(nums.slice(firstX).map(() => 0))
  if (firstX === 0) return [] // *.x.x 全通配恒真
  // 上界：进位发生在第一个 null 的前一段（17.x.x → [18,0,0]；1.2.x → [1,3,0]）
  const upper = lower.slice()
  upper[firstX - 1] = (upper[firstX - 1] ?? 0) + 1
  for (let i = firstX; i < upper.length; i++) upper[i] = 0
  return [
    { op: ">=", version: lower.join(".") },
    { op: "<", version: upper.join(".") },
  ]
}

/** 解析单个 token（可含前缀操作符），返回展开后的比较器（1~2 条）。 */
function parseComparatorToken(token: string): Comparator[] {
  const m = /^(\^|~|>=|<=|>|<)?(.+)$/.exec(token.trim())
  if (!m || !m[2]) {
    throw new Error(`无法解析的 semver 比较器: "${token}"`)
  }
  const op = m[1] ?? "="
  const body = m[2]
  // x-range 只在无前缀操作符时按 npm 语义展开（^1.x 视为 ^1.0.0）
  if (op === "=") {
    const expanded = expandXRange(body)
    if (expanded.length > 0 || body.split(".").some((s) => /^(x|X|\*)$/.test(s))) {
      return expanded
    }
  }
  parseVersion(body) // 语法预检，非法版本直接抛错
  return [{ op, version: body }]
}

/**
 * 把 OR 的一个分支（空格分隔的 AND 比较）解析成比较器列表。
 * 处理 npm range 常见空格形态：
 * - 操作符与版本之间的空格：">= 4.11" → ">=" + "4.11"
 * - hyphen range："2 - 3" → >=2.0.0 <=3.0.0
 */
function parseAndComparators(branch: string): Comparator[] {
  const raw = branch.trim().split(/\s+/).filter(Boolean)
  const comps: Comparator[] = []
  for (let i = 0; i < raw.length; i++) {
    let token = raw[i]
    if (token === "-") {
      throw new Error(`无法解析的 semver 比较器: hyphen 位置错误 "${branch}"`)
    }
    if (/^(>=|<=|>|<|\^|~)$/.test(token)) {
      // 操作符与版本号被空格拆开（如 ">= 4.11"），黏合
      token = token + (raw[++i] ?? "")
    }
    if (raw[i + 1] === "-") {
      // hyphen range：lo - hi（hi 为部分版本时 npm 语义为 <=，补齐比较即可）
      const hi = raw[i + 2]
      if (hi === undefined || hi === "-") {
        throw new Error(`无法解析的 semver hyphen range: "${branch}"`)
      }
      parseVersion(token)
      parseVersion(hi)
      comps.push({ op: ">=", version: token }, { op: "<=", version: hi })
      i += 2
      continue
    }
    comps.push(...parseComparatorToken(token))
  }
  return comps
}

function satisfiesComparator(version: string, c: Comparator): boolean {
  if (c.op === "any") return true
  const cmp = compareVersions(version, c.version)
  switch (c.op) {
    case "=":
      return cmp === 0
    case ">=":
      return cmp >= 0
    case ">":
      return cmp > 0
    case "<=":
      return cmp <= 0
    case "<":
      return cmp < 0
    case "~": {
      // ~1.2.3 → [1.2.3, 1.3.0)；~0.1.2 → [0.1.2, 0.2.0)；~0 → [0, 1.0.0)
      const base = parseVersion(c.version).parts
      const upper =
        base.length >= 2
          ? [base[0], (base[1] ?? 0) + 1, 0]
          : [(base[0] ?? 0) + 1, 0, 0]
      return cmp >= 0 && compareVersions(version, upper.join(".")) < 0
    }
    case "^": {
      // ^1.2.3 → [1.3.0)；^0.2.3 → [0.3.0)；^0.0.3 → [0.0.4)
      const base = parseVersion(c.version).parts
      const upper = base.slice()
      if ((base[0] ?? 0) > 0) {
        upper[0] = (base[0] ?? 0) + 1
        upper[1] = 0
        upper[2] = 0
      } else if ((base[1] ?? 0) > 0) {
        upper[1] = (base[1] ?? 0) + 1
        upper[2] = 0
      } else {
        upper[2] = (base[2] ?? 0) + 1
      }
      return cmp >= 0 && compareVersions(version, upper.join(".")) < 0
    }
    default:
      throw new Error(`无法解析的 semver 比较器: "${c.op}"`)
  }
}

/**
 * 极简 semver satisfies：支持 npm peerDependencies 中常见语法——
 * 精确版本 / ^ / ~ / > / >= / < / <= / * / x-range（1.x、17.x.x）/
 * hyphen range（"2 - 3"）/ 操作符后带空格（">= 4.11"）/ "||" / prerelease。
 * 遇到不认识的语法直接抛错（宁可 CI 红，不可静默漏检）。
 */
export function semverSatisfies(version: string, range: string): boolean {
  const trimmed = range.trim()
  if (trimmed === "" || trimmed === "*") return true
  // "||" 分隔的 OR 分支，每支内空格分隔的 AND 比较器
  return trimmed.split("||").some((branch) => {
    const comps = parseAndComparators(branch)
    if (comps.length === 0) return true
    return comps.every((c) => satisfiesComparator(version, c))
  })
}

/** 顶层实装包的 key 形如 node_modules/<name>（含 @scope/name）。 */
function topLevelPackageKey(name: string): string {
  return `node_modules/${name}`
}

interface ResolvedPeer {
  version: string
  source: string
}

/**
 * 按 Node 解析顺序为消费包查找 peer：兄弟嵌套 → 顶层。
 * 返回第一个存在的候选；若存在且满足 range 返回其信息。
 */
function resolvePeer(
  packages: Record<string, LockPackageEntry>,
  consumerKey: string,
  peerName: string,
  range: string,
): { status: "ok"; resolved: ResolvedPeer } | { status: "conflict"; best?: ResolvedPeer } {
  const candidates = [
    `${consumerKey}/node_modules/${peerName}`,
    topLevelPackageKey(peerName),
  ]
  let best: ResolvedPeer | undefined
  for (const key of candidates) {
    const entry = packages[key]
    if (!entry?.version || entry.link) continue
    const resolved: ResolvedPeer = { version: entry.version, source: key }
    if (semverSatisfies(entry.version, range)) {
      return { status: "ok", resolved }
    }
    if (!best) best = resolved // 靠近消费包的第一个不满足副本，用于报错展示
  }
  return best ? { status: "conflict", best } : { status: "conflict" }
}

/**
 * 校验 lockfile 中所有顶层包的 peerDependencies 是否被实际安装版本满足。
 * 返回错误列表（0 条 = 通过）。
 * 规则：
 * - peer 按 Node 解析顺序查找（兄弟嵌套 → 顶层），任一层满足即通过；
 * - optional peer（peerDependenciesMeta.optional）所有候选缺失时跳过，存在则仍校验；
 * - 顶层根条目与嵌套副本自身不作为校验对象（peer 语义以顶层消费包为准）。
 */
export function checkPeerDeps(lock: Lockfile): string[] {
  const packages = lock.packages ?? {}
  const errors: string[] = []

  for (const [key, entry] of Object.entries(packages)) {
    const name = key.slice("node_modules/".length)
    if (
      !key.startsWith("node_modules/") ||
      !name || // 根条目 ""
      name.includes("node_modules/") || // 嵌套副本不作为消费包校验
      key.split("node_modules/").length !== 2 || // 防 node_modules/a/node_modules/b 形态
      !entry.version ||
      entry.link
    ) {
      continue
    }
    const peers = entry.peerDependencies ?? {}
    for (const [peerName, range] of Object.entries(peers)) {
      const isOptional = entry.peerDependenciesMeta?.[peerName]?.optional
      let result: ReturnType<typeof resolvePeer>
      try {
        result = resolvePeer(packages, key, peerName, range)
      } catch (err) {
        errors.push(
          `${key}@${entry.version} 的 peer "${peerName}@${range}" 范围无法解析: ${(err as Error).message}`,
        )
        continue
      }
      if (result.status === "ok") continue
      const target = result.best
      if (!target) {
        if (isOptional) continue
        errors.push(
          `${key}@${entry.version} 声明 peer "${peerName}@${range}"，但安装树中找不到该包`,
        )
        continue
      }
      errors.push(
        `${key}@${entry.version} 要求 peer ${peerName}@"${range}"，但按 Node 解析找到的 ${target.source} 为 ${target.version}（peer 冲突，npm ci 会 ERESOLVE）`,
      )
    }
  }

  return errors
}
