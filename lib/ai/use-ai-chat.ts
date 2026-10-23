// useAIChat：AI 对话的 React 钩子，只负责把组件接到 lib/ai/request-queue.ts（模块级单例）：
// 经 useSyncExternalStore 订阅 live 消息与状态，send/stop 委托给队列——切换会话/视图不中断在途请求。

"use client"

import { useCallback, useSyncExternalStore } from "react"

import {
  enqueue,
  stopConversation,
  regenerate,
  subscribeQueue,
  getMessagesSnapshot,
  isWorking,
  type AIChatConfig,
} from "./request-queue"

export type { AIChatConfig }

export function useAIChat({
  config,
  conversationId,
}: {
  config: AIChatConfig | null
  conversationId: string
}) {
  const messages = useSyncExternalStore(
    subscribeQueue,
    () => getMessagesSnapshot(conversationId),
    () => getMessagesSnapshot(conversationId),
  )
  const isLoading = useSyncExternalStore(
    subscribeQueue,
    () => isWorking(conversationId),
    () => false,
  )

  const send = useCallback(
    (input: string) => {
      if (!config) return
      enqueue(conversationId, input, config)
    },
    [conversationId, config],
  )
  const stop = useCallback(() => {
    stopConversation(conversationId)
  }, [conversationId])
  const regenerateLast = useCallback(() => {
    if (!config) return
    regenerate(conversationId, config)
  }, [conversationId, config])

  return { messages, isLoading, send, stop, regenerateLast }
}
