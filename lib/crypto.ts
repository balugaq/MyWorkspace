/**
 * AES-256-GCM 对称加密工具（基于 Web Crypto）。
 *
 * 保险库的主密码经 PBKDF2 派生出 AES-256 密钥；明文（JSON 序列化的条目数组）
 * 用 AES-256-GCM 加密，密文 + 随机 salt + 随机 IV 一同落盘到 IndexedDB。
 *
 * 注意：Web Crypto 仅在「安全上下文」（https 或 localhost）下可用；
 * 若在不安全上下文（如直接以 file:// 打开静态产物）调用，会抛出明确错误。
 */

const PBKDF2_ITERATIONS = 150_000

/** 明确以 ArrayBuffer 为底层缓冲的字节序列（满足 Web Crypto 的 BufferSource 约束） */
type Bytes = Uint8Array<ArrayBuffer>

function getSubtle(): SubtleCrypto {
  const c = globalThis.crypto?.subtle
  if (!c) {
    throw new Error("当前环境不支持加密（请在 https 或 localhost 下使用）。")
  }
  return c
}

function randBytes(n: number): Bytes {
  return new Uint8Array(new ArrayBuffer(n))
}

function encodeUtf8(s: string): Bytes {
  const a = new TextEncoder().encode(s)
  const out = randBytes(a.byteLength)
  out.set(a)
  return out
}

/** 生成 16 字节随机 salt（PBKDF2 用） */
export function generateSalt(): Bytes {
  return crypto.getRandomValues(randBytes(16))
}

/** 生成 12 字节随机 IV（AES-GCM 推荐长度） */
export function generateIv(): Bytes {
  return crypto.getRandomValues(randBytes(12))
}

/** 由主密码 + salt 派生 AES-256-GCM 密钥 */
export async function deriveKey(password: string, salt: Bytes): Promise<CryptoKey> {
  const subtle = getSubtle()
  const baseKey = await subtle.importKey(
    "raw",
    encodeUtf8(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  )
  return subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

export interface Encrypted {
  iv: Bytes
  ciphertext: Bytes
}

/** 用派生密钥加密明文字符串，返回随机 IV + 密文 */
export async function encryptText(key: CryptoKey, plaintext: string): Promise<Encrypted> {
  const subtle = getSubtle()
  const iv = generateIv()
  const ct = await subtle.encrypt({ name: "AES-GCM", iv }, key, encodeUtf8(plaintext))
  return { iv, ciphertext: new Uint8Array(ct) }
}

/** 用派生密钥解密，失败时（如密码错误）抛错，由调用方判断 */
export async function decryptText(
  key: CryptoKey,
  iv: Bytes,
  ciphertext: Bytes,
): Promise<string> {
  const subtle = getSubtle()
  const pt = await subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext)
  return new TextDecoder().decode(pt)
}
