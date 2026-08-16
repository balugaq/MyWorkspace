# Git Commit 更新日志

> 本文件记录自上一个已提交点（`a029383`）以来，工作区累积的本轮开发改动，并给出推荐的 Conventional Commits 提交信息与下一步操作。

---

## 一、本轮改动概览（自上次提交以来的累积）

### 修复（fix）
- 修复 base-ui 下 `DropdownMenuTrigger` 使用 Radix `asChild` 导致的编译失败；改用 `render` prop、`data-popup-open`。
- 修复搜索框快捷键贴图出现双 ⌘ 图标；改为平台自适应（Win/Linux 显示 `Ctrl+K`，macOS 显示 `⌘K`）。
- 修复思维图「删除不了节点」「添加子任务不刷新」「子任务显示无关节点」三类交互 bug。
- 修复思维图拖拽卡顿与右键连节点时节点消失（根因：每帧把重建的 nodes/edges 喂给受控 React Flow）。
- 修复节点详情内容编辑卡顿（本地受控 + 防抖提交）。
- 修复 `next/font/google` 在离线/无 Google Fonts 环境下导致的 Turbopack 构建错误；改用 `globals.css` 系统字体栈。
- 修复浏览器翻译扩展向 `<body>` 注入属性导致的 hydration 不匹配告警（`suppressHydrationWarning`）。
- 修复多处 UI 溢出需滚动：节点详情、小说概览、标签弹层列表、设置弹窗、侧边栏滚动。

### 功能（feat）
- 侧边栏：内置模板快捷区；分类与章节**拖拽排序**；支持上下滑动。
- 小说/通用分类：概览可滚动并**记住滚动位置**；标签体系。
- 思维导图：
  - 子任务（Sub）管理与移除；节点折叠/展开子树。
  - 解决方案节点可拖拽并记忆位置。
  - 右键按住拖线（直虚线预览）连节点；连接动画在拖拽中暂停、松手恢复。
  - 节点标签、截止日期 + 长期任务，截止任务显示在日历。
  - 按 Delete/Backspace 删除节点，均带**删除确认弹窗**。
  - `connectNodes` 返回结果；重复连接提示「已经连接过此节点了！」。
- 全局：
  - 系统设置：默认视图、主题、**字体大小滑块**、自定义快捷键、日历标记脚本、配置文件源文本编辑器。
  - 文本框内 <kbd>Ctrl</kbd>+<kbd>A</kbd> 全选、<kbd>Ctrl</kbd>+<kbd>S</kbd> 保存。
  - 数据导出/导入（含 `calendarScripts`）。
- 日历标记脚本（Event Bus）：
  - 事件总线 `lib/calendar-events.ts`：`RenderDateEvent`、`CalendarDisplayType (month|week|day)`、脚本运行时。
  - 新增解析库依赖：`yaml`、`fast-xml-parser`。
  - 脚本管理 UI（新建/编辑/启停）+ 日历按日触发 `emitRenderDate`。
- 文档：`docs/calendar-script-docs.md`、`docs/product-docs.md`、更新 `docs/CODING_PLAN.md`、重写 `README.md`、撰写 `AGENTS.md`。

---

## 二、新增依赖

| 包 | 版本 | 用途 |
| --- | --- | --- |
| `yaml` | ^2.9.0 | 日历脚本解析 YAML |
| `fast-xml-parser` | ^4.5.7 | 日历脚本解析 XML |

---

## 三、推荐提交（Conventional Commits）

### 方案 A：一次主干提交（简单，个人仓库）
```bash
git add -A
git commit -m "feat: 全面增强个人工作台（笔记/思维图/日历/搜索/设置/脚本）" \
  -m "- 修复 base-ui asChild 编译错误、Google 字体离线构建错误、hydration 告警
- 侧边栏内置模板 + 分类/章节拖拽排序 + 滚动
- 思维图：子任务/折叠/右键拖线/节点删除确认/解决方案可拖拽/截止日期+长期任务/标签，修复拖拽卡顿与节点消失/子任务交互 bug
- 日历：渲染日期块 + RenderDateEvent 脚本总线（yaml/fast-xml-parser），日历脚本管理
- 设置：默认视图/主题/字号滑块/自定义快捷键/配置文件源文本编辑器
- 文本 Ctrl+A 全选、Ctrl+S 保存；数据导出/导入含脚本
- 文档：AGENTS/README/CODING_PLAN/product-docs/calendar-script-docs"
```

### 方案 B：按语义拆分（更清晰，建议）
```bash
# 1) 基础修复（编译/字体/hydration）
git add -A
git commit -m "fix: 修复 base-ui asChild、离线 Google 字体构建与 hydration 告警"

# 2) 侧边栏与分类
git add components/app-sidebar.tsx lib/store.ts lib/types.ts
git commit -m "feat: 侧边栏内置模板、分类/章节拖拽排序与滚动"

# 3) 思维图交互全面升级
git add components/mindmap-workspace.tsx components/mindmap/* lib/store.ts lib/types.ts hook
git commit -m "feat: 思维图子任务/折叠/右键拖线/删除确认/解决方案拖拽/截止日期/标签，并修复拖拽与子任务 bug"

# 4) 日历标记脚本（Event Bus）
git add lib/calendar-events.ts hooks/use-calendar-scripts.ts components/calendar-workspace.tsx components/calendar-scripts-dialog.tsx package.json package-lock.json
git commit -m "feat: 引入解析库并实现 RenderDateEvent 日历标记脚本总线"

# 5) 设置与搜索/文本快捷键/配置编辑
git add components/settings-dialog.tsx components/config-editor-dialog.tsx components/topbar.tsx hooks/use-shortcuts.ts
git commit -m "feat: 设置增加字号滑块/默认视图/主题/快捷键与配置文件编辑器，文本 Ctrl+A/S"

# 6) 文档
git add AGENTS.md README.md docs/
git commit -m "docs: 撰写 AGENTS/README/CODING_PLAN/product-docs/calendar-script-docs"
```
> 注：方案 B 按 `git add` 分文件提交，但部分文件（如 `lib/store.ts`）被多个功能共用，需自行按实际暂存内容拆解；若嫌麻烦直接用方案 A。

---

## 四、提交前自检

- [x] `npm run typecheck` 0 错误
- [x] `npm run lint` 0 错误
- [x] 未触碰 AGENTS.md 第 4 节红线（未破坏 localStorage 数据结构、未 force push、未改历史）
- [x] 不提交 `node_modules/`、`.next/`、`out/`、`.npm-cache/`、`*.tsbuildinfo`（已由 `.gitignore` 覆盖）

---
*本文件由 AI 依据工作区变更生成，提交与否取决于开发者。*
