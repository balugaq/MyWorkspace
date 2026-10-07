// 词汇表存储层（TODO 64）：IndexedDB 独立存储（词条 / 来源 / 问答记录），不进 localStorage persist。
// 选型依据：4 本英语书的词汇量（可达上万条）会顶爆 localStorage 5MB 配额，故与图片 / 保险库同套路走 IndexedDB。
//
// 结构：
//   workspace-vocab
//   ├── entries  (keyPath id)  # VocabEntry：词 → 释义，底层 id 表示，显示层随意增删改
//   ├── sources  (keyPath id)  # VocabSource：独立来源小系统（不与标签共用），词条用 id 引用
//   └── records  (keyPath id)  # VocabQuizRecord：每轮问答全量持久化
//
// 缓存：模块级内存缓存（首次 load 后常驻），写入操作同步更新缓存 + IndexedDB，
// 组件直接读缓存渲染（与 gh-card / image-store 的缓存思路一致）。

import type {
  VocabEntry,
  VocabImportItem,
  VocabQuizRecord,
  VocabSource,
} from "./types"

const DB_NAME = "workspace-vocab"
const DB_VERSION = 1
const STORE_ENTRIES = "entries"
const STORE_SOURCES = "sources"
const STORE_RECORDS = "records"

const uid = () => Math.random().toString(36).slice(2, 10)

/** 词条 word 长度上限（2026-10-07 主人口径：禁止超过 100 字符） */
export const VOCAB_WORD_MAX = 100

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        db.createObjectStore(STORE_ENTRIES, { keyPath: "id" })
      }
      if (!db.objectStoreNames.contains(STORE_SOURCES)) {
        db.createObjectStore(STORE_SOURCES, { keyPath: "id" })
      }
      if (!db.objectStoreNames.contains(STORE_RECORDS)) {
        db.createObjectStore(STORE_RECORDS, { keyPath: "id" })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function getAll<T>(store: IDBObjectStore): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
  })
}

function putValues(store: IDBObjectStore, values: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = store.transaction
    for (const v of values) store.put(v)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ---- 模块级缓存 ----

let entriesCache: VocabEntry[] | null = null
let sourcesCache: VocabSource[] | null = null
let recordsCache: VocabQuizRecord[] | null = null

export interface VocabData {
  entries: VocabEntry[]
  sources: VocabSource[]
}

/** 全量加载（首次读 IndexedDB，之后直接返回缓存）；已加载时为 no-op */
export async function loadVocab(): Promise<VocabData> {
  if (entriesCache && sourcesCache) {
    return { entries: entriesCache, sources: sourcesCache }
  }
  const db = await openDB()
  const [entries, sources] = await Promise.all([
    getAll<VocabEntry>(db.transaction(STORE_ENTRIES, "readonly").objectStore(STORE_ENTRIES)),
    getAll<VocabSource>(db.transaction(STORE_SOURCES, "readonly").objectStore(STORE_SOURCES)),
  ])
  entriesCache = entries
  sourcesCache = sources
  return { entries, sources }
}

/** 词条缓存（未加载时返回空数组；组件应先 await loadVocab） */
export function listVocabEntries(): VocabEntry[] {
  return entriesCache ?? []
}

export function listVocabSources(): VocabSource[] {
  return sourcesCache ?? []
}

function sortEntries(entries: VocabEntry[]): VocabEntry[] {
  return [...entries].sort(
    (a, b) => a.word.localeCompare(b.word, "zh-CN") || a.createdAt - b.createdAt,
  )
}

// ---- 来源（VocabSource）：独立小系统，底层 id 引用，name 可随意改 ----

/** 按名称查找来源（trim 精确匹配；不存在返回 null） */
export function findVocabSourceByName(name: string): VocabSource | null {
  const key = name.trim()
  return (sourcesCache ?? []).find((s) => s.name === key) ?? null
}

/** 按名取来源：已存在直接复用（幂等），否则新建。返回来源 id */
export async function ensureVocabSource(name: string): Promise<string> {
  const key = name.trim()
  const existing = findVocabSourceByName(key)
  if (existing) return existing.id
  const source: VocabSource = { id: `vs_${uid()}`, name: key, createdAt: Date.now() }
  sourcesCache = [...(sourcesCache ?? []), source]
  const db = await openDB()
  await putValues(db.transaction(STORE_SOURCES, "readwrite").objectStore(STORE_SOURCES), [source])
  return source.id
}

/** 重命名来源（词条用 id 引用，无需级联改动） */
export async function renameVocabSource(id: string, name: string): Promise<void> {
  const key = name.trim()
  if (!key || !(sourcesCache ?? []).some((s) => s.id === id)) return
  sourcesCache = (sourcesCache ?? []).map((s) => (s.id === id ? { ...s, name: key } : s))
  const updated = (sourcesCache ?? []).find((s) => s.id === id)!
  const db = await openDB()
  await putValues(db.transaction(STORE_SOURCES, "readwrite").objectStore(STORE_SOURCES), [updated])
}

/** 删除来源：仅摘标记——引用它的词条 sourceId 置空，词条本身保留（主人口径） */
export async function deleteVocabSource(id: string): Promise<number> {
  if (!(sourcesCache ?? []).some((s) => s.id === id)) return 0
  sourcesCache = (sourcesCache ?? []).filter((s) => s.id !== id)
  // 先筛出受影响词条（原本 sourceId === id 的），缓存摘标记后精确回写这批
  const affectedIds = new Set(
    (entriesCache ?? []).filter((e) => e.sourceId === id).map((e) => e.id)
  )
  if (affectedIds.size > 0) {
    entriesCache = (entriesCache ?? []).map((e) =>
      affectedIds.has(e.id) ? { ...e, sourceId: undefined } : e
    )
  }
  const db = await openDB()
  const tx = db.transaction(
    affectedIds.size > 0 ? [STORE_SOURCES, STORE_ENTRIES] : [STORE_SOURCES],
    "readwrite"
  )
  tx.objectStore(STORE_SOURCES).delete(id)
  if (affectedIds.size > 0) {
    const entryStore = tx.objectStore(STORE_ENTRIES)
    for (const e of entriesCache!) {
      if (affectedIds.has(e.id)) entryStore.put(e)
    }
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  return affectedIds.size
}

// ---- 词条（VocabEntry）----

/** 词条 word 是否已存在（trim 精确匹配；excludeId 供编辑时排除自身） */
export function isVocabWordTaken(word: string, excludeId?: string): boolean {
  const key = word.trim().toLowerCase()
  return (entriesCache ?? []).some(
    (e) => e.id !== excludeId && e.word.trim().toLowerCase() === key,
  )
}

/** 新建 / 更新词条（调用方负责 word 唯一性校验） */
export async function upsertVocabEntry(entry: VocabEntry): Promise<void> {
  const exists = (entriesCache ?? []).some((e) => e.id === entry.id)
  entriesCache = exists
    ? (entriesCache ?? []).map((e) => (e.id === entry.id ? entry : e))
    : sortEntries([...(entriesCache ?? []), entry])
  const db = await openDB()
  await putValues(db.transaction(STORE_ENTRIES, "readwrite").objectStore(STORE_ENTRIES), [entry])
}

/** 删除词条 */
export async function removeVocabEntry(id: string): Promise<void> {
  entriesCache = (entriesCache ?? []).filter((e) => e.id !== id)
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_ENTRIES, "readwrite")
    tx.objectStore(STORE_ENTRIES).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export interface VocabImportReport {
  added: number
  skippedDuplicate: number
  invalid: number
  sourcesCreated: string[]
}

/**
 * 解析批量导入文本（AI 输出 / 手动粘贴共用）：
 * 接受纯数组或 { items: [...] } 两种形状；word / definition 均非空才有效。
 * 解析失败（非法 JSON / 非数组）返回空结果，调用方以 items.length === 0 判定。
 */
export function parseVocabImport(text: string): {
  items: VocabImportItem[]
  invalid: number
} {
  const trimmed = text.trim()
  if (!trimmed) return { items: [], invalid: 0 }
  let arr: unknown
  try {
    const data = JSON.parse(trimmed)
    arr = Array.isArray(data) ? data : !!data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items) ? (data as { items: unknown }).items : null
  } catch {
    return { items: [], invalid: 0 }
  }
  if (!Array.isArray(arr)) return { items: [], invalid: 0 }
  const items: VocabImportItem[] = []
  let invalid = 0
  for (const raw of arr) {
    if (!raw || typeof raw !== "object") {
      invalid++
      continue
    }
    const r = raw as Record<string, unknown>
    const word = typeof r.word === "string" ? r.word.trim() : ""
    const definition = typeof r.definition === "string" ? r.definition.trim() : ""
    if (!word || !definition || word.length > VOCAB_WORD_MAX) {
      invalid++
      continue
    }
    items.push({
      word,
      definition,
      ...(typeof r.source === "string" && r.source.trim() ? { source: r.source.trim() } : {}),
    })
  }
  return { items, invalid }
}

/**
 * 批量导入（AI 批量加词方案 A 的入库端 + 手动粘贴共用）：
 * word 重复（与现有库或本批次内，trim 精确匹配）→ 跳过保留旧释义；
 * item.source 字符串 → 按名取 / 建 VocabSource（ensureVocabSource 幂等）。
 */
export async function addVocabEntries(
  items: VocabImportItem[],
): Promise<VocabImportReport> {
  const report: VocabImportReport = {
    added: 0,
    skippedDuplicate: 0,
    invalid: 0,
    sourcesCreated: [],
  }
  const beforeSources = new Set((sourcesCache ?? []).map((s) => s.name))
  const batch: VocabEntry[] = []
  const seen = new Set<string>()
  const sourceIdCache = new Map<string, string>()
  for (const item of items ?? []) {
    const word = (item?.word ?? "").trim()
    const definition = (item?.definition ?? "").trim()
    if (!word || !definition || word.length > VOCAB_WORD_MAX) {
      report.invalid++
      continue
    }
    const key = word.toLowerCase()
    if (seen.has(key) || isVocabWordTaken(word)) {
      report.skippedDuplicate++
      continue
    }
    seen.add(key)
    let sourceId: string | undefined
    const sourceName = (item.source ?? "").trim()
    if (sourceName) {
      const cached = sourceIdCache.get(sourceName)
      if (cached) {
        sourceId = cached
      } else {
        sourceId = await ensureVocabSource(sourceName)
        sourceIdCache.set(sourceName, sourceId)
        if (!beforeSources.has(sourceName)) report.sourcesCreated.push(sourceName)
      }
    }
    batch.push({
      id: `ve_${uid()}`,
      word,
      definition,
      ...(sourceId ? { sourceId } : {}),
      createdAt: Date.now(),
      review: { total: 0, wrongCount: 0 },
    })
  }
  if (batch.length > 0) {
    entriesCache = sortEntries([...(entriesCache ?? []), ...batch])
    const db = await openDB()
    await putValues(db.transaction(STORE_ENTRIES, "readwrite").objectStore(STORE_ENTRIES), batch)
    report.added = batch.length
  }
  return report
}

// ---- 问答记录（VocabQuizRecord）：全量持久化 ----

/** 保存一轮问答记录，并把每题评价回写到对应词条的 review（词条已删的跳过） */
export async function saveQuizResult(
  record: Omit<VocabQuizRecord, "id"> & { id?: string }
): Promise<VocabQuizRecord> {
  const full: VocabQuizRecord = { ...record, id: record.id ?? `qr_${uid()}` }
  recordsCache = [full, ...(recordsCache ?? [])]
  const reviewById = new Map<string, VocabEntry["review"]>()
  for (const item of full.items) {
    const prev = (entriesCache ?? []).find((e) => e.id === item.id)?.review
    reviewById.set(item.id, {
      total: (prev?.total ?? 0) + 1,
      lastRating: item.rating,
      lastAt: full.at,
      wrongCount: (prev?.wrongCount ?? 0) + (item.rating === "wrong" || item.rating === "partial" ? 1 : 0),
    })
  }
  entriesCache = (entriesCache ?? []).map((e) => {
    const review = reviewById.get(e.id)
    return review ? { ...e, review } : e
  })
  const db = await openDB()
  const tx = db.transaction([STORE_RECORDS, STORE_ENTRIES], "readwrite")
  tx.objectStore(STORE_RECORDS).put(full)
  const entryStore = tx.objectStore(STORE_ENTRIES)
  for (const e of entriesCache!) {
    if (reviewById.has(e.id)) entryStore.put(e)
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  return full
}

/** 历史问答记录（新→旧） */
export function listQuizRecords(): VocabQuizRecord[] {
  return recordsCache ?? []
}

// ---- 备份（TODO 41 分区管线：vocab.json）----

export interface VocabBackupData {
  version: 1
  exportedAt: string
  entries: VocabEntry[]
  sources: VocabSource[]
  records: VocabQuizRecord[]
}

/** 导出（备份 ZIP 的 vocab.json）；从未加载过时先读库 */
export async function exportVocab(): Promise<VocabBackupData> {
  if (!entriesCache || !sourcesCache) await loadVocab()
  if (!recordsCache) {
    const db = await openDB()
    recordsCache = await getAll<VocabQuizRecord>(
      db.transaction(STORE_RECORDS, "readonly").objectStore(STORE_RECORDS),
    )
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: entriesCache ?? [],
    sources: sourcesCache ?? [],
    records: recordsCache ?? [],
  }
}

function normalizeEntry(raw: unknown): VocabEntry | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const word = typeof r.word === "string" ? r.word.trim() : ""
  const definition = typeof r.definition === "string" ? r.definition.trim() : ""
  if (!word || !definition) return null
  const review = (r.review ?? {}) as Record<string, unknown>
  return {
    id: typeof r.id === "string" && r.id ? r.id : `ve_${uid()}`,
    word,
    definition,
    ...(typeof r.sourceId === "string" && r.sourceId ? { sourceId: r.sourceId } : {}),
    createdAt: typeof r.createdAt === "number" ? r.createdAt : Date.now(),
    review: {
      total: typeof review.total === "number" ? review.total : 0,
      ...(typeof review.lastRating === "string" ? { lastRating: review.lastRating as VocabEntry["review"]["lastRating"] } : {}),
      ...(typeof review.lastAt === "number" ? { lastAt: review.lastAt } : {}),
      wrongCount: typeof review.wrongCount === "number" ? review.wrongCount : 0,
    },
  }
}

/**
 * 导入词汇表备份（TODO 41 管线）：
 * - replace：整库覆盖（entries / sources / records 全量替换）
 * - merge：同 id 视为同一条（保留现有）；同 word（trim + 忽略大小写）保留现有；
 *   sources 按 name 去重；sourceId 指向不存在来源的词条置空
 */
export async function importVocab(
  data: unknown,
  mode: "replace" | "merge"
): Promise<{ ok: boolean; entries: number }> {
  if (!data || typeof data !== "object") return { ok: false, entries: 0 }
  const d = data as Record<string, unknown>
  const rawEntries = Array.isArray(d.entries) ? d.entries : []
  const rawSources = Array.isArray(d.sources) ? d.sources : []
  const rawRecords = Array.isArray(d.records) ? d.records : []

  // 来源：按 name 去重（merge 时与现有库一起看）
  const sourceByName = new Map<string, VocabSource>()
  for (const s of mode === "merge" ? (sourcesCache ?? []) : []) {
    if (!sourceByName.has(s.name)) sourceByName.set(s.name, s)
  }
  for (const raw of rawSources) {
    if (!raw || typeof raw !== "object") continue
    const r = raw as Record<string, unknown>
    const name = typeof r.name === "string" ? r.name.trim() : ""
    if (!name || sourceByName.has(name)) continue
    sourceByName.set(name, {
      id: typeof r.id === "string" && r.id ? r.id : `vs_${uid()}`,
      name,
      createdAt: typeof r.createdAt === "number" ? r.createdAt : Date.now(),
    })
  }
  const finalSources = [...sourceByName.values()]
  const validSourceIds = new Set(finalSources.map((s) => s.id))

  // 词条：id 与 wordKey（trim + 忽略大小写）双重去重，O(n)
  const byId = new Map<string, VocabEntry>()
  const wordKeySet = new Set<string>()
  if (mode === "merge") {
    for (const e of entriesCache ?? []) {
      byId.set(e.id, e)
      wordKeySet.add(e.word.trim().toLowerCase())
    }
  }
  for (const raw of rawEntries) {
    const e = normalizeEntry(raw)
    if (!e) continue
    const wordKey = e.word.trim().toLowerCase()
    if (byId.has(e.id) || wordKeySet.has(wordKey)) continue
    if (e.sourceId && !validSourceIds.has(e.sourceId)) {
      delete (e as { sourceId?: string }).sourceId
    }
    byId.set(e.id, e)
    wordKeySet.add(wordKey)
  }
  const finalEntries = sortEntries([...byId.values()])

  // 记录：merge 按 id 去重（保留现有），replace 全量替换
  const recordById = new Map<string, VocabQuizRecord>()
  if (mode === "merge") {
    for (const r of recordsCache ?? []) recordById.set(r.id, r)
  }
  for (const raw of rawRecords) {
    if (!raw || typeof raw !== "object") continue
    const r = raw as VocabQuizRecord
    if (typeof r.id !== "string" || !r.id || recordById.has(r.id)) continue
    recordById.set(r.id, r)
  }
  const records = [...recordById.values()]

  entriesCache = finalEntries
  sourcesCache = finalSources
  recordsCache = records
  const db = await openDB()
  const tx = db.transaction([STORE_ENTRIES, STORE_SOURCES, STORE_RECORDS], "readwrite")
  const entryStore = tx.objectStore(STORE_ENTRIES)
  const sourceStore = tx.objectStore(STORE_SOURCES)
  const recordStore = tx.objectStore(STORE_RECORDS)
  entryStore.clear()
  sourceStore.clear()
  recordStore.clear()
  await putValues(entryStore, finalEntries)
  await putValues(sourceStore, finalSources)
  await putValues(recordStore, records)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  return { ok: true, entries: finalEntries.length }
}
