"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { deriveKey, encryptText, decryptText, generateSalt } from "@/lib/crypto"
import {
  loadVaultBlob,
  saveVaultBlob,
  hasVault,
  clearVault,
} from "@/lib/vault-store"

export interface VaultEntry {
  id: string
  name: string // 用户自定义字段名（如「微博」「恢复码」）
  value: string // 用户自由填写的值（账号/密码/混合内容等）
  createdAt: number
  updatedAt: number
}

type Status = "loading" | "no-vault" | "locked" | "unlocked"

interface VaultContextValue {
  status: Status
  entries: VaultEntry[]
  error: string | null
  busy: boolean
  create: (password: string) => Promise<void>
  unlock: (password: string) => Promise<void>
  lock: () => void
  addEntry: (name: string, value: string) => Promise<void>
  updateEntry: (
    id: string,
    patch: Partial<Pick<VaultEntry, "name" | "value">>,
  ) => Promise<void>
  removeEntry: (id: string) => Promise<void>
  changePassword: (newPassword: string) => Promise<void>
  destroy: () => Promise<void>
}

const VaultContext = createContext<VaultContextValue | null>(null)

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext)
  if (!ctx) throw new Error("useVault 必须在 VaultProvider 内使用")
  return ctx
}

const newId = () => Math.random().toString(36).slice(2, 10)

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading")
  const [entries, setEntries] = useState<VaultEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // 密钥与 salt 仅驻留内存，绝不落盘
  const keyRef = useRef<CryptoKey | null>(null)
  const saltRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
  // 镜像最新条目，避免异步操作中闭包拿到过期 entries
  const entriesRef = useRef<VaultEntry[]>([])

  useEffect(() => {
    entriesRef.current = entries
  }, [entries])

  useEffect(() => {
    let active = true
    hasVault()
      .then((has) => {
        if (active) setStatus(has ? "locked" : "no-vault")
      })
      .catch(() => {
        if (active) setStatus("no-vault")
      })
    return () => {
      active = false
    }
  }, [])

  const persist = useCallback(async (next: VaultEntry[]) => {
    const key = keyRef.current
    const salt = saltRef.current
    if (!key || !salt) throw new Error("保险库未解锁")
    const { iv, ciphertext } = await encryptText(key, JSON.stringify(next))
    await saveVaultBlob({ salt, iv, ciphertext })
  }, [])

  const create = useCallback(async (password: string) => {
    setBusy(true)
    setError(null)
    try {
      const salt = generateSalt()
      const key = await deriveKey(password, salt)
      keyRef.current = key
      saltRef.current = salt
      const empty: VaultEntry[] = []
      const { iv, ciphertext } = await encryptText(key, JSON.stringify(empty))
      await saveVaultBlob({ salt, iv, ciphertext })
      entriesRef.current = empty
      setEntries(empty)
      setStatus("unlocked")
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败")
    } finally {
      setBusy(false)
    }
  }, [])

  const unlock = useCallback(async (password: string) => {
    setBusy(true)
    setError(null)
    try {
      const blob = await loadVaultBlob()
      if (!blob) throw new Error("保险库不存在")
      const key = await deriveKey(password, blob.salt)
      // 用解密验证密码是否正确；AES-GCM 校验失败会抛错
      let plain: string
      try {
        plain = await decryptText(key, blob.iv, blob.ciphertext)
      } catch {
        throw new Error("主密码错误")
      }
      keyRef.current = key
      saltRef.current = blob.salt
      const parsed = JSON.parse(plain) as VaultEntry[]
      const next = Array.isArray(parsed) ? parsed : []
      entriesRef.current = next
      setEntries(next)
      setStatus("unlocked")
    } catch (e) {
      setError(e instanceof Error ? e.message : "解锁失败")
    } finally {
      setBusy(false)
    }
  }, [])

  const lock = useCallback(() => {
    keyRef.current = null
    saltRef.current = null
    entriesRef.current = []
    setEntries([])
    setError(null)
    setStatus("locked")
  }, [])

  // 空闲自动锁定：解锁后 3 分钟无操作自动 lock()
  const IDLE_MS = 3 * 60 * 1000
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resetIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => lock(), IDLE_MS)
  }, [lock])

  useEffect(() => {
    if (status !== "unlocked") return
    const events = [
      "mousemove",
      "mousedown",
      "keydown",
      "click",
      "scroll",
      "touchstart",
      "wheel",
    ] as const
    events.forEach((e) => window.addEventListener(e, resetIdle, { passive: true }))
    resetIdle()
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetIdle))
      if (idleTimer.current) clearTimeout(idleTimer.current)
    }
  }, [status, resetIdle])

  const addEntry = useCallback(async (name: string, value: string) => {
    setBusy(true)
    setError(null)
    try {
      const next: VaultEntry[] = [
        ...entriesRef.current,
        { id: newId(), name, value, createdAt: Date.now(), updatedAt: Date.now() },
      ]
      await persist(next)
      entriesRef.current = next
      setEntries(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : "添加失败")
    } finally {
      setBusy(false)
    }
  }, [persist])

  const updateEntry = useCallback(
    async (id: string, patch: Partial<Pick<VaultEntry, "name" | "value">>) => {
      setBusy(true)
      setError(null)
      try {
        const next = entriesRef.current.map((e) =>
          e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e,
        )
        await persist(next)
        entriesRef.current = next
        setEntries(next)
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存失败")
      } finally {
        setBusy(false)
      }
    },
    [persist],
  )

  const removeEntry = useCallback(
    async (id: string) => {
      setBusy(true)
      setError(null)
      try {
        const next = entriesRef.current.filter((e) => e.id !== id)
        await persist(next)
        entriesRef.current = next
        setEntries(next)
      } catch (e) {
        setError(e instanceof Error ? e.message : "删除失败")
      } finally {
        setBusy(false)
      }
    },
    [persist],
  )

  const changePassword = useCallback(
    async (newPassword: string) => {
      setBusy(true)
      setError(null)
      try {
        const salt = generateSalt()
        const key = await deriveKey(newPassword, salt)
        const { iv, ciphertext } = await encryptText(
          key,
          JSON.stringify(entriesRef.current),
        )
        keyRef.current = key
        saltRef.current = salt
        await saveVaultBlob({ salt, iv, ciphertext })
      } catch (e) {
        setError(e instanceof Error ? e.message : "修改密码失败")
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  const destroy = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await clearVault()
      keyRef.current = null
      saltRef.current = null
      entriesRef.current = []
      setEntries([])
      setStatus("no-vault")
    } catch (e) {
      setError(e instanceof Error ? e.message : "销毁失败")
    } finally {
      setBusy(false)
    }
  }, [])

  const value: VaultContextValue = {
    status,
    entries,
    error,
    busy,
    create,
    unlock,
    lock,
    addEntry,
    updateEntry,
    removeEntry,
    changePassword,
    destroy,
  }

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}
