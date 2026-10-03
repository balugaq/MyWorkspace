# UI 约定：滚动条 / 溢出 / 限宽

> 本文件沉淀「渲染层」的可复用约定，是 [`AGENTS.md`](../AGENTS.md) 第 3 节「渲染边界 / 样式 / 状态约定」的细化来源。
> 新增任何涉及**滚动、横向溢出、气泡 / 内容限宽**的 UI 前，先读本文。

---

## 1. 滚动条规范：统一「细圆角胶囊」

项目所有原生滚动条走同一套「细圆角胶囊」样式，定义在 `app/globals.css` 的原生滚动条选择器组里（竖轨 10px；滑块用 `--color-border` 圆角胶囊、轨道透明；hover 用 `--color-muted-foreground` 加深）。

**任何会产生滚动的容器，必须满足下面其一**，否则会退化成浏览器原生粗滑条（这正是 TODO 7 的成因）：

1. **挂 `.native-scroll` 类**（推荐，最省事）；或
2. 把该元素选择器写进 `app/globals.css` 的原生滚动条选择器组 —— 共 **5 处**需同步补齐：`scrollbar-width` / `scrollbar-color`、`::-webkit-scrollbar`、`::-webkit-scrollbar-track`、`::-webkit-scrollbar-thumb`、`::-webkit-scrollbar-thumb:hover`。

### Chrome 121+ 陷阱：标准属性会禁用 `::-webkit-scrollbar`
`scrollbar-width` / `scrollbar-color` 标准属性一旦设置，Chrome 会**整体禁用** `::-webkit-scrollbar` 系伪元素、改用系统标准渲染（thin **直角**条，不是圆角胶囊）。因此内容容器（`.native-scroll` / `textarea` / pre / table）**只走 `::-webkit-scrollbar` 胶囊**，标准属性仅保留给页面级 `html` / `body`。给新容器补样式时同样不要给它加标准属性，否则胶囊失效、退化成系统直角条。

**继承陷阱（2026-10-03，TODO 46.1 实测踩中）**：这两个标准属性是**继承属性**——`html`/`body` 上的值会继承到所有后代，继承来的非 auto 计算值**同样触发**上述禁用（DevTools Computed 里能看到后代的 `scrollbar-color` 非 auto、来源标注「继承自 html」）。因此内容容器组在 `globals.css` 里显式重置 `scrollbar-width: auto; scrollbar-color: auto;` 切断继承；Firefox 不认 webkit 胶囊，经 `@-moz-document url-prefix()`（Chromium 忽略）回落 `thin` + 主题色。新增内容容器类型时，**两处都要同步补**。

### 为什么刻意排除 Base UI ScrollArea
`[data-slot^="scroll-area"]` **不要**并入上面这组选择器。Base UI 的 ScrollArea 自带自定义细滑条，若再把原生滚动条样式叠加到它身上，会出现「原生 + 自定义」**双滑条**。需要滚动时优先用挂 `.native-scroll` 的原生容器，而不是在 ScrollArea 上再补原生样式。

### `.native-scroll` 正例清单
`grep -rn "native-scroll" --include=*.tsx .`（业务组件侧，约 13 处）：

| 文件 | 位置 / 用途 |
| --- | --- |
| `components/ai-chat.tsx` | 输入框 `textarea` |
| `components/global-search.tsx` | 搜索结果列表容器 |
| `components/config-editor-dialog.tsx` | 配置源文本编辑区 |
| `components/ai-skills-dialog.tsx` | 技能列表 |
| `components/ai-personas-dialog.tsx` | 弹窗体 / 人设列表 / 系统提示编辑 |
| `components/ai-models-dialog.tsx` | 模型列表 |
| `components/vault/vault-workspace.tsx` | 保险库多行输入 |
| `components/markdown-view.tsx` | 代码块 |
| `components/richtext/rich-text-editor.tsx` | 编辑器内容区 / 源码编辑区 |
| `components/github-queue-workspace.tsx` | 四列看板滚动区 / 列内卡片滚动区（TODO 46.1 补记，46.2 重写时已挂） |

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

## 7. 右键菜单：外壳与功能分离（TODO 50，主人明确要求）

右键 ContextMenu 分两层，**新接入点不要把逻辑写在菜单 JSX 里**：

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 功能层 | `lib/text-menu-actions.ts` | 定义 `TextMenuContext`（宿主能力接口：editable / getSelectedText / copy / cut / paste / selectAll / onAi）与 `TextMenuAction`（isAvailable + run），内置动作组 `BUILTIN_TEXT_MENU_ACTIONS`：剪切 → 复制 → 粘贴 → 全选 → AI。不知道任何 UI。 |
| 外壳层 | `components/text-context-menu.tsx` | `TextContextMenu`：**自绘轻量浮层**（portal 到 body，不用 base-ui ContextMenu/Menu），按 `isAvailable` 过滤，AI 项前自动加分隔线，run 失败 toast。不含业务逻辑。 |

接入步骤（参考 `components/richtext/rich-text-editor.tsx` 的 visualCtx / sourceCtx）：

1. 为自己的文本宿主实现 `TextMenuContext`——**所有回调必须是闭包实时读取状态**（editor.state / textarea ref），不要传选区字符串快照（选区变化不触发 React 渲染，快照会过期）；
2. `<TextContextMenu ctx={...}>` 包住目标区域，把原布局类挪到外壳 `className`；
3. 「AI」项只在宿主传了 `onAi` 时出现（如随笔编辑器传入 → 新建 AI 会话分析选段；只读文档、日历笔记不传 → 不出现）；
4. 剪切/粘贴仅在 `ctx.editable && 宿主提供了对应回调` 时出现（只读文档天然只有复制/全选）；
5. 需要自定义动作组（如日历格的「今天放假/今天上班」）时传 `actions` 覆盖默认组，或在该场景继续用裸 ContextMenu——功能层不强制。

其他要点：

- 粘贴用 `navigator.clipboard.readText()`（用户手势内调用），失败由外壳层 toast「剪贴板不可用或权限被拒」；
- **焦点协议（重要，三次打磨后定稿）**：**不要用 base-ui ContextMenu/Menu 承载文字右键菜单**——它是 modal 焦点陷阱，打开即夺走编辑器焦点，点击菜单项时的焦点操作被陷阱拉回，`select()`/`setRangeText` 等选区操作在失焦元素上全部落空（挂起延迟执行、finalFocus、setTimeout 抢焦点三种方案都试过，均被关闭流程竞速或时序问题击败）。自绘浮层的核心手法：**菜单容器 `onMouseDown={(e) => e.preventDefault()}`**——点击菜单项时焦点根本不离开编辑器，动作可立即执行、选区全程可见。其它要点：
  - isAvailable 在打开瞬间（setState 触发的重渲染）求值，依赖选区的项必须走 `ctx.getSelectedText()`，并带「有选区」条件（空白处不出现剪切/复制/AI；粘贴/全选只看 editable）；
  - 全局 capture 监听负责关闭：菜单外 mousedown / 别处右键（先 close，编辑器 onContextMenu 随后重开）/ Esc / 滚动缩放；
  - 浮层 portal 到 body + `fixed` 定位，渲染后测量尺寸 clamp 进视口；
  - **宿主拿 textarea/滚动内容 DOM 的引用时，别直接写 `ref`**：`NativeScrollArea` 会 `cloneElement` 给子元素注入自己的 `scrollRef`，覆盖子元素 ref（React 19 ref 即 prop）——改为在子元素的 `onContextMenu`（或其它既有事件）里同步记录 `e.currentTarget`，右键瞬间必先于菜单求值；
  - **textarea 的剪切/粘贴要用 `document.execCommand("cut"/"insertText")`**：与 Ctrl+X/V 同语义、**进浏览器撤销栈（可 Ctrl+Z）**；`setRangeText` 是程序化修改不进撤销栈，只作 execCommand 失败时的兜底。TipTap 场景无此问题（`deleteSelection`/`insertText` 走 ProseMirror history）；
  - TipTap 粘贴纯文本用 `tr.insertText`，**不要用 `insertContent(string)`**（字符串会被当 HTML 解析）；
  - 富文本复制统一走 `components/richtext/clipboard.ts` 的 `copySelectionRich`（HTML + 纯文本双写，失败回落纯文本），浮动工具条与右键菜单共用。

---

## 8. 验证方法

- **样式 / 视觉 / 布局类改动**：由**宿主在 `npm run dev` 下目视核验**（AI 禁止自行开浏览器 —— 不得用无头 Edge / Chrome / 任何浏览器自动化代劳）。
- **AI 只负责静态核对**：`npm run typecheck` + `npm run lint` 均 **0 error**，并用 `grep` 确认关键类名 / 选择器真正落地（例：`max-w-[66%]`、`w-full`、`.rich-text-content pre` / `table` 的 5 处滑条选择器、`chat-md-user` 无残留）。
- `grep` 只能证明「规则写对了」，证明不了「布局真的对」—— 所以布局最终以宿主目视为准。
