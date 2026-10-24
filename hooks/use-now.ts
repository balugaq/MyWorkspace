"use client"

import { useSyncExternalStore } from "react"

// 模块级缓存快照：useSyncExternalStore 的 getSnapshot 必须稳定，Date.now 裸调会触发「getSnapshot should be cached」
let cachedNow = 0

function getNow(): number {
  if (!cachedNow) cachedNow = Date.now()
  return cachedNow
}

function subscribeMinute(onChange: () => void): () => void {
  cachedNow = Date.now()
  const t = setInterval(() => {
    cachedNow = Date.now()
    onChange()
  }, 60_000)
  return () => clearInterval(t)
}

// 每分钟刷新一次的当前时间戳：给「距今多久」类展示用，替代渲染期直接调 Date.now()（react-hooks/purity）
export function useNow(): number {
  return useSyncExternalStore(subscribeMinute, getNow, () => 0)
}
