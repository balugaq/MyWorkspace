# 我的全能工作台 —— 编码计划与现状评估

> 生成时间：2026-08（会话内评估）
> 说明：本文件先对齐规格书，逐项核对已完成内容、遗留问题与缺失功能，再给出后续编码计划，供审阅后决定实现范围。
> 进度更新：**P0、P2、P1、P3、P4 均已完成**。

---

## 一、项目现状总览

技术栈已按规格书落地：

| 项 | 采用 | 状态 |
|---|---|---|
| 框架 | Next.js 16.2.6（App Router） | ✅ 已接入 |
| UI | shadcn/ui（底层已迁移到 `@base-ui/react`） | ✅ |
| 样式 | Tailwind CSS v4 | ✅ |
| 状态管理 | Zustand + `persist`（localStorage） | ✅ |
| 思维导图 | `@xyflow/react`（React Flow） | ✅ |
| 日历 | 自建（`date-fns`） | ✅ |
| 搜索 | 自建全文过滤 + 高亮 | ✅ |

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

| 规格书需求 | 状态 | 说明 |
|---|---|---|
| 1. 侧边栏导航系统 | ✅ | 添加/删除/重命名/展开折叠分类、内置模板列表、日历入口 |
| 2. 小说类模板 | ✅ | 命名规则（`%`占位+中文数字）、自动编号、章节目录、标签、上/下首切换、增删章节 |
| 3. 关系类（思维导图） | ✅ | React Flow 画布、原因/导向/结果/Sub、解决方案节点（绿线）、●○✓状态、拖拽连线、列表视图、节点检查器 |
| 4. 日历模块 | ✅ | 月/周/日视图、圆点/数字标记、当日笔记、待办勾选、事件、日期导航 |
| 5. 全局搜索 | ✅ | 范围筛选（全部/当前分类/日历/Todo/思维导图）、实时、高亮、点击跳转、⌘K 快捷键 |
| 数据持久化 | ✅ | Zustand `persist`（localStorage），含种子数据 |

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
