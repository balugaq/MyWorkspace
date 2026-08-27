# AGENTS.md — 我的全能工作台 (My Omnipotent Workspace) 操作宪章

> 本文件是 AI 编程助手与本仓库开发者的**操作契约**。所有改动（代码、构建、文档）均须遵守本文约定；
> 当本文与代码冲突时，按末尾《文档更新契约》处理。
> 本文包含**功能入口点地图**（第 8 节），用 组件/方法/类名 描述，不用行号。

## TL;DR（太长了不看）

1. 本仓库是 **Next.js 16（App Router）+ React 19 + TypeScript 严格模式** 的个人工作台（思维导图 Todo / 分类笔记 / 日历日程），所有改动必须通过 `npm run typecheck` 与 `npm run lint` **均 0 错误**后才能视为完成。
2. 状态集中在 `lib/store.ts` 的 Zustand store（localStorage 持久化）；**禁止**到处散落本地 state 承载应属于 store 的数据。新增功能优先复用 `app/` 与 `components/` 既有模块。
3. 本机直接在当前分支开发（个人仓库），提交信息遵循 Conventional Commits（`feat:` / `fix:` / `docs:` / `refactor:` / `chore:`）。

---

## 1. 项目身份与边界

| 维度 | 事实 |
| --- | --- |
| 定位 | 纯前端个人工作台：思维导图式 Todo、分类笔记（小说/学习/工作/生活）、日历日程；localStorage + IndexedDB |
| 技术栈 | Next.js 16.2.6（App Router + **static export**）、React 19、TS 严格、Tailwind v4、shadcn/ui（`@base-ui/react`）、Zustand、`@xyflow/react`（React Flow）、`date-fns` |
| 入口 | `app/page.tsx`（主布局：侧边栏 + 工作区分发 + 状态栏 + 各弹窗 + `useGlobalShortcuts`；`useCalendarScripts` 已弃用停用）；`app/layout.tsx`（系统字体栈 + `ThemeProvider` + `Toaster`） |
| 状态 | `lib/store.ts` —— `useWorkspace`（Zustand + persist），含分类/章节/思维图节点与连线/日历/系统设置（日历脚本字段已弃用停用） |
| 图片 | IndexedDB（`lib/image-store.ts`）；正文用引用 token `{{img:<id>}}` |
| 部署 | `output: "export"`，`next build` 产出 `out/`，`scripts/serve-static.mjs` 本地托管 |
| AI 职责范围 | 功能开发、Bug 修复、组件/状态重构、构建/脚本维护、文档维护 |
| AI 不负责 | 发布公网、推送远程（由开发者执行） |

---

## 2. 常用命令

| 场景 | 命令 |
| --- | --- |
| 开发 / 构建 / 静态托管 | `npm run dev` / `npm run deploy` / `npm run serve` / `npm run deploy:local` |
| 验收三件套 | `npm run typecheck`（=`tsc --noEmit`，0 错误）+ `npm run lint`（=`eslint`，0 错误）；开发机再加 `npm run build` |
| 格式化 | `npm run format` |
| 构建期依赖更新 | `npm run update-dependencies`（由 `predev`/`prebuild` 自动触发；`SKIP_DEP_UPDATE=1` 跳过；当前维护 `lunar-javascript`） |

---

## 3. 渲染边界 / 样式 / 状态约定

- `app/layout.tsx` 是 Server Component；`app/page.tsx` 及以下组件都是 `"use client"`。新增交互组件默认 `"use client"`。
- 主题 token 只在 `app/globals.css` 定义（`--color-solution` / `--warning` / `--chart-*`）；业务组件用 `bg-solution` 等类名。系统字体栈定义在 `globals.css` 的 `:root`（`--font-sans/serif/mono`）。
- base-ui 注意：`Trigger` 自定义元素用 `render` prop（非 Radix `asChild`）；展开态用 `data-popup-open`；受控 `Select` 的 `onValueChange` 可能回 `null`，需判空；`ScrollArea` 的 viewport 是 `size-full`，需要父级显式高度/`min-h-0` 才能收卷滚动。
- 持久化数据一律经 store；新增字段要在 `lib/types.ts` 与 `lib/store.ts` 同步，并在 `merge`/`onRehydrateStorage` 做向后兼容。

---

## 4. 决策树（增改功能的入口）

- **新增模板类型**：改 `lib/types.ts` 的 `TemplateType` + `TEMPLATES`，并在 `app/page.tsx` 分发（relation→`MindmapWorkspace`，其余→`NovelWorkspace`）。
- **新增 store 字段/action**：同时改 `WorkspaceState` 接口与 `create()`；沿用不可变更新 + `set`；增删必要时在 `merge` 兼容旧存档。
- **新增可搜索内容**：在 `lib/search.ts` 的 `runSearch` 对应分支出追加命中，并在 `components/global-search.tsx` 的 `TYPE_ICON` 与跳转里注册。
- **新增全局快捷键**：改 `lib/types.ts` 的 `SHORTCUT_META`，在 `hooks/use-shortcuts.ts` 的 `useGlobalShortcuts` 接线。
- **新增设置项**：在 `Settings` 类型 + `components/settings-dialog.tsx` 的弹窗分区；持久化项走 store。
- ~~**新增脚本能力**：改 `lib/calendar-events.ts`（事件/注入 API），文档同步 `docs/calendar-script-docs.md`。~~（日历标记脚本已弃用停用）

---

## 5. 红线

1. 禁止改动 `lib/types.ts` 已发布数据结构造成旧 localStorage 读取异常；如需改，在 `store.merge` 做兼容。
2. 禁止 `git push -f` / 改写共享历史。
3. 任何改动提交前必须 `npm run typecheck` + `npm run lint` 通过。
4. 禁止绕过 store 直接改持久化状态（导致刷新丢失/多视图不同步）。
5. 禁止 Server Component 引用浏览器 API；交互组件必须 `"use client"`。
6. 禁止叠加 base-ui 的 Radix 旧语法（`asChild` / `data-[state=open]`）。

---

## 6. Git 工作流

- 本机当前分支直接开发；发布/推送远程由开发者执行。
- Conventional Commits：`feat:`/`fix:`/`docs:`/`refactor:`/`chore:`（例 `feat(calendar): 新增月视图已完成统计`）。
- 提交前：`npm run typecheck` + `npm run lint` 0 错误、未触碰第 5 节红线、只提交相关文件（不含 `node_modules/` `.next/` `out/` `.npm-cache/` `*.tsbuildinfo`）。

---

## 7. 质量规范

- TS 严格模式，不引入 `any` 逃逸。
- 组件放 `components/`（业务）或 `components/ui/`（基础）；纯逻辑放 `lib/`（如 `store.ts`、`search.ts`、`image-store.ts`）。
- 数据流单向：store → 组件；组件回调调用 store action。
- 每个改动是能通过 typecheck/lint、逻辑自洽的完整状态；不留死代码/unused import。
- 响应式：桌面 `md:` 切换，移动端侧边栏抽屉（`app/page.tsx` 的 `Sheet`）；新增工作区保持 `min-w-0` / `flex-1`。

---

## 8. 功能入口点地图（方法/类名 描述，思维导图已细到小功能）

> 按「模块 → 入口点」列出。改某个功能时，先到这里定位入口再动代码。

### 8.1 全局 / 布局

| 功能 | 入口点 |
| --- | --- |
| 主布局与工作区分发 | `app/page.tsx` 的 `Page`：渲染 `AppSidebar`、`Topbar`、`NovelWorkspace`/`MindmapWorkspace`/`CalendarWorkspace`/`ContactsWorkspace`、`StatusBar`、`GlobalSearch`、`SettingsDialog`、`ConfigEditorDialog`、`ImageCacheDialog`；调用 `useGlobalShortcuts()`（`useCalendarScripts` 已弃用停用） |
| 根布局 / 主题 / 字号 / Toaster | `app/layout.tsx` 的 `RootLayout`；`components/theme-provider.tsx` 的 `ThemeProvider` / `ThemeFromStore` / `FontSizeSetter` |
| 全局快捷键 | `hooks/use-shortcuts.ts`：`useGlobalShortcuts()`、`matchShortcut(e, binding)`；绑定在 `settings.shortcuts`（`SHORTCUT_META`） |
| 底部状态栏 | `components/status-bar.tsx` 的 `StatusBar`（订阅 store 算统计） |

### 8.2 侧边栏（`components/app-sidebar.tsx`）

| 功能 | 入口点 |
| --- | --- |
| 侧边栏容器 | `AppSidebar` |
| 内置模板快捷区 | `TemplateQuickAdd`（调用 store `addCategory`） |
| 分类项（增删改、折叠、操作菜单） | `CategoryItem` |
| 日历导航入口 | `CalendarNavItem`（调用 `goCalendar`） |
| 联系人导航入口 | `ContactNavItem`（调用 `goContacts`） |
| 新建分类弹窗 | `components/add-category-dialog.tsx` 的 `AddCategoryDialog` |
| 分类/章节拖拽排序 | 分类 `moveCategory(from,to)`、章节 `moveChapter(catId,from,to)`（储存在 `lib/store.ts`） |

### 8.3 小说 / 通用分类（`components/novel-workspace.tsx`）

| 功能 | 入口点 |
| --- | --- |
| 工作区分发（概览 / 编辑） | `NovelWorkspace`（按 `activeItemId` 切 `ChapterOverview` / `ChapterEditor`） |
| 概览网格 + 滚动位置记忆 | `ChapterOverview`（用 `scrollRef` 经 viewport 恢复/保存 `scrollTop`） |
| 章节编辑器 | `ChapterEditor`（标题、正文 `ImageRichInput`、标签 `TagPicker`、完成 `Checkbox`、上/下篇 `updateChapter`/`removeChapter`） |
| 列表卡片预览隐藏图片 token | `stripImageTokens`（novel-workspace 内） |

### 8.4 思维导图（`components/mindmap-workspace.tsx` + `components/mindmap/*`）— 细到小功能

**容器与视图**
| 功能 | 入口点 |
| --- | --- |
| 工作区外壳 + 视图切换 | `MindmapWorkspace`（`setRelationView` 切 mindmap/list；`ViewBtn`） |
| 画布 | `Canvas`（`ReactFlow` + `ReactFlowProvider`） |
| 列表视图 | `ListView`（含「添加节点」按钮 `addNode`、完成/隐藏/解决方案徽标） |
| 节点类型注册 | `nodeTypes = { todo: TodoNode, solution: SolutionNode }` |

**节点生命周期**
| 功能 | 入口点 |
| --- | --- |
| 新建节点 | `addAtCenter()`（`screenToFlowPosition` 画面中心 → `addNode(category.id, pos)`）；列表视图 `ListView` 的添加按钮（`addNode`） |
| 双击画布新增 | `onPaneClick`（pane 单击计时模拟双击建节点） |
| 移动节点（拖拽不卡顿） | `onNodeDragStop`（`onNodeDragStop` 一次写回 `updateNode{position}`；拖拽中走 `useNodesState` 本地态） |
| 打开节点详情 | `onNodeClick` / `onNodeDoubleClick`（均 `setActiveItem(n.id)`） |
| 删除节点 | 详情 `NodeInspector` 删除按钮 / 画布 `Delete`/`Backspace`（`pendingDeleteId` + `AlertDialog` 确认 → `removeNode`） |

**连线**
| 功能 | 入口点 |
| --- | --- |
| 左键手柄连线 | `onConnect`（`connectNodes(..., "flow")`） |
| 拖拽连线动画控制 | `onConnectStart`/`onConnectEnd`（`isConnecting` → `rfEdges` 的 `animated`） |
| 删除连线 | `onEdgeClick` → `removeEdge` |
| 重复连接反馈 | `connectNodes` 返回 `ConnectResult` → toast「已经连接过此节点了！」 |

**节点详情面板（`components/mindmap/node-inspector.tsx` 的 `NodeInspector`）**
| 功能 | 入口点 |
| --- | --- |
| 标题 / 原因 cause / 导向 leadTo / 结果 result | `patch({ title | cause | leadTo | result })`（`updateNode`） |
| 内容（防抖 + 粘贴图片） | `DebouncedTextarea`（含 `addImage` + `{{img:<id>}}` 插入） |
| 标签（共用） | `TagPicker`（`patch({ tags })`） |
| 完成 | `patch({ done })`（`Checkbox`「已完成」） |
| 在图里隐藏 | `patch({ hidden })`（`Checkbox`「在图里隐藏」；隐藏后仅列表显示） |
| 截止日期 / 长期任务 | `patch({ dueDate | longTerm })`（`Input type=date` + 「设为长期」按钮） |
| 解决方案 + 状态 | `setNodeSolution(catId, nodeId, content, status)`；状态 `doing|paused|done`（`STATUS_META`） |

**节点卡片（`components/mindmap/nodes.tsx`）**
| 功能 | 入口点 |
| --- | --- |
| Todo 节点卡片 | `TodoNode`（标题 + `done` 删除线/✓、原因/导向/结果、**内容常显** via `RichText`、子任务折叠钮、标签/截止/长期徽标） |
| 图片原尺寸展示 | `RichText` 传 `fullSize`（`h-auto w-auto`，可撑破卡片；卡片 `w-auto min-w-56 max-w-[50vw]`） |
| 解决方案节点卡片 | `SolutionNode`（绿框 + 状态 `STATUS_META`） |
| 子树折叠 | `TodoNode` 折叠按钮 → `onToggleCollapse`（Canvas 内 `collapsed` Set，纯视图态） |

**隐藏 / 过滤**
| 功能 | 入口点 |
| --- | --- |
| 用户隐藏节点不出现在画布 | `Canvas.rfNodes`/`rfEdges` 跳过 `n.hidden`；列表 `ListView` 仍显示 |
| store→画布同步 | 本地画布态 sync effect（`useNodesState`/`useEdgesState` 的 `setNodes`/`setEdges`） |

### 8.5 思维导图 store actions（`lib/store.ts`）

| 功能 | 方法 |
| --- | --- |
| 节点增删改 | `addNode`（返回新 id）、`updateNode`、`removeNode`（清理关联线 + 子引用） |
| 解决方案 | `setNodeSolution` |
| 连线 | `connectNodes(catId, src, tgt, kind)`（返回 `ConnectResult`）、`removeEdge` |
| 视图 | `setRelationView` |

### 8.6 日历（`components/calendar-workspace.tsx`）

> 显示风格参考 `.ref/SimpleCalendar`（仅月视图 + 日期格装饰要素）。当前为**纯月视图**。

| 功能 | 入口点 |
| --- | --- |
| 月视图 + 导航 | `CalendarWorkspace`（固定月视图、`shift`=addMonths、`days` 当月完整网格、回今天按钮（离开当月出现）） |
| 日期格装饰 | 单元格内：日期数字分层配色（today/选中/周末红/生日绿/放假日红/上班日蓝/节气紫）、右上角「假/班/🎂」角标、底部节日名或 `M/d` 小字、顶部笔记圆点、待办截止计数徽标；内置要素（节气/法定假日/调休）来自 `lib/festivals.ts` 的 `builtinChinaFestivals()` |
| 切月动画 | 网格容器 `key={format(current,"yyyy-MM")}` 重建触发淡入；纯淡入（非 SimpleCalendar 的滑入滑出） |
| 当日详情 | `DayDetail`（笔记 `ImageRichInput` → `setDayNote`；待办 `addCalendarTodo/toggleCalendarTodo/removeCalendarTodo`；事件 `addCalendarEvent/removeCalendarEvent`；生日列表 + 农历日期） |
| 思维图截止任务显示 | `collectDueNodes`（`lib/deadlines.ts`）+ 日格徽标 + 详情跳转（`setActiveCategory`/`setActiveItem`） |
| 内置中国日历要素 | `lib/festivals.ts` 的 `builtinChinaFestivals(year,month,day)`：返回二十四节气(`kind:"jieqi"`)与法定假日/调休(`kind:"holiday"`)，与 `custom_festivals.yml` 用户节日在 `calendar-workspace.tsx` 按 `[...builtin, ...userFests]` 合并（内置优先，shortHint 取首项）；`HolidayUtil` 仅覆盖约 2010–2026，空窗由 YAML 的 `holiday_override`/`workday_override` 兜底（见 `docs/custom-data-docs.md` 1.4） |
| 节日/生日数据 | 只读加载 `public/custom_festivals.yml`、`public/address_book.yml`（见 `docs/custom-data-docs.md`） |
| 节日类型 `FestivalKind` | `lib/festivals.ts` 导出联合类型 `FestivalKind`（`"monthDay"|"date"|"weekdayOfMonth"|"lunar"|"jieqi"|"holiday"`），`Festival.kind` 引用之；节气/法定假日用 `jieqi`/`holiday` |
| ~~渲染标记脚本触发~~ | ~~`emitRenderDate`（`lib/calendar-events.ts`）+ `makeMarkerApi`；单元格 `data-date`~~（已弃用停用） |

### 8.7 全局搜索

| 功能 | 入口点 |
| --- | --- |
| 搜索逻辑 | `lib/search.ts` 的 `runSearch(categories, calendar, query, scope, activeCategoryId)` |
| 搜索 UI + 跳转 | `components/global-search.tsx` 的 `GlobalSearch`（`TYPE_ICON`、`Highlight`、`jump`） |

### 8.8 设置（`components/settings-dialog.tsx`）

| 功能 | 入口点 |
| --- | --- |
| 默认视图 / 主题 | `SettingsDialog` 的 `Select`（`updateSettings({ defaultView | theme })`） |
| 字体大小滑块 | `SettingsDialog` 的 range → `updateSettings({ fontSize })` |
| 快捷键编辑 | `ShortcutRow`（录音捕获 → `setShortcut`） |
| ~~日历标记脚本~~ | ~~入口 `setScriptsOpen` → `CalendarScriptsDialog`~~（已弃用停用） |
| 配置源文本编辑 | 入口 `setConfigEditorOpen` → `ConfigEditorDialog`（`exportData`/`importData`） |
| 图片缓存/暂存 | 入口 `setImagesOpen` → `ImageCacheDialog`（`getImageInventory`） |
| 备份（含图） | `exportBackup()` / `importBackup()`（`lib/backup.ts`） |

### 8.9 图片系统

| 功能 | 入口点 |
| --- | --- |
| IndexedDB 存储 | `lib/image-store.ts`：`addImage`、`getImageURL`、`getImageBlob`、`deleteImage`、`listImages`、`setStaged`、`exportImages`、`importImages`、`imageBlobsFromClipboard`（一次粘贴/多选可返回多张图片 blob） |
| 引用扫描 | `lib/image-refs.ts`：`imageIdsInText`、`collectReferencedImageIds` |
| 含图备份 | `lib/backup.ts`：`exportBackup`、`importBackup`、`getImageInventory` |
| 富文本渲染 | `components/rich-text.tsx`：`RichText`、`splitSegments`（`{{img:id}}` / `![](url)`） |
| 富文本输入 | `components/image-rich-input.tsx`：`ImageRichInput`（粘贴/插图/预览切换） |

### 8.10 ~~日历标记脚本~~ —— 已弃用停用

> 日历标记脚本整体停用：`lib/calendar-events.ts` 运行时、`hooks/use-calendar-scripts.ts` 加载器、
> `calendar-workspace.tsx` 触发点与标记 API、store 的 `calendarScripts` 字段/actions、
> `components/calendar-scripts-dialog.tsx` 管理 UI 与设置入口均已注释停用。
> 下列入口点仅作历史存档；如需恢复，按 `docs/calendar-script-docs.md` 顶部说明反注释接线。

| 功能 | 入口点（已停用） |
| --- | --- |
| 事件总线 | `lib/calendar-events.ts`：`onRenderDate`、`emitRenderDate`、`runCalendarScript`、`loadCalendarScript`、`unloadCalendarScript`、`calendarLibs` |
| 类型 | `calendar-events.ts`：`RenderDateEvent`、`DateMarkerApi`、`CalendarDisplayType`、`CalendarLibs` |
| 脚本加载 | `hooks/use-calendar-scripts.ts` 的 `useCalendarScripts`（同步 `store.calendarScripts` → 总线） |
| 脚本管理 UI | `components/calendar-scripts-dialog.tsx` 的 `CalendarScriptsDialog` / `ScriptEditor` |

### 8.11 联系人（`components/contacts-workspace.tsx`）

> 只读通讯录：数据来自 `public/address_book.yml`，用户自行编辑该文件，界面不可增删改。

| 功能 | 入口点 |
| --- | --- |
| 工作区分发 | `app/page.tsx` 按 `view === "contacts"` → `ContactsWorkspace` |
| 视图 state / 切换 | store `view`（`"workspace" | "calendar" | "contacts"`）+ `goContacts`；侧边栏 `ContactNavItem` |
| 列表 + 搜索 | `ContactsWorkspace`：`loadAddressBook()`（`lib/address-book.ts`）+ `query` 过滤（范围含 name/description/birthday/address/roles/contact，见 `filtered`） |
| dropdown 展开 contact | `ContactsWorkspace` 内 `expanded` Set + `toggle(name)`；每个 contact 项含复制按钮（`navigator.clipboard.writeText` + toast） |
| 数据模型 | `lib/address-book.ts`：`Person` / `ContactItem` / `AddressBookFile` / `loadAddressBook` / `parseBirthday` |

---

## 9. AI 对用户的回答规范

- **先一句话回答**：开头一句说清「我做了什么/结论是什么」。
- **再简短补充**：只补充代码/文件里看不出来的信息（决策依据、取舍、待确认、风险点）。
- **不重复代码可说明的内容**；保持简短。

---

## 10. 文档更新契约

1. **冲突即提示**：本文与代码不一致时（Next 版本、目录、校验命令、部署方式），必须主动指出并说明以代码为准还是改本文。
2. **惯例沉淀**：产生新的可复用约定/入口点时，提议补进第 8 节（先提议，经确认后改）。
3. **保持精简**：每条规则须能被「是否遵守」直接检查。
4. **变更记录**：改本文后提交用 `docs(agents): ...` 并一句话概括。
