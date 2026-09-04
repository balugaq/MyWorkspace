# AGENTS.md — 我的全能工作台 (My Omnipotent Workspace) 操作宪章

> 本文件是 AI 编程助手与本仓库开发者的**操作契约**。所有改动（代码、构建、文档）均须遵守本文约定；
> 当本文与代码冲突时，按末尾《文档更新契约》处理。
> 本文的**功能入口点地图**已拆分到 [`docs/entry-points.md`](./docs/entry-points.md)，本文件仅保留操作契约与导航引用。

## TL;DR（太长了不看）

1. 本仓库是 **Next.js 16（App Router）+ React 19 + TypeScript 严格模式** 的个人工作台（思维导图 Todo / 分类笔记 / 日历日程 / 通讯录 / AI 助手 / 密码保险库），所有改动必须通过 `npm run typecheck` 与 `npm run lint` **均 0 错误**后才能视为完成。
2. 状态集中在 `lib/store.ts` 的 Zustand store（localStorage 持久化）；**禁止**到处散落本地 state 承载应属于 store 的数据。新增功能优先复用 `app/` 与 `components/` 既有模块。
3. 本机直接在当前分支开发（个人仓库），提交信息遵循 Conventional Commits（`feat:` / `fix:` / `docs:` / `refactor:` / `chore:`）。**严禁 AI 执行 `git commit`（提交仅由宿主执行），已有提交保留不撤回**（详见第 5 节红线第 8 条与第 6 节）。

---

## 1. 项目身份与边界

| 维度 | 事实 |
| --- | --- |
| 定位 | 纯前端个人工作台：思维导图式 Todo、分类笔记（小说/学习/工作/生活）、日历日程、通讯录、AI 助手、密码保险库；localStorage + IndexedDB |
| 技术栈 | Next.js 16.2.6（App Router + **static export**）、React 19、TS 严格、Tailwind v4、shadcn/ui（`@base-ui/react`）、Zustand、`@xyflow/react`（React Flow）、`date-fns`；**富文本基座 TipTap v3**（`@tiptap/core` + `@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-*` + `tiptap-markdown`，正文统一以 Markdown 串存储）、**AI 助手基座 AI SDK**（`ai` + `@ai-sdk/openai-compatible`）；其余 UI/工具依赖（`cmdk` / `lucide-react` / `sonner` / `next-themes` / `zod` / `yaml` / `marked` / `lowlight` / `fast-xml-parser` / `tw-animate-css` / `class-variance-authority` / `clsx` / `tailwind-merge`）见 `lib/licenses.ts` 的 `THIRD_PARTY_LICENSES`（共 40 条，必须随依赖同步增补） |
| 入口 | `app/page.tsx`（主布局：侧边栏 + 工作区分发 + 状态栏 + 各弹窗 + `useGlobalShortcuts`；按 `view` 分发 `calendar`/`contacts`/`vault`/`ai-chat` 与分类工作区；`useCalendarScripts` 已弃用停用）；`app/layout.tsx`（系统字体栈 + `ThemeProvider` + `Toaster` + `VaultProvider`） |
| 状态 | `lib/store.ts` —— `useWorkspace`（Zustand + persist），含分类/章节/思维图节点与连线/日历/系统设置/AI 助手多会话（conversations + activeConversationId，各持完整消息上下文）/密码保险库会话（保险库仅存加密 blob，密钥不落盘；日历脚本字段已弃用停用）；流式请求由 `lib/ai/request-queue.ts` 全局队列持有——切换会话/切走视图都不中断在途请求，设置 `aiForceSync` 可把所有对话请求串行化（单队列） |
| 图片 | IndexedDB（`lib/image-store.ts` + 引用扫描 `lib/image-refs.ts`）；正文用 `imgref:<id>` 引用 token（旧 `{{img:<id>}}` 在读取时由 `components/richtext/normalize.ts` 归一，详见 `docs/entry-points.md` §8.9） |
| 加密 | 密码保险库用 Web Crypto（PBKDF2 + AES-256-GCM），加密 blob 存 IndexedDB（`lib/vault-store.ts`），密钥驻留 `VaultProvider` 内存 |
| 部署 | `output: "export"`，`next build` 产出 `out/`，`scripts/serve-static.mjs` 本地托管；`postbuild` 由 `scripts/inject-csp.mjs` 为 `out/` 所有 HTML 注入**严格 CSP**（`script-src` 走 hash 白名单，放行框架自带行内脚本、拦截其他行内脚本），`app/layout.tsx` 预留 CSP meta 占位 `__CSP_INJECTED_AT_BUILD__` |
| AI 职责范围 | 功能开发、Bug 修复、组件/状态重构、构建/脚本维护、文档维护 |
| AI 不负责 | 提交 git（`git commit`）、发布公网、推送远程（由宿主/开发者执行） |

---

## 2. 常用命令

| 场景 | 命令 |
| --- | --- |
| 开发 / 构建 / 静态托管 | `npm run dev` / `npm run deploy` / `npm run serve` / `npm run deploy:local` |
| 验收三件套 | `npm run typecheck`（=`tsc --noEmit`，0 错误）+ `npm run lint`（=`eslint`，0 错误）；开发机再加 `npm run build` |
| 格式化 | `npm run format` |
| 构建期依赖更新 | `npm run update-dependencies`（由 `predev`/`prebuild` 自动触发；`SKIP_DEP_UPDATE=1` 跳过；当前维护 `lunar-javascript`） |
| 构建后 CSP 注入 | `postbuild` 自动执行 `scripts/inject-csp.mjs`（`next build` 后、`serve` 前）；为 `out/` 注入严格 CSP，**不可省略**（否则 `layout.tsx` 的占位 meta 不生效、行内脚本可能被拦） |

---

## 3. 渲染边界 / 样式 / 状态约定

- `app/layout.tsx` 是 Server Component；`app/page.tsx` 及以下组件都是 `"use client"`。新增交互组件默认 `"use client"`。
- 主题 token 只在 `app/globals.css` 定义（`--color-solution` / `--warning` / `--chart-*`）；业务组件用 `bg-solution` 等类名。系统字体栈定义在 `globals.css` 的 `:root`（`--font-sans/serif/mono`）。
- base-ui 注意：`Trigger` 自定义元素用 `render` prop（非 Radix `asChild`）；展开态用 `data-popup-open`；受控 `Select` 的 `onValueChange` 可能回 `null`，需判空；`ScrollArea` 的 viewport 是 `size-full`，需要父级显式高度/`min-h-0` 才能收卷滚动。
- 持久化数据一律经 store；新增字段要在 `lib/types.ts` 与 `lib/store.ts` 同步，并在 `merge`/`onRehydrateStorage` 做向后兼容。
- 在 `flex` 列里需要"可滚动内容区"时，必须同时具备 `min-h-0` + `flex-1` + `overflow-auto`，否则会被祖先 `overflow-hidden` 裁切且无滚动条（如图片预览多图场景）。

---

## 4. 决策树（增改功能的入口）

- **新增模板类型**：改 `lib/types.ts` 的 `TemplateType` + `TEMPLATES`，并在 `app/page.tsx` 分发（relation→`MindmapWorkspace`，其余→`NovelWorkspace`）。
- **新增 store 字段/action**：同时改 `WorkspaceState` 接口与 `create()`；沿用不可变更新 + `set`；增删必要时在 `merge` 兼容旧存档。
- **新增可搜索内容**：在 `lib/search.ts` 的 `runSearch` 对应分支出追加命中，并在 `components/global-search.tsx` 的 `TYPE_ICON` 与跳转里注册。
- **新增全局快捷键**：改 `lib/types.ts` 的 `SHORTCUT_META`，在 `hooks/use-shortcuts.ts` 的 `useGlobalShortcuts` 接线。
- **新增视图（如 vault / contacts / ai-chat）**：改 `lib/store.ts` 的 `view` 联合类型 + `goXxx` action；在 `app/page.tsx` 分发渲染；在 `app-sidebar.tsx` 加 `XxxNavItem`；并在 `lib/types.ts` 的 `VIEW_LABEL` 补显示名（状态栏右下角对齐）。
- **新增设置项**：在 `Settings` 类型 + `components/settings-dialog.tsx` 的弹窗分区；持久化项走 store。
- **新增 AI 技能**：内置可执行技能在 `lib/ai/builtin-skills.ts` 的 `BUILTIN_SKILLS` 追加（`wb_` 前缀 + zod 参数 schema + `execute` 保持**只读**且返回可 JSON 序列化结果）；用户自定义「说明型」技能放 `public/skills/*.md` 并在 `public/skills/manifest.json` 登记；全局启停走 `settings.aiEnabledSkills`（详见 `docs/entry-points.md` §8.13）。
- **新增第三方依赖**：`npm install` 后必须在 `lib/licenses.ts` 的 `THIRD_PARTY_LICENSES` 补一条声明（名称 / 作者 / 本项目用途描述 / 许可证 / 许可证链接），否则不会出现在「设置 → 开源许可证」页面。
- ~~**新增脚本能力**：改 `lib/calendar-events.ts`（事件/注入 API），文档同步 `docs/calendar-script-docs.md`。~~（日历标记脚本已弃用停用）

---

## 5. 红线

1. 禁止改动 `lib/types.ts` 已发布数据结构造成旧 localStorage 读取异常；如需改，在 `store.merge` 做兼容。
2. 禁止 `git push -f` / 改写共享历史。
3. 任何改动提交前必须 `npm run typecheck` + `npm run lint` 通过。
4. 禁止绕过 store 直接改持久化状态（导致刷新丢失/多视图不同步）。
5. 禁止 Server Component 引用浏览器 API；交互组件必须 `"use client"`。
6. 禁止叠加 base-ui 的 Radix 旧语法（`asChild` / `data-[state=open]`）。
7. 禁止手写 ZIP 读写：备份用 `fflate`（`zipSync`/`unzipSync`），见 `lib/backup.ts`。
8. 禁止 AI 提交 git：`git commit` 仅能由宿主（开发者）执行，AI 不得执行任何提交动作（`git add` 暂存亦须经宿主确认）。**已有的提交一律保留，不得撤回 / reset / rebase 改写历史**；AI 只负责让工作区处于可通过 `typecheck` + `lint` 的改动状态，并把建议的提交信息告知宿主。

---

## 6. Git 工作流

- 本机当前分支直接开发；**提交、发布、推送远程均由宿主（开发者）执行**（见第 5 节红线第 8 条：AI 禁止提交 git）。
- Conventional Commits：`feat:`/`fix:`/`docs:`/`refactor:`/`chore:`（例 `feat(calendar): 新增月视图已完成统计`）。
- AI 交付方式：把改动留在工作区，跑通 `npm run typecheck` + `npm run lint`（0 错误），并**在回答里给出建议的提交信息（含 Conventional Commits 前缀与主题化拆分建议）**，由宿主自行 `git add` / `git commit`。
- 提交前（宿主侧）：`npm run typecheck` + `npm run lint` 0 错误、未触碰第 5 节红线、只提交相关文件（不含 `node_modules/` `.next/` `out/` `.npm-cache/` `*.tsbuildinfo`）。

---

## 7. 质量规范

- TS 严格模式，**原则上不引入 `any` 逃逸**；**唯一已知例外**为 `components/richtext/upgrade.ts`（prosemirror `Node` 类型推断异常，回调形参桥接为 `any`，已加注释说明，新增 `any` 须在此报备）。Web Crypto 相关类型统一用 `Uint8Array<ArrayBuffer>` 规避 TS5.9 对 `BufferSource` 的严格校验。
- 组件放 `components/`（业务）或 `components/ui/`（基础）；纯逻辑放 `lib/`（如 `store.ts`、`search.ts`、`image-store.ts`、`crypto.ts`、`vault-store.ts`）。
- 数据流单向：store → 组件；组件回调调用 store action。
- 每个改动是能通过 typecheck/lint、逻辑自洽的完整状态；不留死代码/unused import。
- 响应式：桌面 `md:` 切换，移动端侧边栏抽屉（`app/page.tsx` 的 `Sheet`）；新增工作区保持 `min-w-0` / `flex-1`。

---

## 8. 功能入口点地图（已拆分）

> **技术型细节已迁移至 [`docs/entry-points.md`](./docs/entry-points.md)**。改某个功能时，先到该文件按「模块 → 入口点」定位组件/方法/类名再动代码。

本文件（AGENTS.md）只保留操作契约（第 1–7、9–10 节）与上述导航引用。所有模块级入口点、方法名、组件名、弃用标记均集中在 `docs/entry-points.md` 维护，避免重复与漂移。

新增功能入口点时，请同步更新 `docs/entry-points.md`（原"第 8 节"），并在本文件第 10 节要求的变更记录中说明。

---

## 9. AI 对用户的回答规范

- **先一句话回答**：开头一句说清「我做了什么/结论是什么」。
- **再简短补充**：只补充代码/文件里看不出来的信息（决策依据、取舍、待确认、风险点）。
- **不重复代码可说明的内容**；保持简短。

---

## 10. 文档更新契约

1. **冲突即提示**：本文与代码不一致时（Next 版本、目录、校验命令、部署方式），必须主动指出并说明以代码为准还是改本文。
2. **惯例沉淀**：产生新的可复用约定/入口点时，提议补进 [`docs/entry-points.md`](./docs/entry-points.md)（先提议，经确认后改）。
3. **保持精简**：每条规则须能被「是否遵守」直接检查。
4. **变更记录**：改本文后**由宿主提交**（AI 不提交，见第 5 节红线第 8 条），提交信息用 `docs(agents): ...` 并一句话概括。
