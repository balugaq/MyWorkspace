# 我的全能工作台 —— 编码计划与现状

> 说明：本文件是**项目现状的精简存档**。各功能的接入点（组件/方法名）见 `AGENTS.md`，用户使用说明见 `docs/product-docs.md`、脚本接入见 `docs/calendar-script-docs.md`（**已弃用**）。本文只保留“当下仍具决策价值”的架构与约定。

---

## 一、技术栈

| 项 | 采用 |
| --- | --- |
| 框架 | Next.js 16.2.6（App Router，`output: "export"` 静态导出） |
| UI | shadcn/ui（底层 `@base-ui/react`） |
| 样式 | Tailwind CSS v4 |
| 状态 | Zustand + `persist`（localStorage，key `my-omni-workspace`） |
| 思维导图 | `@xyflow/react`（React Flow） |
| 日历 | 自建（`date-fns`） |
| 图片 | IndexedDB（`workspace-images`） |
| ~~脚本解析~~ | ~~`yaml`、`fast-xml-parser`、原生 `JSON`~~（日历标记脚本已弃用停用） |

---

## 二、目录结构

```
app/
  page.tsx           主布局（侧边栏/工作区分发/状态栏/搜索/设置/图片弹窗 + useGlobalShortcuts；useCalendarScripts 已弃用停用）
  layout.tsx         根布局（系统字体栈 + ThemeProvider + Toaster）
  globals.css        Tailwind 入口 + 主题 token（含 --solution / --warning / --chart-*）
components/
  app-sidebar.tsx            侧边栏（分类树、内置模板、日历入口、分类/章节拖拽排序）
  add-category-dialog.tsx    新建分类（模板/命名规则）
  topbar.tsx                 顶栏（标题、搜索、快捷键、主题、设置入口）
  novel-workspace.tsx        小说/通用分类（概览 + 章节编辑）
  mindmap-workspace.tsx      关系类（思维图画布 + 列表视图）
  mindmap/nodes.tsx          Todo 节点 / 解决方案节点卡片
  mindmap/node-inspector.tsx 节点详情编辑面板
  calendar-workspace.tsx     日历（月/周/日 + 当日详情 + 渲染事件）
  global-search.tsx          全局搜索
  settings-dialog.tsx        设置（默认视图/主题/字号/快捷键/配置/图片/备份；日历脚本入口已弃用停用）
  status-bar.tsx             底部状态栏
  theme-provider.tsx         主题 + 字号应用
  tag-picker.tsx             共用标签编辑器
  image-rich-input.tsx       富文本输入（粘贴图片 + 编辑/预览）
  rich-text.tsx              富文本渲染（{{img:id}} / ![](url)）
  calendar-scripts-dialog.tsx  日历标记脚本管理（已弃用停用：保留占位文件）
  config-editor-dialog.tsx     配置文件源文本编辑器
  image-cache-dialog.tsx       图片缓存/暂存区管理
  ui/                        shadcn 基础组件
hooks/
  use-shortcuts.ts           全局快捷键
  use-calendar-scripts.ts    日历脚本加载（已弃用停用：保留空壳）
lib/
  store.ts      useWorkspace（Zustand，全状态 + actions）
  types.ts      全部数据模型 + 模板/快捷键/状态/设置常量
  search.ts     搜索逻辑
  tags.ts       标签汇总
  deadlines.ts  思维图截止任务 → 日历
  image-store.ts   IndexedDB 图片存储
  image-refs.ts   图片引用扫描
  backup.ts       含图备份/恢复
  calendar-events.ts  事件总线 + 脚本运行时（已弃用停用：类型保留，运行时注释）
  icons.tsx / utils.ts
scripts/
  serve-static.mjs  本地静态托管
docs/
  CODING_PLAN.md / AGENTS.md / product-docs.md / calendar-script-docs.md
```

---

## 三、功能清单（现状快照）

| 模块 | 能力 |
| --- | --- |
| 侧边栏 | 内置模板快捷区、分类增删改名、分类/章节拖拽排序、展开折叠、日历入口、上下滚动 |
| 小说/通用 | 编号章节（命名规则+中文数字）、完成勾选、标签（共用）、正文富文本+图片、概览滚动+位置记忆、上/下篇 |
| 思维导图 | 画布增删移节点（画面中心新建）、单击/双击开详情、左键手柄连线、完成/隐藏、截止日期+长期、标签、解决方案（可拖拽、状态、绿线）、子树折叠、列表视图、Delete 键删除（带确认） |
| 日历 | 月/周/日、日期导航、笔记（富文本+图片）、待办、事件、思维图截止任务（~~渲染标记脚本~~ 已弃用停用） |
| 全局搜索 | 范围筛选（全部/当前分类/日历/Todo/思维图）、高亮、跳转 |
| 设置 | 默认视图、主题、字号滑块、自定义快捷键（~~日历标记脚本~~ 已弃用停用）、配置文件源文本、图片缓存/暂存、含图备份 |
| 交互 | Ctrl+N 新建 / Ctrl+B 日历 / Ctrl+K 搜索、文本框 Ctrl+A 全选 / Ctrl+S 保存、底部状态栏 |

---

## 四、关键架构与约定（仍具决策价值）

### 4.1 画布拖拽性能
- 画布位置由 React Flow 本地持有（`useNodesState`/`useEdgesState`）；**拖拽中不写 store**，仅在 `onNodeDragStop` 落库。
- 原因：旧实现把每次重建的 `nodes`/`edges` 喂给受控 `ReactFlow`，每帧触发整页重渲染与节点消失。参考：[React Flow Performance](https://reactflow.dev/learn/advanced-use/performance)、[xyflow #4287](https://github.com/xyflow/xyflow/issues/4287)。

### 4.2 ~~日历标记脚本（Event Bus）~~ —— 已弃用停用
- ~~事件：`RenderDateEvent { displayType: month|week|day, date, element, api }`；`emitRenderDate` 在月/周单元格渲染后按块触发。~~
- ~~脚本以「信任本地脚本」运行（`new Function` 注入 `renderDate/useLib/lib/console`），按脚本 id 管理订阅。~~
- ~~解析库：`yaml`、`fast-xml-parser`、`JSON`；`useLib('yaml'|'xml'|'json')` 或 `lib` 门面。~~
- 现状：运行时、加载器、触发点、store 字段/actions、管理弹窗与设置入口均已注释停用；`merge` 显式丢弃旧存档 `calendarScripts` 残留。恢复方式见 `docs/calendar-script-docs.md` 顶部说明。

### 4.3 图片系统（IndexedDB）
- 正文用引用 token `{{img:<id>}}`，图片二进制存 IndexedDB；也支持 `![](url)` 远程图。
- 粘贴（Ctrl+V）/「插图」→ `addImage` → 光标处插 token；`RichText` 渲染。
- 无引用图片进**暂存区**，在设置「图片缓存」查看/删除（被引用的不可删）。
- 含图备份：`exportBackup`（store + 被引用图 base64 单 JSON）/ `importBackup`（恢复 store + 幂等写回 IndexedDB）。

### 4.4 数据与向后兼容
- 持久化数据改动须在 `store.ts` 的 `merge`/`onRehydrateStorage` 做向后兼容（历史数据缺字段时并入默认值）。
- `connectNodes` 返回 `ConnectResult`（`created|exists|invalid`），用于区分新建/已连/非法。
- 思维图 `sub` 折叠语义保留；`hidden` 节点仅从画布/列表可见性变化，仍参与日历截止任务扫描。

### 4.5 校验
- 验收三件套：`npm run typecheck` + `npm run lint`（0 错误），开发机再 `npm run build`。

---

## 五、提交约定

见 `AGENTS.md` 第 7 节（Conventional Commits）。
