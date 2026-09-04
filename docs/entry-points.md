# 功能入口点地图（方法/类名 描述，思维导图已细到小功能）

> 按「模块 → 入口点」列出。改某个功能时，先到这里定位入口再动代码。
> 本文件由 `AGENTS.md` 第 8 节拆分而来，是其技术型细节的唯一来源；`AGENTS.md` 只保留引用。

## 8.1 全局 / 布局

| 功能 | 入口点 |
| --- | --- |
| 主布局与工作区分发 | `app/page.tsx` 的 `Page`：渲染 `AppSidebar`、`Topbar`、`NovelWorkspace`/`MindmapWorkspace`/`CalendarWorkspace`/`ContactsWorkspace`/`VaultWorkspace`/`AIChatWorkspace`、`StatusBar`、`GlobalSearch`、`SettingsDialog`、`ConfigEditorDialog`、`ImageCacheDialog`；调用 `useGlobalShortcuts()`（`useCalendarScripts` 已弃用停用）；`VaultProvider` 在 `app/layout.tsx` 包裹 `children`（保险库会话状态/密钥驻留内存） |
| 根布局 / 主题 / 字号 / Toaster | `app/layout.tsx` 的 `RootLayout`；`components/theme-provider.tsx` 的 `ThemeProvider` / `ThemeFromStore` / `FontSizeSetter` |
| 全局快捷键 | `hooks/use-shortcuts.ts`：`useGlobalShortcuts()`、`matchShortcut(e, binding)`；绑定在 `settings.shortcuts`（`SHORTCUT_META`） |
| 底部状态栏 | `components/status-bar.tsx` 的 `StatusBar`（订阅 store 算统计）；右下角视图名取自 `lib/types.ts` 的 `VIEW_LABEL`（新增视图须在此补一项，否则状态栏会显示成「工作台」） |
| 桌面端侧边栏宽度（可拖拽） | `app/page.tsx` 的 `Page`：desktop sidebar 容器 `style={{ width: sidebarWidthLocal }}`，右侧 `role="separator"` 分隔条 `onMouseDown={startResizeSidebar}`（min 200 / max 420 px）；实时宽度本地 `sidebarWidthLocal` state，松手写入 store `sidebarWidth` / `setSidebarWidth`（`lib/store.ts`，刷新后保留；旧存档缺字段自动回落默认 288） |

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
| 长文本/超长串防溢出 | `RichText` 容器用 `overflow-wrap:anywhere` + `break-words`；图片 `fullSize` 加 `max-w-full`；原因/导向/结果行加 `min-w-0` + 任意断词，避免无空格长串（如 URL）撑破 `max-w-[50vw]` 卡片 |
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
| ~~渲染标记脚本触发~~ | ~~`emitRenderDate`（`lib/calendar-events.ts`）+ `makeMarkerApi`；单元格 `data-date`~~（已弃用停用） |

## 8.7 全局搜索

| 功能 | 入口点 |
| --- | --- |
| 搜索逻辑 | `lib/search.ts` 的 `runSearch(categories, calendar, query, scope, activeCategoryId)` |
| 搜索 UI + 跳转 | `components/global-search.tsx` 的 `GlobalSearch`（`TYPE_ICON`、`Highlight`、`jump`） |

## 8.8 设置（`components/settings-dialog.tsx`）

| 功能 | 入口点 |
| --- | --- |
| 默认视图 / 主题 | `SettingsDialog` 的 `Select`（`updateSettings({ defaultView | theme })`） |
| 字体大小滑块 | `SettingsDialog` 的 range → `updateSettings({ fontSize })` |
| 快捷键编辑 | `ShortcutRow`（录音捕获 → `setShortcut`） |
| ~~日历标记脚本~~ | ~~入口 `setScriptsOpen` → `CalendarScriptsDialog`~~（已弃用停用） |
| 配置源文本编辑 | 入口 `setConfigEditorOpen` → `ConfigEditorDialog`（`exportData`/`importData`） |
| 图片缓存/暂存 | 入口 `setImagesOpen` → `ImageCacheDialog`（`getImageInventory`） |
| 备份（含图 + 保险库） | `exportBackupZip()` / `importBackupZip()`（`lib/backup.ts`）；ZIP 内含 `vault.json`（AES-256 加密 blob，替换模式下恢复） |
| 备份 ZIP 实现 | `lib/backup.ts` 使用 `fflate`（`zipSync`/`unzipSync`），**禁止手写 ZIP 读写**；`exportBackupZip` 产出含 `workspace.json` / `images/*` / `vault.json` 的 Blob，导入按「替换 / 合并」两种模式 |
| 开源许可证页面 | 底部入口按钮（`Scale` 图标）→ `LicenseDialog`（`components/license-dialog.tsx`）；数据在 `lib/licenses.ts` 的 `THIRD_PARTY_LICENSES`（名称/作者/描述/许可证链接），按 `--------<名称> / 作者: / 描述: / 许可证:` 格式渲染 |

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
| 共享扩展集 | `components/richtext/extensions.ts`：`richTextExtensions` = `StarterKit` + `StoredImage`（重写 image 节点，渲染 `imgref:`，NodeView 走 IndexedDB）+ `TaskList` + `TaskItem` + `GitHubCard`（atom 节点）+ `BilibiliCard`（atom 节点）+ `Markdown`（`html:false`/`breaks:true`/`transformPastedText`） |
| 编辑器（受控） | `components/richtext/rich-text-editor.tsx`：`RichTextEditor`（`value`=Markdown 串、`onChange`→`getEditorMarkdown(editor)`）；**默认源码模式**（可编辑处一律显示原始 Markdown），右上角「源码/可视化」切换；`immediatelyRender:false`，`onCreate`/`useEffect` 运行 `upgradeLinkCards`；`handlePaste` 拦截 GitHub/B 站链接（插入卡片）与图片 blob（落库插入 `imgref:` 节点）；**外部 `value` 同步在源码模式下跳过**（否则升级卡会经 `onChange` 回写，把刚输入的回车/空格等被 markdown 规范掉的空白抹掉） |
| 只读预览 | `components/richtext/rich-text-view.tsx`：`RichTextView`（`editable:false`，同一扩展集），用于节点卡片/概览 |
| 选区气泡工具条 | `components/richtext/selection-toolbar.tsx`：`SelectionToolbar`（`BubbleMenu`，复制纯文本 / X 复制富文本 HTML / 全选 / 引用；`shouldShow` 对 image/githubCard/bilibiliCard 选区隐藏） |
| 存储图片节点 | `components/richtext/stored-image.tsx`：`StoredImage` = `Image.extend({name:"image"})` + `ReactNodeViewRenderer`，`isImgref(src)` 时渲染 `StoredImg`，否则 `MarkdownImg` |
| GitHub 预览卡（数据层） | `lib/gh-card.ts`：`parseGithubUrl` / `isGithubIssueUrl` / `getOgImageSrc(ogUrl)`（OG 直链 + IndexedDB blob 缓存，零 API、无 CORS）/ `fetchGithubCard(url, token)`（REST `api.github.com` + `Authorization: Bearer <token>`，IndexedDB 缓存 `CACHE_MS=6h`，降级友好）；独立库 `workspace-gh`（stores `cards`/`imgs`） |
| GitHub 预览卡（节点） | `components/richtext/github-card.tsx`：`GitHubCard`（atom 节点，attrs `url`）；**opengraph 风格**：顶部 OG 图 banner + 标题 + 状态徽标 + 标签 + **底部保留可点击的原始链接文字**；`addStorage().markdown.serialize` 输出裸 URL（重加载经 `upgradeLinkCards` 再次成卡） |
| B 站预览卡 | `lib/bilibili.ts`：`parseBilibiliUrl`（提取 BV 号；`b23.tv/xxx` 短链无法解析 BV 则降级）/ `isBilibiliUrl` / `bilibiliEmbedSrc`（官方嵌入播放器 `player.bilibili.com`，`autoplay=0&danmaku=0`）；`components/richtext/bilibili-card.tsx`：`BilibiliCard`（atom 节点，attrs `url`），渲染 iframe 预览 + 原始链接文字。注：B 站无浏览器可直接取的 OG 缩略图（跨域），故用嵌入播放器作视觉预览而非静态图 |
| 链接升级 | `components/richtext/upgrade.ts`：`upgradeLinkCards(editor)` 扫描文档裸 `github.com/.../(issues|pull)/\d+` 与 `bilibili.com/video/BV…`、`b23.tv/…` 文本，替换为 `githubCard` / `bilibiliCard` 节点（带 guard 上限，防死循环；本环境 prosemirror `Node` 推断异常，回调形参桥接为 `any`；替换内容须用 `JSONContent[]` 而非 Node 实例） |
| 图片协议重构 | 旧 `{{img:<id>}}` → 标准 Markdown `![alt](imgref:<id>)`（`imgref` scheme 指向 IndexedDB）；读取时 `normalizeLegacyImg` 兼容，无需批量迁移 |
| 设置项 | `components/settings-dialog.tsx` 新增「GitHub 集成」区：`settings.githubToken`（明文存 localStorage，仅本地预览用途，已注明风险）；`lib/types.ts` 的 `Settings.githubToken` / `DEFAULT_SETTINGS.githubToken` |

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
| 视图 state / 切换 | store `view`（`"workspace" | "calendar" | "contacts" | "vault" | "ai-chat"`）+ `goContacts`；侧边栏 `ContactNavItem` |
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
| 会话 store actions | `lib/store.ts`：`createConversation` / `selectConversation` / `deleteConversation` / `renameConversation` / `setConversationMessages`；`pendingAiQuery` **不持久化**（刷新不重发，见 `onRehydrateStorage`） |
| React 钩子 | `lib/ai/use-ai-chat.ts`：`useAIChat({ config, conversationId })` → `{ messages, isLoading, send, stop, regenerateLast }`；经 `useSyncExternalStore` 订阅队列 |
| 请求队列 | `lib/ai/request-queue.ts`：`enqueue` / `regenerate` / `stopConversation` / `subscribeQueue` / `getMessagesSnapshot` / `isWorking`；模块级 `liveMessages` / `streaming` / `queued` 为临时态，不落盘 |
| 强制同步 | `settings.aiForceSync` 为 true 时所有会话串行（单队列），false 时允许并发（同一会话仍不会重复发起） |
| 消息渲染 | 用户/助手消息统一走 `RichTextView`（与节点内容同管线：表格/代码高亮/链接卡/内文图一致生效）；空状态预置问题 `PRESET_QUESTIONS`；复制原文 `copyText` |
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
| 内置可执行技能 | `lib/ai/builtin-skills.ts`：`BUILTIN_SKILLS`（`BUILTIN_SKILL_DISPLAY` 为展示用），tool 名 `wb_` 前缀，**纯只读查询**；当前含 `wb_get_day_note` / `wb_get_dates_with_notes` / `wb_get_day_calendar_data` / `wb_get_contact_names` / `wb_get_contact` / `wb_get_categories` / `wb_get_chapters` / `wb_get_chapter_content` / `wb_get_mindmap_graph` / `wb_get_mindmap_node`；新增须保持只读且返回可 JSON 序列化的结果 |
| 技能启停 | `settings.aiEnabledSkills`（`null` = 全部启用）；UI `SkillsToggleDialog`；队列内 `isSkillEnabled` 同时过滤说明型与内置技能 |
| 工具调用与展示 | 队列用 AI SDK 的 `streamText` + `tool()` + `stepCountIs`；调用过的技能记入 `AIChatMessage.tools`（UI 以 `Wrench` 徽标展示），token 记入 `AIChatMessage.tokens` |
| 跨视图提问 | store `askAiAbout(text)`：新建会话 → 切 `ai-chat` → 挂起 `pendingAiQuery`，由 `AIChatWorkspace` 在会话就绪后消费并 `clearPendingAiQuery`；日历 `DayDetail` 的「问 AI」（`askFestival` / `askNote`）走此路径 |
| 容错 | 队列自定义 `fetch` 在 abort 时把 reject 转为空响应以避免 unhandled rejection；用户点「停止」视为预期行为，静默收尾不报错 |

> 相关类型集中在 `lib/types.ts`：`AIProviderId`、`AIPersona`、`AIChatMessage`、`Conversation`，以及 `Settings` 的 `aiModels` / `aiActiveModelId` / `aiEnabledSkills` / `aiUserAvatar` / `aiAssistantAvatar` / `aiForceSync` / `aiPersonas` / `aiActivePersonaId`。

---

## 8.14 ~~日历标记脚本~~ —— 已弃用停用

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
