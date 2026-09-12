# UI 约定：滚动条 / 溢出 / 限宽

> 本文件沉淀「渲染层」的可复用约定，是 [`AGENTS.md`](../AGENTS.md) 第 3 节「渲染边界 / 样式 / 状态约定」的细化来源。
> 新增任何涉及**滚动、横向溢出、气泡 / 内容限宽**的 UI 前，先读本文。

---

## 1. 滚动条规范：统一「细圆角胶囊」

项目所有原生滚动条走同一套「细圆角胶囊」样式，定义在 `app/globals.css` 的原生滚动条选择器组里（竖轨 10px；滑块用 `--color-border` 圆角胶囊、轨道透明；hover 用 `--color-muted-foreground` 加深）。

**任何会产生滚动的容器，必须满足下面其一**，否则会退化成浏览器原生粗滑条（这正是 TODO 7 的成因）：

1. **挂 `.native-scroll` 类**（推荐，最省事）；或
2. 把该元素选择器写进 `app/globals.css` 的原生滚动条选择器组 —— 共 **5 处**需同步补齐：`scrollbar-width` / `scrollbar-color`、`::-webkit-scrollbar`、`::-webkit-scrollbar-track`、`::-webkit-scrollbar-thumb`、`::-webkit-scrollbar-thumb:hover`。

### 为什么刻意排除 Base UI ScrollArea
`[data-slot^="scroll-area"]` **不要**并入上面这组选择器。Base UI 的 ScrollArea 自带自定义细滑条，若再把原生滚动条样式叠加到它身上，会出现「原生 + 自定义」**双滑条**。需要滚动时优先用挂 `.native-scroll` 的原生容器，而不是在 ScrollArea 上再补原生样式。

### `.native-scroll` 正例清单
`grep -rn "native-scroll" --include=*.tsx .`（业务组件侧，约 13 处）：

| 文件 | 位置 / 用途 |
| --- | --- |
| `components/ai-chat.tsx` | 输入框 `textarea`（L732） |
| `components/global-search.tsx` | 搜索结果列表容器（L113） |
| `components/config-editor-dialog.tsx` | 配置源文本编辑区（L77） |
| `components/ai-skills-dialog.tsx` | 技能列表（L91） |
| `components/ai-personas-dialog.tsx` | 弹窗体 / 人设列表 / 系统提示编辑（L71、L111、L205） |
| `components/ai-models-dialog.tsx` | 模型列表（L101） |
| `components/vault/vault-workspace.tsx` | 保险库多行输入（L278、L365） |
| `components/markdown-view.tsx` | 代码块（L141） |
| `components/richtext/rich-text-editor.tsx` | 编辑器内容区 / 源码编辑区（L200、L210） |

> 行号会随代码演进漂移，以 `grep -rn "native-scroll"` 的实际结果为准。

---

## 2. 纵向可滚动内容区「三件套」

在 `flex` 列里需要「可滚动内容区」时，容器必须**同时**具备：

- `min-h-0`
- `flex-1`
- `overflow-auto`（或 `overflow-y-auto`）

否则会被祖先的 `overflow-hidden` 直接裁切、且不出滚动条（图片预览多图场景踩过此坑）。

---

## 3. 横向溢出优先级

1. **优先软折行**：正文 / 气泡里的超宽内容默认软折行 —— `overflow-wrap: anywhere`（含无空格长串如 URL、CJK 连续串都能强制断行）。
2. **仅这两类允许横向滚动**：代码块 `.rich-text-content pre` 与表格 `.rich-text-content table`。二者的横向滚动条已并入第 1 节的细滑条选择器组，走统一的圆角胶囊样式。

> 二者是**分工，不是二选一**：`overflow-wrap:anywhere` 负责让普通长串折行；`<pre>` / `table` 靠自身 `overflow-x:auto` **内部横滚**。`<pre>` 由 UA 样式表指定 `white-space:pre`，**不会**被外层的 `pre-wrap` 继承覆盖，所以代码块始终不折行。

### ⚠️ 百分比 `max-width` 的包含块陷阱（气泡限宽的真正坑）
`max-w-[66%]` 的解析基准是**它的直接父级容器（消息行）**，**不是**对话区。若父级行的宽度是 `fit-content`，则行宽 = `min(max-content, max(min-content, 可用宽度))`；一旦行内有**不可折行**内容（如 `<pre>`），行的内在 `min-content` 会 > 可用宽度，把行撑开 → `66% × 被撑开的行` **仍然溢出**，对话区照样出横向滚动条。

**解法**：给消息行一个**确定宽度** —— 加 `w-full`（本项目 `components/ai-chat.tsx` 的消息行为 `flex w-full items-start gap-2`）。这样 `66%` 才真正等于对话区的 66%。

**`min-w-0` 治不了它**：`min-w-0` 只影响 **flex 收缩**（`flex-shrink` 的下限），改不了 `fit-content` 的内在尺寸下限。别把它当解法。（该结论来自 2026-09-12 规则生效前的一次布局测量：加 `min-w-0` 仍溢出，加 `w-full` 才修好 —— 属历史记录，**最终仍以宿主目视核验为准**。）

---

## 4. CSS 特异性坑（务必记住）

Tailwind 的任意属性 utility（如 `[overflow-wrap:anywhere]`）是**单类选择器（特异性 0,1,0）**，会被 `.a.b` 形式的**双类选择器（特异性 0,2,0）静默压过** —— 症状是「类名明明写对了、样式却不生效」。

排查「横向溢出 / 换行不生效」时，**由宿主**在浏览器 DevTools 里看 computed style 是不是被某条 `0,2,0` 规则覆盖了（**AI 不得自行开浏览器**，见第 6 节）。本项目历史上的 `.rich-text-content.chat-md-user` 就是这样把 `[overflow-wrap:anywhere]` 压掉的（已于 2026-09-12 移除）。

---

## 5. 气泡限宽约定（AI Chat）

- AI Chat 的**用户气泡与 AI 气泡统一 `max-w-[66%]`**（对话区 2/3），并带 `min-w-0`。
- **气泡所在的「消息行」必须 `w-full`**（见第 3 节的包含块陷阱）—— 否则含代码块的消息仍会横向溢出。
- 气泡内超宽内容**软折行**，不再出现横向滚动条；代码块 / 表格则各自内部横滚（见第 3 节分工）。
- 用户手工换行 / 缩进 / 空行**保留**：气泡内容显式设 `white-space: pre-wrap`（`app/globals.css` 的 `.rich-text-content.chat-md`）。⚠️ 不要依赖「TipTap 默认」，实测气泡内默认 `white-space` 是 `normal`，前导空格会被塌缩。
- **不加移动端断点**：项目无手机使用需求，不做响应式放宽。

---

## 6. 验证方法

- **样式 / 视觉 / 布局类改动**：由**宿主在 `npm run dev` 下目视核验**（AI 禁止自行开浏览器 —— 不得用无头 Edge / Chrome / 任何浏览器自动化代劳）。
- **AI 只负责静态核对**：`npm run typecheck` + `npm run lint` 均 **0 error**，并用 `grep` 确认关键类名 / 选择器真正落地（例：`max-w-[66%]`、`w-full`、`.rich-text-content pre` / `table` 的 5 处滑条选择器、`chat-md-user` 无残留）。
- `grep` 只能证明「规则写对了」，证明不了「布局真的对」—— 所以布局最终以宿主目视为准。
