# 我的全能工作台 —— 编码计划与现状评估

> 生成时间：2026-08（会话内评估）
> 说明：本文件先对齐规格书，逐项核对已完成内容、遗留问题与缺失功能，再给出后续编码计划，供审阅后决定实现范围。
> 进度更新：**P0、P2、P1、P3、P4、P5、P6、P7 均已完成**。

---

## 一、项目现状总览

技术栈已按规格书落地：

| 项       | 采用                                       | 状态      |
| -------- | ------------------------------------------ | --------- |
| 框架     | Next.js 16.2.6（App Router）               | ✅ 已接入 |
| UI       | shadcn/ui（底层已迁移到 `@base-ui/react`） | ✅        |
| 样式     | Tailwind CSS v4                            | ✅        |
| 状态管理 | Zustand + `persist`（localStorage）        | ✅        |
| 思维导图 | `@xyflow/react`（React Flow）              | ✅        |
| 日历     | 自建（`date-fns`）                         | ✅        |
| 搜索     | 自建全文过滤 + 高亮                        | ✅        |

目录结构（`app` / `components` / `lib` / `hooks`）：

```
app/
  page.tsx         主布局（桌面+移动侧边栏、主区分发）
  layout.tsx       字体（Noto Sans/Serif SC）+ ThemeProvider + Toaster
  globals.css      主题 token（含 --solution / --warning 等）
components/
  app-sidebar.tsx            侧边栏（分类树、日历入口、增删改）
  add-category-dialog.tsx    新建/选择模板/命名规则配置
  topbar.tsx                 顶栏（标题、搜索、主题切换）
  novel-workspace.tsx        小说/通用类（概览+编辑+上/下篇）
  mindmap-workspace.tsx      关系类（思维导图画布 + 列表视图）
  mindmap/nodes.tsx          Todo 节点 / 解决方案节点卡片
  mindmap/node-inspector.tsx 节点详情编辑面板
  calendar-workspace.tsx     日历（月/周/日 + 当日详情）
  global-search.tsx          全局搜索（范围筛选 + 高亮 + 跳转）
  ui/                        shadcn 基础组件
lib/
  types.ts       全部数据模型 + 模板元信息 + 状态元信息
  store.ts       Zustand store（分类/章节/节点/日历 + 持久化 + 种子数据）
  search.ts      搜索逻辑
  icons.tsx      模板图标映射
hooks/           （占位）
```

---

## 二、已完成功能核对

| 规格书需求            | 状态 | 说明                                                                                               |
| --------------------- | ---- | -------------------------------------------------------------------------------------------------- |
| 1. 侧边栏导航系统     | ✅   | 添加/删除/重命名/展开折叠分类、内置模板列表、日历入口                                              |
| 2. 小说类模板         | ✅   | 命名规则（`%`占位+中文数字）、自动编号、章节目录、标签、上/下首切换、增删章节                      |
| 3. 关系类（思维导图） | ✅   | React Flow 画布、原因/导向/结果/Sub、解决方案节点（绿线）、●○✓状态、拖拽连线、列表视图、节点检查器 |
| 4. 日历模块           | ✅   | 月/周/日视图、圆点/数字标记、当日笔记、待办勾选、事件、日期导航                                    |
| 5. 全局搜索           | ✅   | 范围筛选（全部/当前分类/日历/Todo/思维导图）、实时、高亮、点击跳转、⌘K 快捷键                      |
| 数据持久化            | ✅   | Zustand `persist`（localStorage），含种子数据                                                      |

---

## 三、本次会话已完成的修复

在评估中发现并修复了以下**会导致无法通过编译/检查**的问题：

### 3.1 阻塞型类型错误（导致 typecheck 失败）

- `components/app-sidebar.tsx` — `DropdownMenuTrigger` 使用了 Radix 时代的 `asChild`。
  本项目 shadcn 底层是 `@base-ui/react`，其 Trigger 没有 `asChild`，改用 **`render` prop** 渲染自定义 Button。
- 顺带把依赖的 `data-[state=open]` 选择器改为 base-ui 的 **`data-popup-open`**。

### 3.2 遗留 lint 问题（全项目 `lint` 归零）

- `components/add-category-dialog.tsx` — 移除 6 个未使用的 `Select*` 导入。
- `lib/store.ts` — 移除 `create` 回调中未使用的 `get`；`toChineseNumber` 中 `str` 由 `let` 改 `const`。

### 3.3 环境备注（非代码问题）

- `node_modules` 依赖已在工作区完成安装（617 包）。
- `next build` 在本沙箱下因“进程派生 EPERM”无法完整跑通（Windows 沙箱限制 `spawn`），但 `tsc --noEmit` 与 `eslint` 均 **0 错误**，是对代码正确性最可靠的可执行验证。用户在开发环境中 `npm run build` / `npm run dev` 应可正常通过。
- 后续会话中 `next build` 已可完整跑通（Turbopack 编译成功、静态页面 4/4）。

### 3.4 本次会话新增（P5–P7 补齐规格书剩余缺口）

#### P5 —— 思维导图 Sub 子任务体系 ✅ 已完成

- 规格书要求「点击节点展开/折叠子节点」。此前 `sub` 字段与 `connectNodes(kind:"sub")` 已存在，但无任何入口创建 sub 连线、也无展开/折叠。
- **折叠/展开**：`components/mindmap-workspace.tsx` 的 `Canvas` 用组件内 `useState<Set<string>>` 记录折叠节点，递归计算隐藏的 sub 子树（节点与其边一并过滤），纯视图态不入 store。
- **入口**：`components/mindmap/nodes.tsx` 的 `TodoNode` 在标题行加折叠按钮（有 `sub` 才显示）。
- **管理**：`components/mindmap/node-inspector.tsx` 新增「子任务」区——列出当前 sub（可删除）、Select 从其余节点添加。
- **store**：新增 `removeSub`；`removeEdge` / `removeNode` 现在会同步清理其他节点 `sub` 数组引用（此前删除连线/节点会遗留脏引用）。
- **双击画布创建节点**：React Flow v12 无 `onPaneDoubleClick`，用 pane 单击计时（<350ms 且位移 <8px）模拟，同时 `zoomOnDoubleClick={false}` 避免误缩放。

#### P6 —— 双击节点编辑 ✅ 已完成

- `Canvas` 增加 `onNodeDoubleClick`（v12 原生支持）→ 打开节点检查器；顺带补上「双击节点编辑内容」。

#### P7 —— 数据完整性与编号连续性 ✅ 已完成

- `importData` 现在一并恢复 `settings`（此前导出含 settings 但导入忽略，备份回环不完整），缺省时并入默认值。
- `addChapter` 的 `index` 改为 `max(existing)+1`（此前 `length+1`，删除中间章节后会产生重复编号）。

---

## 四、与规格书相比的缺失功能（候选计划）

按优先级从高到低排列：

### P0 —— 底部状态栏（规格书整页布局中明确绘制） ✅ 已完成

- **位置**：`app/page.tsx` 主工作区底部，紧贴 `<main>` 之下。
- **内容**：
  - 普通分类：`共 N 项 | 已完 X | 未完 Y`（基于 chapters 的 `done`；需在 `Chapter` 上补充完项能力或按内容为空判定）。
  - 关系类：`节点 N | 解决方案 X | 处理中 Y`。
  - 日历视图：`本月待办 X | 已完 Y`。
- **实现**：新增 `components/status-bar.tsx`，从 store 订阅 categories/calendar 与当前视图计算统计，纯展示组件。
- **涉及文件**：`app/page.tsx`、`components/status-bar.tsx`。
- **后续补充**：为让“已完成”计数有语义，在 `novel-workspace.tsx` 的篇目卡片与编辑器中加入了完成勾选（复用 `Chapter.done` 字段）。

### P1 —— 导出 / 导入 JSON 备份（规格书“数据持久化”要求） ✅ 已完成（并入设置界面）

- **导出**：把 `useWorkspace` 的 `categories + calendar + settings` 序列化为 JSON，弹窗内“导出 JSON”按钮触发带日期文件名的下载。
- **导入**：文件选择 → 解析校验 → 整体替换 store 数据（导入覆盖前有提示文案）。
- **实现**：store 侧新增 `exportData()` / `importData(json)`；UI 并入 `components/settings-dialog.tsx` 的“数据备份”分区（导出/导入按钮 + 隐藏 file input）。
- **涉及文件**：`lib/store.ts`、`components/settings-dialog.tsx`。

### P2 —— 内置模板快捷区（侧边栏 ASCII 中“▼ 内置模板”） ✅ 已完成

- 在侧边栏“我的分类”上方增加“内置模板”分组：小说/学习/工作/生活/关系 五项。
- 点击任一项 → 以默认命名规则与少量示例直接创建一个分类并激活，方便快速上手。
- **实现**：复用 `addCategory`；新增 `components/template-quick-add.tsx` 或在 `app-sidebar` 内联。
- **涉及文件**：`components/app-sidebar.tsx`。
- **落地说明**：新增 `TemplateQuickAdd`（内联于 `app-sidebar`）。小说类默认 `第%章`×5；关系类建空白画布；学习/工作/生活建空白条目分类；均立即激活，可用右键重命名调整。

### P3 —— 系统设置（不含搜索历史，按用户要求去掉） ✅ 已完成

- 规格书“系统设置”包含：默认视图、主题。**搜索历史按要求不实现**。
- store 新增 `settings`：`theme`（light/dark/system）、`defaultView`（workspace/calendar），纯持久化。
- **主题**：`theme-provider.tsx` 新增 `ThemeFromStore`，把 `store.settings.theme` 作为唯一来源同步到 next-themes；`topbar.tsx` 顶栏切换改为写回 store。
- **默认视图**：`store.ts` 的 rehydrate 阶段 `applyDefaultView` 在启动时应用 `defaultView`。
- **实现**：`lib/types.ts`（`Settings` / `DefaultView` / `ThemePreference` / `DEFAULT_SETTINGS`）、`lib/store.ts`、`components/theme-provider.tsx`、`components/topbar.tsx`、`components/settings-dialog.tsx`。

### P4 —— 可自定义的全局快捷键 ✅ 已完成（按键绑定方案已调整）

- **绑定方案**：`Ctrl+N` 新建分类、`Ctrl+B` 打开日历、`Ctrl+K` 全局搜索；三者均可在设置界面修改模组/按键。
- **实现**：
  - `lib/types.ts`：`ShortcutAction` / `ShortcutBinding` / `SHORTCUT_META`（含默认值）。
  - `lib/store.ts`：`settings.shortcuts` + `setShortcut`。
  - `hooks/use-shortcuts.ts`：`useGlobalShortcuts` 统一注册 keydown，解析命令；新建/日历直连 store action，搜索通过 `dsh:open-search` 事件。
  - `components/settings-dialog.tsx`：快捷键条目（显示当前组合键、“修改”进入录音模式、“重置”恢复默认）。
  - `app/page.tsx`：由 `useGlobalShortcuts` 接管快捷键，移除旧的内联 Ctrl+K。

---

## 五、实施顺序与验收

1. P0 状态栏（无状态/纯展示，风险最低，先做）
2. P1 导出/导入（数据完整回滚点，尽早具备）
3. P2 内置模板快捷区
4. P3 设置与搜索历史
5. 每步结束后执行 `npm run typecheck` + `npm run lint`，确保 0 错误；最后统一核对 UI 在桌面/移动端表现。

> P0–P4 已全部落地，`npm run typecheck` 与 `npm run lint` 均为 0 错误。此前版本 P3/P4 中候选的“搜索历史”“方向键章节跳转”“Sub 子级展开”等细节按约定保留，未纳入本次实现。

---

## 六、思维图/交互/设置 追加需求（一次评审导入） ✅ 已完成

> 项目更新后按用户提出的 12 项调整落地，涉及思维导图交互、设置、编辑体验。全部通过 `npm run typecheck` + `npm run lint`（0 错误）。

| # | 需求 | 实现要点 | 涉及文件 |
| --- | --- | --- | --- |
| 1 | 侧边栏支持上下滑动 | `app-sidebar.tsx` 的 `ScrollArea` 补 `min-h-0 overflow-hidden`，使 flex 收缩可滚动 | `components/app-sidebar.tsx` |
| 2 | 修复搜索框 Ctrl/Cmd+K 快捷键贴图多 Cmd | `topbar` 中移除多余文本 ⌘，仅在有修饰键时渲染 `<Command>` 图标 | `components/topbar.tsx` |
| 3 | 设置中加字体大小滑块 | `Settings.fontSize`（12–24，默认 16）；设置弹窗加 range；`theme-provider` 的 `FontSizeSetter` 把值写到 `document.documentElement.style.fontSize` | `lib/types.ts`、`components/settings-dialog.tsx`、`components/theme-provider.tsx` |
| 4 | 文本框中 Ctrl+A 全选、Ctrl+S 保存并 preventDefault | `useGlobalShortcuts` 内对 input/textarea/contenteditable 优先处理：Ctrl+A→`select()`、Ctrl+S→`blur()`（值已入 store） | `hooks/use-shortcuts.ts` |
| 5 | 删除思维图右下角灰矩形（鸟瞰图） | 移除 `<MiniMap>` 及 import | `components/mindmap-workspace.tsx` |
| 6 | 解决方案可拖拽 | solution 节点 `draggable:true`，位置持久化到父节点 `solutionPosition`（`onNodesChange` 识别 `sol-` 前缀写回） | `components/mindmap-workspace.tsx` |
| 7 | 节点绑定截止日期 + 长期任务，在日历显示 | `MindNode` 增 `dueDate`/`longTerm`；inspector 加日期输入 + “长期” 按钮；`lib/deadlines.ts` 汇总各关系分类有日期未长期节点；`calendar-workspace` 日格显示“N 待办截止”+日详情列出可跳转 | `lib/types.ts`、`lib/deadlines.ts`、`components/mindmap/node-inspector.tsx`、`components/calendar-workspace.tsx`、`components/mindmap/nodes.tsx` |
| 8 | 节点支持标签（共用标签体系） | `MindNode.tags`；inspector 加标签输入（同章节模式）；节点卡片显示标签与截止/长期徽标 | `lib/types.ts`、`components/mindmap/node-inspector.tsx`、`components/mindmap/nodes.tsx` |
| 9 | 右键按住拖线连节点 | 节点 `onPointerDown`(button 2) 起拖、move 实时画`drag-float`隐形节点+临时边、up 命中测试建 `flow` 连线；节点/画布 `onContextMenu` preventDefault | `components/mindmap-workspace.tsx`、`components/mindmap/nodes.tsx` |
| 10 | 修复节点内容编辑卡顿 | 内容 textarea 改为本地受控 + 400ms 防抖提交 + blur 提交，避免每键触发 store→画布重渲染 | `components/mindmap/node-inspector.tsx` |
| 11 | 子任务仅显示已连接节点 | `subs` 改为仅在存在 `sub` 连线（edge.kind==="sub" && source===本节点）时才采集合 | `components/mindmap/node-inspector.tsx` |
| 12 | 修复添加子任务不刷新 | 弃用 base-ui 受控 `value=""` Select（无匹配值导致 onValueChange 异常），改为直接“＋ 添加”按钮列表，store 更新后实时反映 | `components/mindmap/node-inspector.tsx` |

**备注 / 风险点**
- #7 的截止任务是“截止”语义：选择日期即作为该日期的截止任务，从日历可跳回节点；`长期` 开关会清空日期，长期任务不出现在日历。
- #9 命中测试用节点近似宽高（224×120）判断；拖拽期间用 `window` 的 pointermove/pointerup 监听保证释放点坐标正确、临时连线实时跟随。
- #10 防抖对“内容”字段生效；标题/原因/导向/结果仍实时写 store（改动小、不重排画布，风险低）。若仍卡顿，可进一步把标题也防抖。
- `exportData/importData` 已含 `settings`（含 `fontSize`），旧存档缺字段由 `merge` 并入默认值，向后兼容。

---

## 七、第二轮交互/设置打磨 ✅ 已完成

> 按用户反馈的 6 项调整落地，`npm run typecheck` + `npm run lint` 均 0 错误。

| # | 需求 | 实现要点 | 涉及文件 |
| --- | --- | --- | --- |
| A1 | 搜索框 Command 图标平台自适应 | `topbar` 检测平台：Windows/Linux 显示 `Ctrl+K`，macOS 显示 `⌘K`（`<Command>` 图标）；匹配 `settings.shortcuts.search` 绑定 | `components/topbar.tsx` |
| B1 | 节点详情支持上下滑动 | `node-inspector` 的 `ScrollArea` 补 `min-h-0 overflow-hidden` | `components/mindmap/node-inspector.tsx` |
| B2 | 左键拖拽连线时不播放动画，松手后恢复 | 新增 `isConnecting`，`onConnectStart`/`onConnectEnd` 切换；`flow` 边 `animated: e.kind==="flow" && !isConnecting` | `components/mindmap-workspace.tsx` |
| B3 | 删除不了节点 | 画布新增 Delete/Backspace 键删除当前选中节点（避开输入框）；配合 inspector「删除节点」按钮 | `components/mindmap-workspace.tsx` |
| B4 | 右键拖线实时显示 | 把右键拖拽改为 `window` pointermove/pointerup 监听（不再依赖节点内部事件），拖拽中 `drag-float` 隐形节点 + 临时边实时跟随 | `components/mindmap-workspace.tsx`、`components/mindmap/nodes.tsx` |
| B5 | 标签“+”按钮 + 标签库搜索选择 | 新增 `lib/tags.ts`（汇总跨章节/节点全部标签）与 `components/tag-picker.tsx`（GitHub 风格“+”下拉，可搜索已有标签点击添加、也可输入回车新建）；接入 `novel-workspace` 章节与 `node-inspector` 节点 | `lib/tags.ts`、`components/tag-picker.tsx`、`components/novel-workspace.tsx`、`components/mindmap/node-inspector.tsx` |

**备注 / 风险点**
- A1 的平台判断在 `useEffect`（挂载后）执行，避免 SSR 水合差异；默认显示 Ctrl 前缀。
- B3 键盘删除由 `removeNode` 兜底清理相关 `sub` 引用与连线；只有焦点不在输入框、且确有选中节点时才触发。
- B5 标签库为「实时汇总」，新增标签后所有页面会即时出现在下拉里；删除某处标签不会从库移除（除非全站无此标签）。

---

## 八、删除确认 + 画布拖拽性能修复 ✅ 已完成

> 修复画布拖拽卡顿与右键拖拽时节点消失；节点删除增加确认弹窗。`npm run typecheck` + `npm run lint` 均 0 错误。

| # | 需求 | 结论 / 实现 | 涉及文件 |
| --- | --- | --- | --- |
| 1 | 节点删除加确认 | 与分类删除一致：inspector 删除按钮、画布 Delete/Backspace 均改为弹 `AlertDialog` 确认后再删 | `components/mindmap/node-inspector.tsx`、`components/mindmap-workspace.tsx` |
| 2 | 左键拖拽卡顿 | **根因**：旧代码在 `onNodesChange` 里每次位置变化都 `updateNode` 写全局 store → 整页 `page`/`Canvas` 每帧重渲染 → React Flow 全图重排。**修复**：改用 `useNodesState`/`useEdgesState` 本地画布态，React Flow 拖拽只更新本地坐标，仅在 `onNodeDragStop` 一次写回 store。 | `components/mindmap-workspace.tsx` |
| 3 | 右键连节点时节点消失 | **根因**：与 #2 同根——旧代码每次 `dragLine`/位置变化都重建 `nodes`/`edges` 数组（新对象标识）喂给 React Flow，属性反复替换导致画布清空。**修复**：#2 的同一次重构让节点数组稳定；右键临时线改为稳定的 `drag-float` + `drag-line`，拖拽中不重建整体图。（业界共识见下方链接） | `components/mindmap-workspace.tsx` |

**根因归属定性**
- **不是 React Flow 库的 bug**，而是使用方式违反了官方对「受控节点」的建议：不要把由外部 store 每次重建的节点数组直接当 `nodes` prop 传入。
- 网络佐证（官方/社区共识）：
  - React Flow 性能指南：[Performance — React Flow](https://reactflow.dev/learn/advanced-use/performance)
  - `useNodesState` 官方 API：[useNodesState — React Flow](https://reactflow.dev/api-reference/hooks/use-nodes-state)
  - 社区讨论（拖拽卡顿）：[Major performance issues when moving nodes](https://github.com/xyflow/xyflow/discussions/2353)、[React Flow(xyFlow) Optimization — dev.to](https://dev.to/usman_abdur_rehman/react-flowxyflow-optimization-45ik)
  - “节点位置变化导致全部节点消失”：[xyflow issue #4287](https://github.com/xyflow/xyflow/issues/4287)

**备注 / 风险点**
- #2/#3 重构后，画布位置由 React Flow 本地持有，store 仅在拖拽结束、增删节点、折叠、右键连线和编辑内容时更新；因此拖拽期间不再触发整页重渲染。
- 右键临时线仍走状态同步（`drag-line`/`drag-float`），规模小、开销可忽略；若节点极多仍感任何迟滞，可再对右键 move 做 rAF 节流。
- 删除确认在 inspector 与键盘两条路径都已覆盖。

---

## 九、右键连线交互细化 + 重复连接反馈 ✅ 已完成

> 两处交互调整，`npm run typecheck` + `npm run lint` 均 0 错误。

| # | 需求 | 实现要点 | 涉及文件 |
| --- | --- | --- | --- |
| 1 | 右键按住时暂画直虚线，连接后删虚线再连接 | 右键拖拽临时边 `drag-line` 改为 `type:"straight"` + `strokeDasharray`（直虚线）；`endRightDrag` 逻辑为：先 `setDragLine(null)` 移除临时线与 `drag-float` 浮动锚点，命中目标后再真正 `connectNodes` 建立 `flow` 边 | `components/mindmap-workspace.tsx` |
| 2 | 连接已连接的节点提示“已经连接过此节点了！” | `connectNodes` 改为返回 `ConnectResult`（`"created" | "exists" | "invalid"`）；右键连线、左键手柄连线、子任务添加三处 toast 都按结果区分：已有连接显示 `toast.error("已经连接过此节点了！")` | `lib/types.ts`、`lib/store.ts`、`components/mindmap-workspace.tsx`、`components/mindmap/node-inspector.tsx` |

**备注 / 风险点**
- `"straight"` 为 xyflow 内置边类型（`@xyflow/react/dist/esm/index.js` 中 `straight: StraightEdgeInternal`），经确认可用。
- 连线判定按「同 source→target」判断重复；反向（target→source）视为不同连线，不拦。
- `connectNodes` 返回值用于区分「新建成功」与「已存在」，向后兼容：子任务添加处 addable 已过滤，正常不会命中 `exists`。

---

## 十、小说滚动 + 分类拖拽排序 + 日历标记脚本(Event Bus) ✅ 已完成

> `npm run typecheck` + `npm run lint` 均 0 错误。新增依赖：`yaml`、`fast-xml-parser`。

| # | 需求 | 实现要点 | 涉及文件 |
| --- | --- | --- | --- |
| 1 | 小说类界面加滑动条 | 概览网格改由 `ScrollArea`（`min-h-0 flex-1`）承载，内容多时可上下滚动 | `components/novel-workspace.tsx` |
| 2 | “我的分类”及其小分类拖拽排序 | 新增 `moveCategory(from,to)` / `moveChapter(catId,from,to)`；侧边栏分类行、章节行支持 HTML5 拖拽（`draggable` + `onDragStart/Over/Drop`）排序，重排后重算章节序号 | `lib/store.ts`、`components/app-sidebar.tsx` |
| 3 | 日历标记脚本（event bus） | 见下文架构说明 | 多文件 |

**3. 日历标记脚本架构**
- **解析库**：`yaml`、`fast-xml-parser`（JSON 用原生）——脚本经 `useLib('yaml'|'xml'|'json')` 或 `lib` 门面使用。
- **事件总线** `lib/calendar-events.ts`：
  - `CalendarDisplayType = "month" | "week" | "day"`。
  - `RenderDateEvent`：`{ displayType, date(yyyy-MM-dd), element(该日期块 DOM), api }`，`api` 提供 `addMarker/addBulk/addText`。
  - `onRenderDate/emitRenderDate` 总线；`runCalendarScript(code)` 包函数注入 `renderDate/useLib/lib/console`，按脚本 id 管理订阅（`loadCalendarScript/unloadCalendarScript`）。
- **存储与运行**：`store.calendarScripts`（name/enabled/code）持久化；`hooks/use-calendar-scripts.ts` 在 page 挂载时把启用脚本载入总线，编辑/启停自动重载。
- **管理 UI**：`components/calendar-scripts-dialog.tsx`（列列表、启停开关、编辑代码、新建示例脚本）；设置弹窗新增「管理日历标记脚本」入口。
- **日历接线** `components/calendar-workspace.tsx`：每个日期块 `<button data-date>`；每次渲染后清除旧标记容器并 `emitRenderDate`，脚本据此给单个日期块加标记。

**备注 / 风险点**
- 脚本为**信任本地脚本**（按你的选择），直接 `new Function` 执行并以参数注入受限 API；非沙箱隔离——请只在存信任代码时启用。

---

## 十一、章节拖拽修复 + 配置源文本编辑器 + 总览滚动位置记忆 ✅ 已完成

> `npm run typecheck` + `npm run lint` 均 0 错误。

| # | 需求 | 实现要点 | 涉及文件 |
| --- | --- | --- | --- |
| 1 | 章节行可拖拽排序（如把第九首拖到第八首前面） | 上次问题：把 `draggable` 放在包裹 `<div>` 上，内部 `<button>` 拦截了拖拽。已改为**在章节按钮本身上 `draggable`**，并加 `GripVertical` 拖拽手柄提示；落点按该行上下半区决定插入前/后（`moveChapter(from, to)`），分类行同样改用中点落点模型 | `components/app-sidebar.tsx`、`lib/store.ts` |
| 2 | 配置文件源文本编辑器 | 设置新增「编辑器打开配置文件（源文本）」；`components/config-editor-dialog.tsx` 载入 `exportData()` 的 JSON 到 textarea，保存时校验 JSON 后经 `importData()` 整体替换；`exportData/importData` 补充 `calendarScripts` 字段以便完整往返 | `components/config-editor-dialog.tsx`、`components/settings-dialog.tsx`、`app/page.tsx`、`lib/store.ts` |
| 3 | 总览滚动条进度进出章节后重置 | `NovelWorkspace` 持 `overviewScrollRef`，`ChapterOverview` 挂载时经 `ScrollArea` viewport 恢复 `scrollTop`，并监听 scroll 写回 ref；进入/返回章节不丢失位置 | `components/novel-workspace.tsx` |

**备注 / 风险点**
- #1 拖拽用 HTML5 DnD；若仍不灵敏，浏览器限制可元素（button）拖拽需按住片刻。已加 `cursor-grab` 手柄提升可用性。
- #2 配置编辑器为**高风险**入口：`importData` 会整体替换分类/日历/设置/脚本；保存前本地校验 JSON 与必填结构（categories/calendar）。改动即时生效并无“撤销”，强烈建议先「导出 JSON」备份。
- #3 位置记忆为会话内存（非持久化到 localStorage）；刷新页面/重启后回到顶部属预期。
- 事件体中的 `element` 是 React 渲染的单元格 DOM；脚本直接装饰 DOM（追加标记节点），React 不接管该容器，因此不会被打回。每次视图变化/切月会重建标记容器防止重复累积。
- `RenderDateEvent` 目前对 **month/week 网格**的每个日期块触发；day 视图暂无网格单元格，未触发（如需日视图单块标记可后续补）。

---

## 十二、UI 滚动补全 + 两份使用文档 ✅ 已完成

> 两个 UI 滚动问题 + 两份用户文档。`npm run typecheck` + `npm run lint` 均 0 错误。

| # | 需求 | 实现要点 | 涉及文件 |
| --- | --- | --- | --- |
| 1 | 标签弹层列表溢出，加滑条 | TagPicker 的 `ScrollArea` 由 `max-h-48` 改为固定 `h-48`（base-ui 的 viewport `size-full` 依赖父级显式高度才收卷） | `components/tag-picker.tsx` |
| 2 | 设置界面加滑条 | 设置弹窗内容外包 `ScrollArea`（`max-h-[60vh] min-h-0 flex-1`），内容超长时可滚动 | `components/settings-dialog.tsx` |
| 3 | 编写 `docs/calendar-script-docs.md` | 指导接入/编写/运行日历标记脚本：事件结构、全局 API、解析库、示例、加载机制、排错 | 新增 `docs/calendar-script-docs.md` |
| 4 | 编写 `docs/product-docs.md` | 面向用户的产品使用指南：分类/笔记/思维图/日历/搜索/设置/备份/FAQ | 新增 `docs/product-docs.md` |

**备注**
- 第 1 项根因：base-ui `ScrollArea` 的 viewport 是 `size-full`（高度 100%），父级只有 `max-h` 而无显式高度时无法收卷，故改用固定高度。
- 第 2 项给设置弹窗加了内滚动区，长设置项不再把弹窗撑爆。
- 两份文档与 README 相互补充：README 偏“启动/概览”，product-docs 偏“逐功能上手”，calendar-script-docs 专管脚本接入。

---

## 十三、Select 中文化 + 设置滑条 + 图片系统（IndexedDB/粘贴/渲染/暂存/含图备份） ✅ 已完成

> `npm run typecheck` + `npm run lint` 均 0 错误。图片采用用户方案：存 IndexedDB、正文用引用 token、无引用进暂存区、备份含图片。

| # | 需求 | 实现要点 | 涉及文件 |
| --- | --- | --- | --- |
| 1 | 默认视图/主题 Select 外面显英文 | base-ui `SelectValue` 渲染的是原始 value；给两个 SelectValue 显式填中文 label（由 value 反查） | `components/settings-dialog.tsx` |
| 2 | 配置编辑器滑条作用对象错误 | 改掉「ScrollArea 包 textarea」的错误结构，直接把 textarea 设为带本地滚动/可拖拽高度（`h-72 resize-y overflow-auto`） | `components/config-editor-dialog.tsx` |
| 3 | 图片显示协议 + 复制粘贴图片 | 见下「图片系统」 | 多文件 |

**图片系统设计（方案 3：IndexedDB）**
- **存储层** `lib/image-store.ts`：IndexedDB `workspace-images`，提供 add/getImageURL/getImageBlob/delete/list/setStaged/exportImages/importImages、剪贴板取图。
- **引用协议**：正文写 `{{img:<id>}}` 引用图片；也支持 Markdown `![](url)` 远程图片。
- **渲染** `components/rich-text.tsx`：解析 token/`![](url)` 为 `<img>`（IndexedDB 走 objectURL）。
- **富文本输入** `components/image-rich-input.tsx`：textarea 支持 **Ctrl+V 粘贴图片**（转 blob→IndexedDB→光标处插 `{{img:id}}`）、「插图」选文件、编辑/预览切换。接入小说章节正文、日历笔记；思维图节点内容在 node-inspector 的 `DebouncedTextarea` 增加同样的粘贴逻辑。
- **引用扫描/暂存区** `lib/image-refs.ts`（收集全库被引用的 id）+ `lib/backup.ts` 的 `getImageInventory`；无引用图片在「设置 → 图片缓存/暂存区」查看并决定删除（用到的图不可删）。
- **导出/导入含图** `lib/backup.ts`：`exportBackup()` 把 store 快照 + 被引用的图片（base64）打成单个 JSON；`importBackup()` 先恢复 store 再幂等写回 IndexedDB。设置里「数据备份（含图片）」与「图片缓存」入口已接 async。

**备注 / 风险点**
- IndexedDB 容量远大于 localStorage，适合长期存图；图片不随文本 JSON 写入 localStorage（正文只存 token）。
- 导出 JSON 会内嵌图片 base64，文件可能变大——这是「含图备份」的预期代价。
- 原生 `<img>`（objectURL / 任意远程 URL）不使用 next/image 优化，均以 eslint-disable 说明理由。
- 粘贴在「编辑」态生效；「预览」态显示成图。
