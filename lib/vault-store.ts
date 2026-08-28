/**
 * 保险库存储层（IndexedDB）。
 *
 * 仅存放「加密后的 blob」：salt / iv / ciphertext。明文与派生密钥都不落盘，
 * 密钥只存在于 VaultProvider 的内存中。即使拿到本库数据，没有主密码也无法解密。
 *
 * 备份集成：exportVault / importVault 以 base64 形式序列化，供 ZIP 备份打包/恢复
 * （加密数据可直接搬运，无需主密码）。
 */

const DB_NAME = "workspace-vault"
const STORE = "vault"
const DB_VERSION = 1
const RECORD_KEY = "main"

/** 以 ArrayBuffer 为底层缓冲的字节序列（与 lib/crypto.ts 的 Bytes 一致） */
type Bytes = Uint8Array<ArrayBuffer>

export interface VaultBlob {
  salt: Bytes
  iv: Bytes
  ciphertext: Bytes
}

export interface VaultBackup {
  salt: string
  iv: string
  ciphertext: string
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "key" })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** 读取加密 blob；不存在返回 null */
export async function loadVaultBlob(): Promise<VaultBlob | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(RECORD_KEY)
    req.onsuccess = () => {
      const rec = req.result as VaultBlob | undefined
      resolve(rec ?? null)
    }
    req.onerror = () => reject(req.error)
  })
}

/** 写入加密 blob（覆盖同 key） */
export async function saveVaultBlob(blob: VaultBlob): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite")
    tx.objectStore(STORE).put({ key: RECORD_KEY, ...blob })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** 是否存在保险库 */
export async function hasVault(): Promise<boolean> {
  return (await loadVaultBlob()) !== null
}

/** 清空保险库（销毁全部加密数据） */
export async function clearVault(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite")
    tx.objectStore(STORE).delete(RECORD_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** 导出为 base64 备份结构；无保险库返回 null */
export async function exportVault(): Promise<VaultBackup | null> {
  const blob = await loadVaultBlob()
  if (!blob) return null
  return {
    salt: bufToBase64(blob.salt),
    iv: bufToBase64(blob.iv),
    ciphertext: bufToBase64(blob.ciphertext),
  }
}

/** 从 base64 备份结构写入（覆盖本地保险库） */
export async function importVault(b: VaultBackup): Promise<void> {
  await saveVaultBlob({
    salt: base64ToBuf(b.salt),
    iv: base64ToBuf(b.iv),
    ciphertext: base64ToBuf(b.ciphertext),
  })
}

function bufToBase64(bytes: Uint8Array): string {
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToBuf(s: string): Bytes {
  const binary = atob(s)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
