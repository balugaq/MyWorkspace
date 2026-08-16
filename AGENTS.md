# AGENTS.md — 我的全能工作台 (My Omnipotent Workspace) 操作宪章

> 本文件是 AI 编程助手与本仓库开发者的**操作契约**。所有改动（代码、构建、文档）均须遵守本文约定；
> 当本文与代码冲突时，按末尾《文档更新契约》处理。

## TL;DR（太长了不看）

1. 本仓库是 **Next.js 16（App Router）+ React 19 + TypeScript 严格模式** 的个人工作台（思维导图 Todo / 分类笔记 / 日历日程），所有改动必须通过 `npm run typecheck` 与 `npm run lint` **均 0 错误**后才能视为完成。
2. 状态集中在 `lib/store.ts` 的 Zustand store（localStorage 持久化）；**禁止**到处散落本地 state 承载应属于 store 的数据。新增功能优先复用 `app/` 与 `components/` 既有模块。
3. 本机直接在当前分支开发（个人仓库），提交信息遵循 Conventional Commits（`feat:` / `fix:` / `docs:` / `refactor:` / `chore:`）。

---

## 1. 项目身份与边界

| 维度        | 事实                                                                                                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 定位        | 纯前端个人工作台，集思维导图式 Todo、分类笔记（小说/学习/工作/生活）、日历日程于一体；数据存于浏览器 localStorage                                                                        |
| 技术栈      | Next.js 16.2.6（App Router + **static export**）、React 19、TypeScript 严格模式、Tailwind CSS v4、shadcn/ui（底层 `@base-ui/react`）、Zustand、`@xyflow/react`（React Flow）、`date-fns` |
| 入口        | `app/page.tsx`（主布局：桌面/移动侧边栏 + 主工作区分发）；`app/layout.tsx`（字体/主题/Toaster）                                                                                          |
| 状态        | `lib/store.ts` —— `useWorkspace`（Zustand + persist），含分类/章节/思维导图节点与连线/日历/系统设置                                                                                      |
| 部署        | 纯静态站点（`output: "export"`），`next build` 产出 `out/`，`scripts/serve-static.mjs` 零依赖本地托管                                                                                    |
| AI 职责范围 | 功能开发、Bug 修复、组件/状态重构、构建/脚本维护、文档维护                                                                                                                               |
| AI 不负责   | 发布到公网、推送远程仓库（推送动作由开发者执行）                                                                                                                                         |

### 1.1 关键目录地图（改代码前先定位）

| 路径                  | 职责                                                                                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/page.tsx`        | 一级路由页面：顶栏、侧边栏（桌面/移动）、主工作区分发（calendar / relation / novel / 空态）、状态栏、全局搜索与设置弹窗                                                                            |
| `app/layout.tsx`      | 根布局：Google 字体（Noto Sans/Serif SC）、`ThemeProvider`、`Toaster`                                                                                                                              |
| `app/globals.css`     | Tailwind 入口 + 主题 token（含自定义 `--solution` / `--warning` / `--chart-*`）                                                                                                                    |
| `components/`         | 工作区与业务组件：`app-sidebar`、`topbar`、`novel-workspace`、`mindmap-workspace`、`calendar-workspace`、`global-search`、`settings-dialog`、`add-category-dialog`、`status-bar`、`theme-provider` |
| `components/mindmap/` | 思维导图子组件：`nodes.tsx`（Todo/解决方案节点卡片）、`node-inspector.tsx`（节点详情编辑）                                                                                                         |
| `components/ui/`      | shadcn 基础组件（Button、Dialog、Sheet、Select、Badge…在此可复用）                                                                                                                                 |
| `hooks/`              | 自定义 hooks（如 `use-global-shortcuts.ts` 全局快捷键）                                                                                                                                            |
| `lib/`                | 纯逻辑层：`store.ts`（状态）、`types.ts`（全部数据模型 + 模板/快捷键/状态元信息）、`search.ts`（搜索）、`icons.tsx`（图标映射）、`utils.ts`                                                        |
| `scripts/`            | 本地部署脚本（`serve-static.mjs`）                                                                                                                                                                 |
| `docs/CODING_PLAN.md` | 功能规划与推进记录（规格书对齐、P0–P4 优先级）                                                                                                                                                     |

---

## 2. 技术栈与项目结构（事实核对）

- **框架**：Next.js 16.2.6，App Router，`app/` 约定式目录。写代码前先查本仓库 `node_modules/next/dist/docs/` 或阅读相关源码确认本版本 API（本版本与旧版 Next 存在破坏性差异）。
- **渲染边界**：`app/layout.tsx` 是 Server Component；`app/page.tsx` 及其下所有工作区组件均为 `"use client"`。**新增交互组件默认 `"use client"`**；不要在客户端组件里做 SSR 专属操作。
- **样式**：Tailwind v4（`@import "tailwindcss"`）。自定义颜色经由 `globals.css` 的 `--color-*` token 暴露（如 `bg-solution`、`text-warning`、`bg-chart-3`）。**只在 `globals.css` 定义 token**，业务组件用 `bg-<token>` 类名即可。
- **状态管理**：`lib/store.ts` 单一 store `useWorkspace`，`persist` 中间件写入 localStorage（key `my-omni-workspace`）。存储结构见 `lib/types.ts`。
- **UI 组件**：shadcn/ui 基于 `@base-ui/react`。**注意 base-ui 的 `Trigger` 渲染自定义元素用 `render` prop，不是 Radix 的 `asChild`**；属性选择器如展开态用 `data-popup-open` 而非 `data-[state=open]`。详见 AppSidebar 的 Dropdown 示例。
- **思维导图**：`@xyflow/react`；节点类型 `todo` / `solution` 定义于 `components/mindmap/nodes.tsx`；连线语义（`flow` / `sub` / 解决方案绿线）见 `lib/types.ts` 的 `MindEdge`。
- **构建/校验**：`next build`（产出 `out/` 静态站点）、`tsc --noEmit`（typecheck）、`eslint`（lint）。`output: "export"` 使 `next build` 不再产出服务端 `next start` 产物。
- **脚本**：`npm run dev`（开发）、`npm run deploy`（= `next build`）、`npm run serve`（本地静态托管）、`npm run deploy:local`（构建并静态托管）。

---

## 3. 决策树：当遇到 A 时，执行 B

### 3.1 新增/修改一个分类工作区或模板

- **当需要新增一种“模板类型”时**：在 `lib/types.ts` 的 `TemplateType` 联合类型与 `TEMPLATES` 元信息中加入类型与展示项，然后在 `app/page.tsx` 的分发逻辑（现有：`relation` → Mindmap，其余 → Novel）中按需新增分支，并提供对应 workspace 组件。
- **当需要新增分类的展示/编辑交互时**：新增业务组件到 `components/`，通过 `useWorkspace` 的 action 读写 store；复用 `components/ui/*` 基础组件，不重造轮子。
- **当需要分类数据的新字段时**：在 `lib/types.ts` 的类型上加字段，再在 `lib/store.ts` 对应 action 中维护；**不要**在组件内用 `useState` 承载持久化字段。

### 3.2 状态管理

- **当某个状态需要跨组件/跨视图共享或持久化时**：放入 `lib/store.ts` 的 `useWorkspace`（尤其：分类列表、日历数据、当前激活分类/条目、视图、系统设置、弹窗开关）。
- **当只是首次编辑某个字段、无需持久化时**：可用组件内 `useState`（如弹窗临时输入、快捷键录音状态）。
- **当需要新增 store 字段/action 时**：同时在 `WorkspaceState` 接口与 `create()` 实现处同步；沿用现有“不可变更新 + `set`”模式；必要时在 `merge`/`onRehydrateStorage` 里做向后兼容（如历史数据缺 `settings` 时并入默认值）。

### 3.3 文案与国际化

- **本应用为纯中文界面，文案直接以中文字符串写在 JSX/组件中**；暂无语言文件体系。若未来引入多语言，再统一抽出。
- **不要**在代码里制造与 UI 文字重复的常量表（如 `STATUS_META` 已提供 `doing/paused/done` 展示文案，直接用，别硬编码“进行中/暂停/已完成”）。

### 3.4 数据与本地存储

- **用户数据（分类/章节/节点/日历）只经 store 持久化**；`exportData()` / `importData(json)` 提供 JSON 备份（设置弹窗“数据备份”分区）。
- **不要**直接读写 `localStorage` 绕过 store；不要散落独立的 `key` 常量。

### 3.5 搜索

- **搜索逻辑统一走 `lib/search.ts` 的 `runSearch(...)`**；结果模型见 `lib/types.ts` 的 `SearchResult`。新增可搜索内容时，在 `runSearch` 对应分支出追加命中规则，并在 `components/global-search.tsx` 注册类型图标/跳转行为。

### 3.6 快捷键

- **全局快捷键统一走 `hooks/use-global-shortcuts.ts`**，绑定存于 `store.settings.shortcuts`，可在设置界面修改；`page.tsx` 只监听 `dsh:open-search` 等事件。
- **不要在多个组件里重复注册 `window` keydown 监听**；需要新的全局快捷键时，在 `lib/types.ts` 的 `SHORTCUT_META` 增加动作与默认绑定，并在 `useGlobalShortcuts` 里接线。

### 3.7 构建/脚本

- **当需要新增 npm scripts 或脚本时**：保持零依赖原则（用 Node 内置模块），加在 `package.json` `scripts`，必要时补充 `scripts/` 下脚本并在本文件记录。
- **当 `next build` 报错时**：先定位是代码问题还是字体/环境问题；本仓库 `output: "export"`，验收通过三件套：`npm run typecheck`、`npm run lint`、（在开发机上）`npm run build`。
- **当需要验证本地部署时**：`npm run deploy:local`；或先 `npm run build` 再 `npm run serve`。

### 3.8 提交与推送

- **提交前自检**：`npm run typecheck` 与 `npm run lint` 均 0 错误；只提交相关文件（不提交 `node_modules/`、`.next/`、`out/`、`.npm-cache/`）。
- **推送**：推送到本仓库当前分支即可；发布/部署到公网的动作由开发者执行。

---

## 4. 红线（绝对禁止操作）

> 违反以下任一条都属于严重事故。AI 在执行任务时若发现可能触碰红线，必须停下并向开发者说明。

1. **禁止破坏用户已有本地数据**：不得改动 `lib/types.ts` 中已发布数据结构的 key/字段来“迁移数据”，导致旧 localStorage 读取异常；如需改动，必须在 `store.ts` 的 `merge` 中做向后兼容。
2. **禁止 `git push -f` 或改写共享历史**：禁止 force push、rebase 改写、`git reset --hard` 后强推。
3. **禁止未通过校验就提交**：任何改动提交前必须 `npm run typecheck` + `npm run lint` 通过；禁止用跳过类型等绕过方式。
4. **禁止绕过 store 直接改持久化状态**：数据写到组件本地 state 且不同步 store，会导致刷新丢失/多视图不同步。
5. **禁止在 Server Component 中引入浏览器 API / 混用 `"use client"` 组件错误**：交互组件必须声明 `"use client"`。
6. **禁止硬编码 base-ui 的 Radix 旧语法**：不得在 `components/ui/*` 之上再叠加 `asChild` / `data-[state=open]` 这类旧版写法（会编译失败）。

---

## 5. 质量规范

- **TypeScript 严格模式**：新代码类型完备，不得引入 `any` 逃逸（确有需要时限定最小范围并注释理由）。
- **组件可复用**：基础能力放 `components/ui/*`；跨页面业务组件放 `components/`；纯逻辑放 `lib/`。
- **数据流清晰**：单向由 store → 组件；组件回调调用 store action；不搞组件间私相传递可持久化状态。
- **可编译性**：每个改动都是一个“能通过 typecheck/lint、逻辑自洽”的完整状态，不留半成品/死代码/未使用 import（lint 会拦截）。
- **响应式**：桌面用 `md:` 布局切换，移动端已有侧边栏抽屉（`app/page.tsx` 的 `Sheet`），新增工作区时应保持 `min-w-0` / `flex-1` 可收缩、避免横向溢出。
- **不擅自引入新依赖/linter/格式化器**：如需新增 npm 依赖，先说明理由并征得同意（如 `flexsearch`、`dexie` 等尚未引入）。

---

## 6. 常用命令速查表

| 场景                       | 命令                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------ |
| 开发服务器                 | `npm run dev`                                                                        |
| 生产静态构建               | `npm run deploy`（= `next build`，产出 `out/`）                                      |
| 本地静态托管               | `npm run serve`（默认 `http://127.0.0.1:3000`，可用 `npm run serve -- 8080` 改端口） |
| 构建并托管（一键本地部署） | `npm run deploy:local`                                                               |
| 类型检查（必须 0 错误）    | `npm run typecheck`（=`tsc --noEmit`）                                               |
| 代码检查（必须 0 错误）    | `npm run lint`（=`eslint`）                                                          |
| 代码格式化                 | `npm run format`（=`prettier --write`）                                              |
| 进仓库验收三件套           | `npm run typecheck && npm run lint`（开发机再加 `npm run build`）                    |

---

## 7. Git 工作流

- **分支**：本地当前分支直接开发，不建长命分支；发布/推送远程由开发者执行。
- **提交信息**：Conventional Commits，格式 `type(scope): 描述`，中英文均可：
  - `feat:` 新功能
  - `fix:` Bug 修复
  - `docs:` 文档（含本文件）
  - `refactor:` 重构（行为不变）
  - `chore:` 构建/依赖/杂务
  - 例：`feat(calendar): 新增月视图已完成统计`
- **提交前自检清单**：
  1. `npm run typecheck` 与 `npm run lint` 均 0 错误；
  2. 未触碰第 4 节红线；
  3. 只提交相关文件（不提交 `node_modules/`、`.next/`、`out/`、`.npm-cache/`、`.tsbuildinfo`）。

---

## 8. 核心模块 API 速查与 Contract

> 本节为手写速查，帮助在写代码时快速定位常见能力，不必逐个翻源码。

### 8.1 `lib/types.ts` — 数据模型（只读常量与类型）

| 项                                               | 说明                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `TemplateType`                                   | `"novel" \| "study" \| "work" \| "life" \| "relation" \| "calendar" \| "custom"`                 |
| `Category` / `CategoryConfig`                    | 一个分类；`relation` 模板携带 `relation`，其余携带 `chapters`                                    |
| `Chapter`                                        | 小说/通用条目：`{ id, index, title, content, tags, done? }`                                      |
| `MindNode` / `MindEdge`                          | 思维导图节点（cause/leadTo/result/sub/solution/position）与连线                                  |
| `RelationContent`                                | `{ nodes, edges, view: "mindmap"\|"list" }`                                                      |
| `CalendarData`                                   | `Record<"yyyy-MM-dd", CalendarDay>`                                                              |
| `Settings` / `ShortcutBinding` / `SHORTCUT_META` | 系统设置 / 快捷键绑定与元信息                                                                    |
| `TEMPLATES` / `STATUS_META`                      | 模板列表 / 解决方案状态展示文案                                                                  |
| Contract                                         | 以上为**类型与常量**；常量（`TEMPLATES`、`STATUS_META`、`DEFAULT_SETTINGS`）只读，禁止运行时修改 |

### 8.2 `lib/store.ts` — `useWorkspace`（Zustand + persist）

- 状态：`categories`、`calendar`、`activeCategoryId`、`activeItemId`、`view`、`selectedDate`、`settings`、`addCategoryOpen`、`settingsOpen`。
- 常用 action：
  - 分类：`addCategory(name, template, config, count?)`（关系类建画布，novel 建 `count` 个编号篇目，返回新 id）、`removeCategory`、`renameCategory`、`setActiveCategory`、`setActiveItem`、`goCalendar`、`setSelectedDate`。
  - 章节：`addChapter` / `updateChapter` / `removeChapter`。
  - 思维导图：`addNode`（返回新 id）、`updateNode`、`removeNode`、`setNodeSolution`、`connectNodes`、`removeEdge`、`removeSub`、`setRelationView`。`connectNodes(…, "sub")` 会同步把 target 写入 source 的 `sub` 数组；`removeEdge` / `removeNode` / `removeSub` 均会清理相关 `sub` 引用。
  - 日历：`setDayNote`、`addCalendarTodo`、`toggleCalendarTodo`、`removeCalendarTodo`、`addCalendarEvent`、`removeCalendarEvent`。
  - 设置/备份：`updateSettings`、`setShortcut`、`setAddCategoryOpen`、`setSettingsOpen`、`exportData`、`importData`（会一并恢复 `settings`）。
- Contract：**所有 action 走不可变更新**；`addCategory` / `addNode` 返回新建 id（调用方可据此设激活）。不要在组件里 `set()` store 之外再手动 reset 同级状态。节点折叠/展开是纯视图态，用组件内 `useState`，不入 store。

### 8.3 `components/ui/*` 使用注意（base-ui）

- 组合式组件（`Dialog`、`Sheet`、`DropdownMenu`、`Select`、`AlertDialog`、`Collapsible`、`Popover`、`Tooltip`…）已在 `components/ui/` 封装好，直接按既有用法使用。
- **`Select`**：受控用 `value` + `onValueChange`（回调可能回 `null`，需判空）包裹 `SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem`。
- **`DropdownMenuTrigger` 等 Trigger 渲染自定义元素**：用 `render={<Button …/>}`，子元素作为内容；展开态样式用 `data-popup-open:`。

### 8.4 快捷键（`hooks/use-global-shortcuts.ts`）

- `useGlobalShortcuts()` 在顶层（`app/page.tsx`）调用一次，读取 `settings.shortcuts` 注册全局 keydown；`matchShortcut(e, binding)` 判定命中（忽略 Shift/Alt，Ctrl/Cmd 记 modifier）。
- 动作：`newCategory`（开新建弹窗）、`goCalendar`（切日历）、`search`（`dispatchEvent(new CustomEvent("dsh:open-search"))`，由 `page.tsx` 监听打开搜索弹窗）。
- 绑定默认：`Ctrl+N / Ctrl+B / Ctrl+K`，可在设置界面录制/重置。

---

## 9. AI 对用户的回答规范

- **先一句话回答**：回答开头用一句话说清“我做了什么/结论是什么”。
- **再简短补充**：只补充代码/文件里看不出来的信息——决策依据、取舍、待确认事项、风险点。
- **不重复“代码可说明”的内容**：不要把刚写进代码/文档的东西再抄一遍（完整代码片段、逐条复述文档、重复列方法签名等）；用户直接查看改动文件即可获得细节。
- **保持简短**：除非用户明确要求详细讲解，回答控制在几句话内。

---

## 10. 文档更新契约

1. **冲突即提示**：当 AI 发现本文与代码不一致时（例如：Next 版本、目录结构、校验命令、部署方式与本文描述不符），**必须**在回复中主动指出冲突，并说明应以代码为准还是更新本文。
2. **惯例沉淀**：当本次任务产生新的、可复用的约定（新的状态管理模式、新的组件复用规范、新的脚本/部署约定）时，AI 应提议将其补充进本文对应章节（先提议，经开发者确认后修改）。
3. **保持精简**：更新本文时不得堆砌无行动含义的描述性文字；每一条规则都应能被“是否遵守”直接检查。
4. **变更记录**：修改本文后，提交信息使用 `docs(agents): ...`，并在提交说明中一句话概括变更点。
