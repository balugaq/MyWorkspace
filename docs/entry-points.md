# 功能入口点地图（方法/类名 描述，思维导图已细到小功能）

> 按「模块 → 入口点」列出。改某个功能时，先到这里定位入口再动代码。
> 本文件由 `AGENTS.md` 第 8 节拆分而来，是其技术型细节的唯一来源；`AGENTS.md` 只保留引用。

## 8.1 全局 / 布局

| 功能 | 入口点 |
| --- | --- |
| 主布局与工作区分发 | `app/page.tsx` 的 `Page`：渲染 `AppSidebar`、`Topbar`、`NovelWorkspace`/`MindmapWorkspace`/`CalendarWorkspace`/`ContactsWorkspace`/`VaultWorkspace`/`AIChatWorkspace`/`SettingsView`、`StatusBar`、`GlobalSearch`、`ConfigEditorDialog`、`ImageCacheDialog`；调用 `useGlobalShortcuts()` |
| 根布局 / 主题 / 字号 / Toaster | `app/layout.tsx` 的 `RootLayout`；`components/theme-provider.tsx` 的 `ThemeProvider` / `ThemeFromStore` / `FontSizeSetter` |
| 全局快捷键 | `hooks/use-shortcuts.ts`：`useGlobalShortcuts()`、`matchShortcut(e, binding)`；绑定在 `settings.shortcuts`（`SHORTCUT_META`） |
| 底部状态栏 | `components/status-bar.tsx` 的 `StatusBar`；右下角视图名取自 `lib/types.ts` 的 `VIEW_LABEL` |
| 桌面端侧边栏宽度（可拖拽） | `app/page.tsx` 的 `Page`：容器 `style={{ width: sidebarWidthLocal }}`，右侧 `role="separator"` 分隔条 `onMouseDown={startResizeSidebar}` |
| 全局顶栏 | `components/brand-header.tsx` 的 `BrandHeader` |
| 顶栏标题行 | `components/topbar.tsx` 的 `Topbar`：仅显示 title/subtitle |
| ai-chat 悬浮侧边栏 | `app/page.tsx` 的 `mobileNav` Sheet：ai-chat 下呼出侧边栏 |

### 字段说明

| 字段 / 方法 | 说明 |
| --- | --- |
| `VaultProvider` | 在 `app/layout.tsx` 包裹 `children`（保险库会话状态 / 密钥驻留内存） |
| `sidebarWidthLocal` | 侧边栏实时宽度本地 state（min 200 / max 420 px），松手写入 `sidebarWidth` / `setSidebarWidth`（`lib/store.ts`，刷新保留；旧存档缺字段回落默认 288） |
| `sidebar` 与分隔条条件渲染 | 仅 `view !== "ai-chat"` 时渲染（ai-chat 下经悬浮 Sheet 呼出） |
| `BrandHeader` 品牌区 | `brandClickable` 为 true 时渲染为可点按钮（`onBrandClick`）；由 `app/page.tsx` 仅在 `view === "ai-chat"` 时传 true |
| `BrandHeader` 右侧按钮 | 头像（`goProfile`）/ 搜索（`onOpenSearch`）/ 设置（`goSettings`）/ 主题（`useTheme` + `settings.theme`）；搜索 / 设置 / 主题自 Topbar 迁入 |
| 头像来源 | 读 `settings.aiUserAvatar`，空回落 `User` 图标 |
| `Topbar` 隐藏 | ai-chat 下 title 为空且整行由 `app/page.tsx` 条件隐藏（含移动端 PanelLeft 按钮） |
| `mobileNav` 自动关闭 | `view` / `activeCategoryId` 变化时 `useEffect` 自动关闭 |

- **数据链路**：布局组件从 `useWorkspace` 订阅 `view` / `settings` / `activeCategoryId`；导航动作（`goXxx`）→ `set` → 重渲染。
- **See also**：[`docs/entry-points.md`](./entry-points.md) §8.2（侧边栏）、§8.15（个人主页）。
- **Notice**：新增视图须同时在 `lib/types.ts` 的 `VIEW_LABEL` 补一项，否则状态栏显示成「工作台」；`view` 联合类型 + `goXxx` action 见 `lib/store.ts`。

## 8.2 侧边栏（`components/app-sidebar.tsx`）

| 功能 | 入口点 |
| --- | --- |
| 侧边栏容器 | `AppSidebar` |
| 内置模板快捷区 | `TemplateQuickAdd`（调用 store `addCategory`） |
| 分类项（增删改、折叠、操作菜单） | `CategoryItem` |
| 日历导航入口 | `CalendarNavItem`（调用 `goCalendar`） |
| AI 助手导航入口 | `AIChatNavItem`（调用 `goAIChat`） |
| 联系人导航入口 | `ContactNavItem`（调用 `goContacts`） |
| 密码保险库导航入口 | `VaultNavItem`（调用 `goVault`） |
| 头像按钮（打开个人主页） | 已迁至全局顶栏 `components/brand-header.tsx` 的 `BrandHeader`：读 `settings.aiUserAvatar`，空回落 `User` 图标；点击调用 `goProfile` |
| 折叠按钮 | `AppSidebar` 顶部窄行（仅传入 `onCollapse` 时渲染）：`PanelLeftClose` icon 按钮，悬浮 sidebar（Sheet）内关闭抽屉 |
| 新建分类弹窗 | `components/add-category-dialog.tsx` 的 `AddCategoryDialog` |
| 分类/章节拖拽排序 | 分类 `moveCategory(from,to)`、章节 `moveChapter(catId,from,to)`（储存在 `lib/store.ts`）；注意小分类（章节）`draggable` 嵌套在大分类容器内，章节 `onDragStart` 须 `stopPropagation()` 防止 `dataTransfer` 的 id 被外层覆盖成分类 id |

## 8.3 小说 / 通用分类（`components/novel-workspace.tsx`）

| 功能 | 入口点 |
| --- | --- |
| 工作区分发（概览 / 编辑） | `NovelWorkspace`（按 `activeItemId` 切 `ChapterOverview` / `ChapterEditor`） |
| 概览网格 + 滚动位置记忆 | `ChapterOverview`（用 `scrollRef` 经 viewport 恢复/保存 `scrollTop`） |
| 章节编辑器 | `ChapterEditor`（标题、正文 `RichTextEditor`、标签 `TagPicker`、完成 `Checkbox`、上/下篇 `updateChapter`/`removeChapter`） |
| 列表卡片预览隐藏图片 token | `stripImageTokens`（novel-workspace 内） |

## 8.4 思维导图（`components/mindmap-workspace.tsx` + `components/mindmap/*`）— 细到小功能

**容器与视图**
| 功能 | 入口点 |
| --- | --- |
| 工作区外壳 + 视图切换 | `MindmapWorkspace`（`setRelationView` 切 mindmap/list；`ViewBtn`） |
| 鸟瞰模式 | `MindmapWorkspace` 右上角「鸟瞰」按钮（`birdView` 状态）；开启时 `minZoom` 降到 `0.02` 并 `fitView()`，临时禁用 `nodesDraggable`/`nodesConnectable`；退出恢复 `minZoom=0.5` |
| 画布 | `Canvas`（`ReactFlow` + `ReactFlowProvider`） |
| 视口记忆（x/y/zoom） | `Canvas` 读 `store.mindmapViewports[category.id]`（有效存档经 `defaultViewport` 恢复，此时初始 `fitView` 关闭；无存档保持 fitView）；`onMoveEnd` → `setMindmapViewport` 写回（按分类 id 持久化） |
| 列表视图 | `ListView`（含「添加节点」按钮 `addNode`、完成/隐藏/解决方案徽标） |
| 节点类型注册 | `nodeTypes = { todo: TodoNode, solution: SolutionNode }` |

**节点生命周期**
| 功能 | 入口点 |
| --- | --- |
| 新建节点 | `addAtCenter()`（`screenToFlowPosition` 画面中心 → `addNode(category.id, pos)`）；列表视图 `ListView` 的添加按钮（`addNode`） |
| 双击画布新增 | `onPaneClick`（pane 单击计时模拟双击建节点） |
| 移动节点（拖拽不卡顿） | `onNodeDragStop`（`onNodeDragStop` 一次写回 `updateNode{position}`；拖拽中走 `useNodesState` 本地态） |
| 打开节点详情 | `onNodeClick` / `onNodeDoubleClick`（均 `setActiveItem(n.id)`） |
| 删除节点 | 详情 `NodeInspector` 删除按钮 / 画布 `Delete`/`Backspace`（`pendingDeleteId` + `AlertDialog` 确认 → `removeNode`）；全新节点（`isPristineNode`，见 `lib/mindmap.ts`）删除免确认 |
| 子节点位置 | 「添加子节点」在父节点右侧同高生成（不按索引下移） |

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
| 内容（富文本 + 粘贴图片 + GitHub 卡） | `RichTextEditor`（TipTap v3；粘贴图片经 `lib/image-store.ts` 落库并插入 `imgref:<id>` 节点；粘贴 GitHub Issue/PR 链接自动升级为 `githubCard` 节点；详见 §8.10） |
| 标签（共用） | `TagPicker`（`patch({ tags })`） |
| 完成 | `patch({ done })`（`Checkbox`「已完成」） |
| 在图里隐藏 | `patch({ hidden })`（`Checkbox`「在图里隐藏」；隐藏后仅列表显示） |
| 截止日期 / 长期任务 | `patch({ dueDate | longTerm })`（`Input type=date` + 「设为长期」按钮） |
| 解决方案 + 状态 | `setNodeSolution(catId, nodeId, content, status)`；状态 `doing|paused|done`（`STATUS_META`） |
| 节点风格（边框色 / 背景色 ARGB + 透明度） | `ColorField`（`patch({ borderColor | bgColor })`）；预设 `NODE_PALETTE` + 原生 color input（RGB）+ 透明度滑块（0–100%）+ `randomHarmoniousColor()` 随机和谐色 + 「清除」回落主题默认；存储串 `#AARRGGBB`，转换 `argbToCss`（`lib/color-utils.ts`） |

**节点卡片（`components/mindmap/nodes.tsx`）**
| 功能 | 入口点 |
| --- | --- |
| Todo 节点卡片 | `TodoNode`（标题 + `done` 删除线/✓、原因/导向/结果、**内容常显** via `RichText`、子任务折叠钮、标签/截止/长期徽标） |
| 自定义边框/背景色 | `TodoNode` 经 `argbToCss`（`lib/color-utils.ts`）把 `node.borderColor` / `node.bgColor`（ARGB `#AARRGGBB`）转 `rgba()` 以 inline style 覆盖默认；空值回落 `border-border` / `bg-card` |
| 长文本/超长串防溢出 | `RichText` 容器用 `overflow-wrap:anywhere` + `break-words`；图片 `fullSize` 加 `max-w-full`；原因/导向/结果行加 `min-w-0` + 任意断词，避免无空格长串（如 URL）撑破 `max-w-[50vw]` 卡片；滚动条 / 溢出 / 限宽的通用约定见 [`ui-conventions.md`](./ui-conventions.md) |
| 图片原尺寸展示 | `RichText` 传 `fullSize`（`h-auto w-auto`，可撑破卡片；卡片 `w-auto min-w-56 max-w-[50vw]`） |
| 解决方案节点卡片 | `SolutionNode`（绿框 + 状态 `STATUS_META`） |
| 子树折叠 | `TodoNode` 折叠按钮 → `onToggleCollapse`（Canvas 内 `collapsed` Set，纯视图态） |

**隐藏 / 过滤**
| 功能 | 入口点 |
| --- | --- |
| 用户隐藏节点不出现在画布 | `Canvas.rfNodes`/`rfEdges` 跳过 `n.hidden`；列表 `ListView` 仍显示 |
| store→画布同步 | 本地画布态 sync effect（`useNodesState`/`useEdgesState` 的 `setNodes`/`setEdges`） |

## 8.5 思维导图 store actions（`lib/store.ts`）

| 功能 | 方法 |
| --- | --- |
| 节点增删改 | `addNode`（返回新 id）、`updateNode`、`removeNode`（清理关联线 + 子引用） |
| 解决方案 | `setNodeSolution` |
| 连线 | `connectNodes(catId, src, tgt, kind)`（返回 `ConnectResult`）、`removeEdge` |
| 视图 | `setRelationView` |
| 视口存档 | `setMindmapViewport(catId, { x, y, zoom })`（写 `mindmapViewports`；persist merge 对旧存档兜底为 `{}`） |
| 导入数据合并 | `mergeData(json)`（分类按 id 合并、日历按日期合并），`mergeById`/`mergeCalendarDay` 辅助 |

## 8.6 日历（`components/calendar-workspace.tsx`）

> 显示风格参考 `.ref/SimpleCalendar`（仅月视图 + 日期格装饰要素）。当前为**纯月视图**。

| 功能 | 入口点 |
| --- | --- |
| 月视图 + 导航 | `CalendarWorkspace`（固定月视图、`shift`=addMonths、`days` 当月完整网格、回今天按钮（离开当月出现）） |
| 日期格装饰 | 单元格内：日期数字分层配色（today/选中/周末红/生日绿/放假日红/上班日蓝/节气紫）、右上角「假/班/🎂」角标、底部节日名或 `M/d` 小字、顶部笔记圆点、待办截止计数徽标；内置要素（节气/法定假日/调休）来自 `lib/festivals.ts` 的 `builtinChinaFestivals()` |
| 切月动画 | 网格容器 `key={format(current,"yyyy-MM")}` 重建触发淡入；纯淡入（非 SimpleCalendar 的滑入滑出） |
| 当日详情 | `DayDetail`（笔记 `RichTextEditor` → `setDayNote`；待办 `addCalendarTodo/toggleCalendarTodo/removeCalendarTodo`；事件 `addCalendarEvent/removeCalendarEvent`；生日列表 + 农历日期） |
| 思维图截止任务显示 | `collectDueNodes`（`lib/deadlines.ts`）+ 日格徽标 + 详情跳转（`setActiveCategory`/`setActiveItem`） |
| 内置中国日历要素 | `lib/festivals.ts` 的 `builtinChinaFestivals(year,month,day)`：返回二十四节气(`kind:"jieqi"`)与法定假日/调休(`kind:"holiday"`)，与 `custom_festivals.yml` 用户节日在 `calendar-workspace.tsx` 按 `[...builtin, ...userFests]` 合并（内置优先，shortHint 取首项）；`HolidayUtil` 仅覆盖约 2010–2026，空窗由 YAML 的 `holiday_override`/`workday_override` 兜底（见 `docs/custom-data-docs.md` 1.4） |
| 节日/生日数据 | 只读加载 `public/custom_festivals.yml`、`public/address_book.yml`（见 `docs/custom-data-docs.md`） |
| 节日类型 `FestivalKind` | `lib/festivals.ts` 导出联合类型 `FestivalKind`（`"monthDay"|"date"|"weekdayOfMonth"|"lunar"|"jieqi"|"holiday"`），`Festival.kind` 引用之；节气/法定假日用 `jieqi`/`holiday` |

## 8.7 全局搜索

| 功能 | 入口点 |
| --- | --- |
| 搜索逻辑 | `lib/search.ts` 的 `runSearch(categories, calendar, query, scope, activeCategoryId)` |
| 搜索 UI + 跳转 | `components/global-search.tsx` 的 `GlobalSearch`（`TYPE_ICON`、`Highlight`、`jump`） |

## 8.8 设置（`components/settings-view.tsx`）

> 设置已从弹窗改造为独立 view；分区顺序：通用 / 基础 → 快捷键 / 键位 → 账户与同步 → AI 助手 → 高级 → GitHub 集成。打开入口为 `goSettings()`（`lib/store.ts` → `set({ view: "settings" })`）。

| 功能 | 入口点 |
| --- | --- |
| 默认视图 / 主题 | `SettingsView` 的 `Select`（`updateSettings({ defaultView | theme })`） |
| 字体大小滑块 | `SettingsView` 的 range → `updateSettings({ fontSize })` |
| 每天翻篇时间 | `SettingsView` 的 `Input type="time"`（`updateSettings({ dayStartOffset })`，HH:mm） |
| 快捷键编辑 | `ShortcutRow`（录音捕获 → `setShortcut`） |
| 配置源文本编辑 | 入口 `setConfigEditorOpen` → `ConfigEditorDialog`（`exportData` / `importData`） |
| 图片缓存 / 暂存 | 入口 `setImagesOpen` → `ImageCacheDialog`（`getImageInventory`） |
| 备份（含图 + 保险库） | `exportBackupZip(sections?)` / `importBackupZip()`（`lib/backup.ts`）；导出前由 `SettingsView` 的「选择导出内容」弹窗勾选分区 |
| 备份 ZIP 实现 | `lib/backup.ts` 使用 `fflate`（`zipSync` / `unzipSync`），**禁止手写 ZIP 读写** |
| 备份分区元信息 | `BACKUP_SECTION_META` / `DEFAULT_EXPORT_SECTIONS`（`lib/backup.ts`）；分区类型 `BackupSectionId` / `BackupSections`（`lib/types.ts`） |
| 开源许可证页面 | 入口按钮（`Scale` 图标）→ `LicenseDialog`；数据在 `lib/licenses.ts` 的 `THIRD_PARTY_LICENSES` |

### 字段说明

| 持久化字段 | 说明 |
| --- | --- |
| `settings.defaultView` | 启动默认视图（`workspace` / `calendar` / `ai-chat` / `last`） |
| `settings.theme` | 浅色 / 深色 / 跟随系统 |
| `settings.fontSize` | 全局基础字号 |
| `settings.dayStartOffset` | 每天翻篇时间（HH:mm，默认 "04:00"）；`lib/contributions.ts` 的 `normalizeDayStartOffset` 兜底非法值 |
| `settings.shortcuts` | 快捷键绑定（`SHORTCUT_META`） |
| 备份 ZIP 内容 | `workspace.json` / `images/*` / `vault.json`（AES-256 加密 blob，替换模式下恢复）；导入按「替换 / 合并」两种模式 |
| 备份分区（v5） | `notes`=categories、`calendar`、`ai`=conversations+activeConversationId、`contributions`、`notifications`=notifications+notificationLogs+notificationWatermark、`githubQueue`=issueQueue、`contacts`（TODO 48 持久化前不可导出）、`vault`=ZIP 内 vault.json；`settings` 与 `images/*` 始终携带。**联系人 / 密码保险库为敏感分区，默认不导出**；导入（替换 / 合并）只处理备份携带的分区，未携带的分区保留当前数据。**新增可导出数据时：扩 `BackupSectionId` + `BACKUP_SECTION_META` + `exportData` / `importData` / `mergeData` 对应分支，并同步本表** |
| `THIRD_PARTY_LICENSES` | 名称 / 作者 / 描述 / 许可证链接，按 `--------<名称> / 作者: / 描述: / 许可证:` 格式渲染 |

- **数据链路**：设置项 UI → `updateSettings` → `useWorkspace` → 防抖 `setItem` → localStorage（详见 [`docs/data-storage.md`](./data-storage.md) §1）。
- **See also**：[`docs/data-storage.md`](./data-storage.md) §1（设置持久化）、§3（保险库 blob）。
- **Notice**：`merge` 对旧存档缺字段兜底（如 `dayStartOffset→"04:00"`、`notificationChannels` 默认）；新增设置项须同步 `lib/types.ts` 的 `Settings` 与 `DEFAULT_SETTINGS`。

## 8.9 图片系统

| 功能 | 入口点 |
| --- | --- |
| IndexedDB 存储 | `lib/image-store.ts`：`addImage`（**内容寻址**：id = blob 的 SHA-256，相同字节复用同一 id 并解除暂存）、`getImageURL`、`getImageBlob`、`deleteImage`、`listImages`、`setStaged`、`exportImages`、`importImages`、`imageBlobsFromClipboard`（一次粘贴/多选可返回多张图片 blob） |
| 引用扫描 | `lib/image-refs.ts`：`imageIdsInText`、`collectReferencedImageIds`（正则同时匹配旧 `{{img:id}}` 与新 `imgref:id` 两种协议） |
| 含图备份 | `lib/backup.ts`：`exportBackup`、`importBackup`、`getImageInventory` |
| 图片渲染组件 | `components/rich-text.tsx`：`StoredImg`（`imgref:id` → IndexedDB blob URL）、`MarkdownImg`（`![](url)` 远程图，识别 `isImgref` 时回退 `StoredImg`） |
| 旧协议兼容 | `components/richtext/normalize.ts`：`normalizeLegacyImg(md)` 把遗留 `{{img:<id>}}` 在读取时归一为 `![图片](imgref:<id>)`；导出 `IMGREF_PREFIX` / `isImgref` / `imgrefId` |

## 8.10 富文本 / 思维导图节点卡片（TipTap v3）

> 正文（章节 / 思维图节点 / 日历笔记）统一为 **Markdown 字符串** 存储，编辑与预览共用 TipTap v3 + `tiptap-markdown` 扩展，往返保持 Markdown 串（无需数据迁移）。旧 `{{img:<id>}}` 在读取时由 `normalizeLegacyImg` 归一为新协议。

| 功能 | 入口点 |
| --- | --- |
| 共享扩展集 | `components/richtext/extensions.ts`：`richTextExtensions` = `StarterKit` + `StoredImage`（重写 image 节点，渲染 `imgref:`，NodeView 走 IndexedDB）+ `TaskList` + `TaskItem` + `GitHubCard`（atom 节点）+ `BilibiliCard`（atom 节点）+ `FormatColor`（16 色文本标签 mark，见下）+ `Markdown`（`html:false`/`breaks:true`/`transformPastedText`） |
| 16 色文本标签 | `lib/format-colors.ts`：`FORMAT_COLORS`（Minecraft §0–§f 调色板）+ `FORMAT_COLOR_TAG_AT/_RE` + `stripFormatColorTags`；`components/richtext/format-color.ts`：`FormatColor` mark——markdown-it 内联规则把 `<blue>…</blue>` 等拆 token 渲染为 `<span data-format-color>`（经 parseHTML 归 mark），`storage.markdown.serialize` 序列化回标签，往返无损；`MarkdownView` 的 `renderInline` 用颜色栈消费 html token 同步支持（原始 HTML 仍不渲染）。AI 侧引导：系统提示词（`request-queue.ts` `SYSTEM_BASE`）+ `wb_format_guide` 内置技能 |
| 代码块（行号 + 语言角标） | `components/richtext/code-block.ts`：`CodeBlockEnhanced` = `CodeBlockLowlight.extend({ addNodeView })`——NodeView 渲染 `.code-block-wrap`（行号 gutter + `pre>code` contentDOM + 语言角标），语法高亮仍由 lowlight decoration 插件负责；样式在 `globals.css`（`.code-block-wrap/.code-block-gutter/.code-block-lang`），字号 0.95em（原 pre/code 双重 0.85em 叠乘仅 ~0.72em 是偏小根因） |
| 编辑器（受控） | `components/richtext/rich-text-editor.tsx`：`RichTextEditor`（`value`=Markdown 串、`onChange`→`getEditorMarkdown(editor)`）；**默认源码模式**（可编辑处一律显示原始 Markdown），右上角「源码/可视化」切换；`immediatelyRender:false`，`onCreate`/`useEffect` 运行 `upgradeLinkCards`；`handlePaste` 拦截 GitHub/B 站链接（插入卡片）与图片 blob（落库插入 `imgref:` 节点）；**外部 `value` 同步在源码模式下跳过**（否则升级卡会经 `onChange` 回写，把刚输入的回车/空格等被 markdown 规范掉的空白抹掉） |
| 只读预览 | `components/richtext/rich-text-view.tsx`：`RichTextView`（`editable:false`，同一扩展集），用于节点卡片/概览 |
| 选区气泡工具条 | `components/richtext/selection-toolbar.tsx`：`SelectionToolbar`（`BubbleMenu`，复制纯文本 / X 复制富文本 HTML / 全选 / 引用；`shouldShow` 对 image/githubCard/bilibiliCard 选区隐藏） |
| 存储图片节点 | `components/richtext/stored-image.tsx`：`StoredImage` = `Image.extend({name:"image"})` + `ReactNodeViewRenderer`，`isImgref(src)` 时渲染 `StoredImg`，否则 `MarkdownImg` |
| GitHub 预览卡（数据层） | `lib/gh-card.ts`：`parseGithubUrl` / `isGithubIssueUrl` / `getOgImageSrc(ogUrl)`（OG 直链 + IndexedDB blob 缓存，零 API、无 CORS）/ `fetchGithubCard(url, token)`（REST `api.github.com` + `Authorization: Bearer <token>`，IndexedDB 缓存 `CACHE_MS=6h`，降级友好）；独立库 `workspace-gh`（stores `cards`/`imgs`） |
| GitHub 预览卡（节点） | `components/richtext/github-card.tsx`：`GitHubCard`（atom 节点，attrs `url`）；**opengraph 风格**：顶部 OG 图 banner + 标题 + 状态徽标 + 标签 + **底部保留可点击的原始链接文字**；`addStorage().markdown.serialize` 输出裸 URL（重加载经 `upgradeLinkCards` 再次成卡） |
| B 站预览卡 | `lib/bilibili.ts`：`parseBilibiliUrl`（提取 BV 号；`b23.tv/xxx` 短链无法解析 BV 则降级）/ `isBilibiliUrl` / `fetchBilibiliCover`（api.bilibili.com 公开视频信息接口取封面，按 BV 模块级缓存、失败负缓存）/ `getCachedBilibiliCover`；`components/richtext/bilibili-card.tsx`：`BilibiliCard`（atom 节点，attrs `url`），渲染封面占位（失败降级 ▶ 占位图）+ 原始链接文字，整卡新标签页跳转 B 站——TODO 35 起**不再内嵌播放器 iframe**（避免常驻加载视频流占 GPU/内存） |
| 链接升级 | `components/richtext/upgrade.ts`：`upgradeLinkCards(editor)` 扫描文档裸 `github.com/.../(issues|pull)/\d+` 与 `bilibili.com/video/BV…`、`b23.tv/…` 文本，替换为 `githubCard` / `bilibiliCard` 节点（带 guard 上限，防死循环；本环境 prosemirror `Node` 推断异常，回调形参桥接为 `any`；替换内容须用 `JSONContent[]` 而非 Node 实例） |
| 图片协议重构 | 旧 `{{img:<id>}}` → 标准 Markdown `![alt](imgref:<id>)`（`imgref` scheme 指向 IndexedDB）；读取时 `normalizeLegacyImg` 兼容，无需批量迁移 |
| 设置项（GitHub 集成 / 账户与同步） | `components/settings-view.tsx` 的「GitHub 集成」「账户与同步」分区；对应 `lib/types.ts` 的 `Settings.githubToken` / `DEFAULT_SETTINGS.githubToken` 与 `settings.userName` |

### 字段说明

| 持久化字段 | 说明 |
| --- | --- |
| `settings.githubToken` | GitHub Token，明文存 localStorage，预览卡与仓库扫描共用（有泄露风险，已注明） |
| `settings.userName` | 贡献比对名称（「账户与同步 → 名称」）；原独立 `gitUserName` 字段已删除，不做旧数据迁移 |

> 注：`components/markdown-view.tsx`（`MarkdownView`，基于 `marked` lexer 的手工渲染）仍保留，供列表卡片 `clamp` 两行截断预览使用；思维图节点卡片 `components/mindmap/nodes.tsx` 已改用 `RichTextView`，以便节点卡片也能呈现 GitHub/B 站预览卡（代价是每个可见节点一个只读编辑器实例，节点极多时留意性能）。`components/image-rich-input.tsx`、`components/rich-text.tsx` 中 `DebouncedTextarea` 已删除，富文本入口统一为 `RichTextEditor`。

## 8.11 密码保险库（Vault）

> `name : value` 自由键值对（名称/值均由用户填写，不预设账号/密码字段）；AES-256-GCM 加密后存入 IndexedDB，主密码经 PBKDF2 派生，密钥仅驻留内存。

| 功能 | 入口点 |
| --- | --- |
| 导航 | 侧边栏 `VaultNavItem`（`goVault`）→ `app/page.tsx` 切 `VaultWorkspace` |
| 视图外壳 | `components/vault/vault-workspace.tsx`：`VaultWorkspace`（按 `status` 切 `CreateVault`/`UnlockVault`/`VaultHome`）；值显示保留换行（`whitespace-pre-wrap`），隐藏态打码 |
| 会话状态 / 加解密 | `components/vault/vault-provider.tsx`：`VaultProvider`/`useVault`（`create`/`unlock`/`lock`/`addEntry`/`updateEntry`/`removeEntry`/`changePassword`/`destroy`）；密钥存 `keyRef`/`saltRef`，操作均重加密落盘 |
| 加密原语 | `lib/crypto.ts`：`deriveKey`（PBKDF2 150k + AES-256-GCM）、`encryptText`/`decryptText`、`generateSalt`/`generateIv`；统一用 `Uint8Array<ArrayBuffer>` 规避 TS5.9 对 Web Crypto `BufferSource` 的严格校验 |
| 加密数据存取 | `lib/vault-store.ts`：`loadVaultBlob`/`saveVaultBlob`/`hasVault`/`clearVault`、`exportVault`/`importVault`（base64 序列化，供备份搬运） |
| 备份集成 | `lib/backup.ts`：`exportBackupZip` 写入 `vault.json`（加密 blob base64）；`importBackupZip` 在「替换」模式下 `importVault` 恢复（合并模式因加密数据无法无密码合并而跳过） |
| 安全上下文 | Web Crypto 仅 `https`/`localhost` 可用；`crypto.subtle` 不可用时 `getSubtle()` 抛出明确错误 |

## 8.12 联系人（`components/contacts-workspace.tsx`）

> 只读通讯录：数据来自 `public/address_book.yml`，用户自行编辑该文件，界面不可增删改。

| 功能 | 入口点 |
| --- | --- |
| 工作区分发 | `app/page.tsx` 按 `view === "contacts"` → `ContactsWorkspace` |
| 视图 state / 切换 | store `view`（`"workspace" | "calendar" | "contacts" | "vault" | "ai-chat" | "profile"`）+ `goContacts`；侧边栏 `ContactNavItem` |
| 列表 + 搜索 | `ContactsWorkspace`：`loadAddressBook()`（`lib/address-book.ts`）+ `query` 过滤（范围含 name/description/birthday/address/roles/contact，见 `filtered`） |
| dropdown 展开 contact | `ContactsWorkspace` 内 `expanded` Set + `toggle(name)`；每个 contact 项含复制按钮（`navigator.clipboard.writeText` + toast） |
| 数据模型 | `lib/address-book.ts`：`Person` / `ContactItem` / `AddressBookFile` / `loadAddressBook` / `parseBirthday` |

## 8.13 AI 助手（`components/ai-chat.tsx` + `lib/ai/*`）

> 纯前端直连 OpenAI 兼容端点（`output: "export"` 无后端路由），API Key 仅存本机 localStorage。
> 多会话架构：每个会话各持完整上下文，持久化到 store。
> **流式请求的所有权在 `lib/ai/request-queue.ts` 全局单例队列**（不在组件里），因此切换会话 / 切走视图都不会中断在途请求。

**视图与会话**
| 功能 | 入口点 |
| --- | --- |
| 视图外壳 + 会话侧栏 | `components/ai-chat.tsx` 的 `AIChatWorkspace`；会话列表新建/切换/重命名/删除，侧栏宽度可拖拽（`draggingRef` + `latestWidthRef`，默认 256） |
| 导航与分发 | 侧边栏 `AIChatNavItem`（`goAIChat`）→ `app/page.tsx` 按 `view === "ai-chat"` → `AIChatWorkspace` |
| 会话 store actions | `lib/store.ts`：`createConversation` / `selectConversation` / `deleteConversation` / `renameConversation` / `togglePinConversation` / `setConversationMessages`；`pendingAiQuery` **不持久化**（刷新不重发，见 `onRehydrateStorage`） |
| 列表分组与排序 | `components/ai-chat.tsx`：`groups`（`useMemo`）按锚点时间分组——锚点=最后一条 user 消息 `createdAt`，否则 `updatedAt`；分组为 置顶 / 今天 / 昨天 / 7天内 / 30天内 / `YYYY-MM`（每月）；组内按锚点倒序；继续对话后锚点刷新自动置顶。消息时间戳在 `lib/ai/request-queue.ts` 构造处填 `createdAt: Date.now()`（`AIChatMessage.createdAt`，可选，旧存档回落） |
| 置顶 + 更多操作菜单 | 列表项右侧重命名/删除双按钮改为 **3 点 kebab 菜单**（base-ui `DropdownMenu`，`components/ui/dropdown-menu`）：含「置顶/取消置顶」「重命名」「删除（destructive + 分隔线）」；列表按 `pinned` 置顶排序（`ordered`）；`Conversation.pinned?: boolean`（`lib/types.ts`，旧存档缺字段回落 false，免迁移） |
| React 钩子 | `lib/ai/use-ai-chat.ts`：`useAIChat({ config, conversationId })` → `{ messages, isLoading, send, stop, regenerateLast }`；经 `useSyncExternalStore` 订阅队列 |
| 请求队列 | `lib/ai/request-queue.ts`：`enqueue` / `regenerate` / `stopConversation` / `subscribeQueue` / `getMessagesSnapshot` / `isWorking`；模块级 `liveMessages` / `streaming` / `queued` 为临时态，不落盘 |
| 强制同步 | `settings.aiForceSync` 为 true 时所有会话串行（单队列），false 时允许并发（同一会话仍不会重复发起） |
| 消息渲染 | 用户/助手消息统一走 `RichTextView`（与节点内容同管线：表格/代码高亮/链接卡/内文图一致生效）；空状态预置问题 `PRESET_QUESTIONS`；复制原文 `copyText`；消息外层 div 挂 `data-msg-id` / `data-msg-role` 供 query bar 定位 |
| Query bar（问题导航，桌面端） | `AIChatWorkspace`：`userMsgs`（`useMemo` 过滤非空 user 消息）→ `visibleTitles`（最近 9 条，旧上新下）；title 文本 `shortQueryTitle`（>20 字 slice + 「…」）；滚动追踪 `activeQueryId`（监听 ScrollArea viewport 的 scroll 事件，rAF 节流，取视口上半部最近一条用户消息 DOM）；点击 `jumpToQuery` → `animateScrollTop`（easeInOutQuad，500ms，直接写 viewport scrollTop）；当前提问 title 蓝色高亮 + 左侧蓝色横标，其余灰色 hover 变白（`transition-colors duration-100`）；bar 位于右侧 `11.11vw` hover 热区列（`hidden md:flex`），默认 `opacity-0` 悬停显形，内部 `ScrollArea` 滚动 |
| 状态栏 | `components/status-bar.tsx` 的 `case "ai-chat"`：轮数 + 输入/输出 token（3 位有效数字缩写） |

**模型 / 提示词 / 人设**
| 功能 | 入口点 |
| --- | --- |
| 供应商与模型解析 | `lib/ai/providers.ts`：`AI_PROVIDERS`（`zcode` 智谱 / `deepseek` / `custom`）+ `resolveProvider(providerId, apiKey, customBaseURL, selectedModel)`；实际模型来自设置 `aiModels` + `aiActiveModelId`（管理 UI `ModelManagerDialog`） |
| system 提示词 | 队列内 `buildSystemPrompt()` = `SYSTEM_BASE` + 当前人设正文 + 当前时间；**每次请求重新读取设置**，切人设无需重建组件 |
| 人设（多套） | `settings.aiPersonas` + `aiActivePersonaId`；管理 UI `PersonaManagerDialog`；旧存档单一 `aiPersona` 字符串由 `lib/store.ts` 的 `migratePersona` 升级为「默认人设」 |
| 头像 | `settings.aiUserAvatar` / `aiAssistantAvatar`（data URL；设置里压缩至最长边 256px 转 JPEG，避免撑爆 localStorage） |

**技能（Skills）**
| 功能 | 入口点 |
| --- | --- |
| 说明型技能（用户自定义） | `lib/ai/skills.ts`：`loadSkills()` 读 `public/skills/manifest.json` 再并发取各 `.md`；文件名 slug 作 tool 名、`# 标题` 作展示名、标题后首段作描述、**全文作说明书正文**（AI 调用时回传给模型）；任何失败安全降级为 `[]` |
| 内置可执行技能 | `lib/ai/builtin-skills.ts`：`BUILTIN_SKILLS`（`BUILTIN_SKILL_DISPLAY` 为展示用），tool 名 `wb_` 前缀，**纯只读查询**；当前含 `wb_get_day_note` / `wb_get_dates_with_notes` / `wb_get_day_calendar_data` / `wb_get_contact_names` / `wb_get_contact` / `wb_get_categories` / `wb_get_chapters` / `wb_get_chapter_content` / `wb_get_mindmap_graph` / `wb_get_mindmap_node` / `wb_format_guide`（富文本 16 色标签 + Markdown 格式规范，TODO 32）；新增须保持只读且返回可 JSON 序列化的结果 |
| 技能启停 | `settings.aiEnabledSkills`（`null` = 全部启用）；UI `SkillsToggleDialog`；队列内 `isSkillEnabled` 同时过滤说明型与内置技能 |
| 工具调用与展示 | 队列用 AI SDK 的 `streamText` + `tool()` + `stepCountIs`；调用过的技能记入 `AIChatMessage.tools`（UI 以 `Wrench` 徽标展示），token 记入 `AIChatMessage.tokens` |
| 跨视图提问 | store `askAiAbout(text)`：新建会话 → 切 `ai-chat` → 挂起 `pendingAiQuery`，由 `AIChatWorkspace` 在会话就绪后消费并 `clearPendingAiQuery`；日历 `DayDetail` 的「问 AI」（`askFestival` / `askNote`）走此路径 |
| 容错 | 队列自定义 `fetch` 在 abort 时把 reject 转为空响应以避免 unhandled rejection；用户点「停止」视为预期行为，静默收尾不报错 |

> 相关类型集中在 `lib/types.ts`：`AIProviderId`、`AIPersona`、`AIChatMessage`、`Conversation`（含 `pinned?`），以及 `Settings` 的 `aiModels` / `aiActiveModelId` / `aiEnabledSkills` / `aiUserAvatar` / `aiAssistantAvatar` / `aiForceSync` / `aiPersonas` / `aiActivePersonaId`。

### 字段说明

| 持久化字段 | 说明 |
| --- | --- |
| `settings.aiModels` / `aiActiveModelId` | 供应商模型列表与当前选中（旧单一配置由同级迁移为数组） |
| `settings.aiPersonas` / `aiActivePersonaId` | 多套人设与当前选中（旧单一 `aiPersona` 字符串由 `lib/store.ts` 的 `migratePersona` 升级） |
| `settings.aiEnabledSkills` | 技能启停（null = 全部启用） |
| `settings.aiUserAvatar` / `aiAssistantAvatar` | 头像 data URL（设置里压缩至最长边 256px，避免撑爆 localStorage） |
| `settings.aiForceSync` | true = 所有会话串行（单队列），false = 允许并发 |
| `conversations` / `activeConversationId` | 会话列表与当前选中（持久化） |
| `pendingAiQuery` | **不持久化**：`onRehydrateStorage` 强制置空，刷新不重发 |

- **数据链路**：UI 动作 → `createConversation` / `selectConversation` 等 store action → 防抖 `setItem`；流式请求经 `lib/ai/request-queue.ts` 全局队列，跨会话 / 切视图不中断。
- **See also**：[`docs/data-storage.md`](./data-storage.md) §1（会话持久化）。
- **Notice**：`migratePersona` 在 `merge` 内把旧 `aiPersona` 升级为多人人设，新增人设字段须向后兼容。

---

## 8.15 个人主页 Profile Dashboard（`components/profile-workspace.tsx`）

| 功能 | 入口点 |
| --- | --- |
| 视图外壳 | `ProfileWorkspace`（`app/page.tsx` 按 `view === "profile"` 渲染）；占满主区，内部 `overflow-auto` |
| 导航与分发 | 侧边栏头像按钮（`goProfile`）→ `view: "profile"` → `ProfileWorkspace`；`VIEW_LABEL` 补 `"profile": "个人主页"` |
| 头像来源 | 复用 `settings.aiUserAvatar`（与 AI 对话头像同源；空回落默认 `User` 图标），256×256 圆角容器 |
| 天气 / 地区 / 诗歌 / 签到 | 天气卡**已接真实数据**（TODO 34）：`components/weather-widget.tsx` + `lib/weather.ts` 直连 UAPI `https://uapis.cn/api/v1/misc/weather`（客户端 IP 自动定位，无城市选择；可选 Bearer 令牌存 `settings.uapiToken`，设置 → 高级）；结果缓存 2 小时（localStorage `mw:weather-cache`），仅手动刷新绕过缓存；429 后前端冷却 10 分钟（`mw:weather-cooldown`），期间禁用刷新并提示。地区（1 行）、每日诗歌（右下角小字）为**占位**；签到按钮**已实现**：点击 toast 成功提示 + 写 `check-in` 贡献（amount 2）+ 当天禁用 / 暗色图层，`04:00`（同一 `dayStartOffset`）重置；状态由账本按 dayKey 推导 |
| 日期 / 星期 | 实时 `new Date()` 计算（非占位） |
| 贡献热力图（真实数据） | `ProfileWorkspace`：`lib/contributions.ts` 的 `buildHeatmapGrid` / `buildMonthLabels` / `aggregateByDay` / `contributionLevel` + store `contributions`；53 周 × 7 天、周日起始；颜色按「当日 amount 之和」走 0/(0,1]/(1,3]/(3,6]/>6，右上角总数按**条数**（`contributions.length`），tooltip 显示「yyyy-MM-dd · N 条 · X 贡献值」（X **四舍五入取整**，`< 0.5` 显示 `0`）/「yyyy-MM-dd · 无记录」 |
| 存量贡献补算（临时） | 热力图卡片头部「补算历史」按钮（`ScanLine` 图标）→ store `scanLegacyContributions()`（幂等，toast 报新增条数）；**临时功能，主人用完会要求连同按钮整块删除** |

> 约定：天气已接 UAPI 真实数据（TODO 34，原中国天气网本地代理 scripts/weather-proxy*.mjs 已删除）；诗歌仍为占位；贡献热力图已接真实账本（store `contributions`）；签到已落地（store `checkIn()`，复用同一 `dayStartOffset`，04:00 重置）。

## 8.16 贡献账本 / 热力图（`lib/contributions.ts` + `lib/store.ts` + `components/profile-workspace.tsx`）

> 真账本（非派生）：每次「新建 / 完成」思维图节点都往账本写一行；存「发生时间 `at`」，**读取时**按当前 `dayStartOffset` 现算所属日（改翻篇时间历史会重新分桶）。

| 功能 | 入口点 |
| --- | --- |
| 数据结构 | `lib/types.ts`：`ContributionType`（`mindmap-node-created` / `mindmap-node-done` / `check-in`；签到已实现）、`Contribution`（`id`/`at`/`amount`/`type`/`content`）、`CONTRIBUTION_AMOUNT`（新建 0.2 / 完成 1 / 签到 2，权重唯一来源） |
| 复合 id 约定 | `Contribution.id = `${nodeId}:created`` / `${nodeId}:done``（唯一且可反查节点，便于删除清理）；签到：`check-in:${dayKey}`（按日唯一，状态由账本推导、04:00 重置） |
| 记账（签到） | store `checkIn()`：复用 `settings.dayStartOffset` 同一 offset 现算 `todayKey`，幂等写一条 `check-in:<dayKey>`（amount 2，type `check-in`）；「今天是否已签」= 账本存在该 id，过 04:00 后 dayKey 变化即自动「未签到」 |
| 纯逻辑 | `lib/contributions.ts`：`DEFAULT_DAY_START_OFFSET`（"04:00"）、`parseDayStartOffset` / `normalizeDayStartOffset`、`dayKey` / `todayKey`（本地时间减 offset 后取 yyyy-MM-dd）、`contributionLevel`（0/(0,1]/(1,3]/(3,6]/>6）、`aggregateByDay`、`buildHeatmapGrid`（周日起始 53 列）、`buildMonthLabels` |
| 记账（写账本） | store `addNode`（+created 0.2）、`updateNode`（`done` **真正跃迁**时 upsert/删 done 条 1）、`removeNode`（删该节点全部条；非递归删子节点）、`removeCategory`（删整个关系型分类 → 连带清掉该分类下全部节点的记录） |
| 存量补算 | store `scanLegacyContributions()`：遍历所有 `relation.nodes`，按现有账本 id 的 Set 幂等补 created（`createdAt` 为 number）/ done（`completedAt != null`，含迁移写入的 `LEGACY_NODE_TIME`），返回新增条数 |
| 设置 | `Settings.dayStartOffset`（HH:mm，默认 "04:00"）；`store.merge` / `importData` 对缺失 / 非法值兜底为 "04:00" |
| 持久化兼容 | `store.merge`：`contributions` 缺失 / 非数组 → `[]`（旧存档）；且已纳入 `exportData` / `importData` / `mergeData` —— 导入旧备份（不含该字段）时**保留**现有账本，不清空；合并模式按 `id` 合并 |
| 备份格式 | ZIP 备份经 `store.exportData(sections)` 按 `contributions` 分区携带账本；`lib/backup.ts` 的 `manifest.version` 升至 **5**（v5 = 分区导出，见 §8.8 备份分区表；v4 = `workspace.json` 增加 `contributions`） |

## 8.17 GitHub 队列（Issue/PR 看板，`components/github-queue-workspace.tsx` + `lib/github-queue.ts`）

> TODO 36 + 后续迭代：类 GitHub Project 的 issue/PR 看板。四列 Urgent / Assigned / Completed / Backlog；卡片由用户从仓库拉取、「从监听同步」导入，或监听收到 assign 给自己的 issue/PR 时**自动入 Backlog**。AI 可经内置技能 `wb_get_github_queue` 只读读取队列。

| 功能 | 入口点 |
| --- | --- |
| 导航 | 底部工具栏 `toolbar-panel.tsx` 的 `TOOL_CARDS` 新增 `{ id: "github-queue", ... }`；`activate` 的 `case "github-queue"` → `goGithubQueue()` |
| 视图分发 | `app/page.tsx`：`view === "github-queue"` → `<GithubQueueWorkspace />` |
| 视图切换 | store `goGithubQueue()`（`set({ view: "github-queue", activeCategoryId: null })`） |
| 状态 | store `issueQueue: IssueQueueItem[]`（持久化，键 `my-omni-workspace`；`merge` 缺字段 → `[]`）；见 `docs/data-storage.md` §1 |
| 拉取逻辑 | `lib/github-queue.ts`：`fetchRepoIssues(repo, { onlyMine?, token, perPage?, currentLogin? })`（issues API 同时返回 PR，`pull_request` 字段区分；`perPage` 默认 100，达上限置 `truncated`）、`fetchCurrentLogin(token)`（取当前用户名用于判定 assignee） |
| 去重 / 归类 | `toQueueItem`：`id = iq:{repo}:{kind}:{number}`；默认列 = closed/merged → completed、assignee 是当前用户 → assigned、否则 backlog；Urgent 由用户手动标 |
| 实时搜索 | 顶栏搜索框（`query` state）：按 标题 / 正文 / 仓库 / 提交者 / #编号 大小写不敏感过滤，四列只显示匹配卡片；仅过滤显示，不改数据 |
| 滚动条 | 看板容器与每列卡片列表均为 `overflow-auto` + `.native-scroll`（`docs/ui-conventions.md` §1 细圆角胶囊规范） |
| 添加对话框 | `GithubQueueWorkspace`：输入 `owner/repo`（支持完整 URL 解析）；模式「全部 / 仅分配给我的」（`assignee=@me`，需已填 `settings.githubToken`）；超 100 条弹提示 |
| 卡片操作 | `QueueCard`：移动到其它列（`moveIssueQueueItem`）、删除（`removeIssueQueueItem`）；无整队清空入口（`clearIssueQueue` 已移除，逐卡删除为准）；卡片展示标题（外链）、提交者、正文首行截取、kind 标签、@me / 已合并 / 已关闭 |
| 监听联动（手动） | 「从监听同步」按钮：遍历 `settings.notificationRepos`，对每个仓库 `fetchRepoIssues({ onlyMine: true })` 拉 assign 给自己的 issue/PR 加入 Assigned 列 |
| 监听联动（自动） | `lib/notifications/scheduler.ts` 的 `scanNow()`：本轮 `fresh` 通知里的 issue/PR 若 `assignees` 含当前登录用户 → `notificationToBacklogItem` 转 `IssueQueueItem`（Backlog 列）→ `addToIssueQueue`（按 id 去重、保留手动移动过的列，幂等）；仅在确有候选时才多调一次 `GET /user` 取登录名 |
| AI 只读访问 | 内置技能 `wb_get_github_queue`（`lib/ai/builtin-skills.ts`）：读 `issueQueue`，支持 `column` / `kind` 过滤，返回结构化 JSON |

- **数据链路**：用户输入 → `GithubQueueWorkspace` → `fetchRepoIssues`（→ GitHub REST `repos/{o}/{r}/issues`）→ `addToIssueQueue`（按 id 去重，保留已存在的列）→ `issueQueue` 落盘 → 看板按 `column` 分组渲染。
- **See also**：[`docs/data-storage.md`](./data-storage.md) §1（`issueQueue` 持久化字段）；[`lib/notifications/github-sender.ts`](../lib/notifications/github-sender.ts)（既有 GitHub 扫描链路，`ghHeaders`/`fetchJson` 思路被 `github-queue.ts` 复用）。
- **Notice**：
  - `lib/github-queue.ts` 是**独立模块**，不复用 `github-sender.ts` 的内部函数（其 `ghHeaders`/`fetchJson` 为 module-private），以避免改动既有通知扫描；认证 / 限流思路一致。
  - 「仅分配给我的」与「从监听同步」都依赖 `settings.githubToken` 取当前登录用户（`GET /user`）；匿名时前者不可用，后者直接提示填 Token。
  - 拉取受 GitHub 限流（403/429 + `x-ratelimit-remaining: 0`）约束，触发时 `fetchRepoIssues` 抛 `RATE_LIMITED`，UI 提示稍后重试。

