TODO 1. （状态：已完成）
接入诗歌api (https://poetry.palemoky.com/api/poems/random)，并在 profile dashboard 右下角下面增加小字标注出处 "——《xxx》"

TODO 2. （状态：已完成）
日历里的待办事项、事件安排和mindmap里的日期标注，怎么感觉不是同一套东西？如果确实不是，就保留mindmap的，日历本身的那些，注释掉即可

TODO 3. （状态：待处理）
workspace很久之前写的日历脚本可以入土了，删除相关注释、描述内容

TODO 4. （状态：待处理）
AI Chat 对话页内，右侧边加一个deepseek网页版那样的用户query bar（已经query出去的，点击可以自动滑动到那个对话开始（用户问的位置））
这个bar有什么功能以及怎么才能显示需要用户说明一下

TODO 5. （状态：待处理）
终止了 AI Chat 回复后出现了
## Error Type
Runtime AbortError

## Error Message
signal is aborted without reason


    at stopConversation (lib/ai/request-queue.ts:163:20)
    at useAIChat.useCallback[stop] (lib/ai/use-ai-chat.ts:47:21)

## Code Frame
  161 |   const job = activeJobs.get(conversationId)
  162 |   if (job) {
> 163 |     job.controller.abort()
      |                    ^
  164 |   }
  165 |   const idx = pendingQueue.findIndex((j) => j.conversationId === conversationId)
  166 |   if (idx >= 0) {

Next.js version: 16.2.6 (Turbopack)

TODO 6. （状态：待处理）
AI Chat 里，没有对用户输入内容框/AI输出内容框做单行显示长度限制（最大对话页面的3分之2长度，超出应强制换行）

TODO 7. （状态：待处理）
AI Chat 里，用户输入内容过长/AI输出内容过长超出限定显示范围时出现的horizontal滑条不符合sidebar风格的滑条
考虑将内容溢出出现的滑条的编写规范写到agents.md或其他文档里，问题多次出现了

