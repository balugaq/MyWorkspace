// useAIChat：AI 对话的 React 钩子。流式请求的实际所有权在 lib/ai/request-queue.ts（模块级单例），
// 本钩子只负责把组件与队列连接起来：通过 useSyncExternalStore 订阅队列的 live 消息与进行中状态，
// 并把 send/stop 委托给队列。这样切换会话 / 切走视图都不会中断在途请求。

"use client"

import { useCallback, useSyncExternalStore } from "react"

import {
  enqueue,
  stopConversation,
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

  return { messages, isLoading, send, stop }
}
