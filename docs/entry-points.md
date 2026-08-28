# 功能入口点地图（方法/类名 描述，思维导图已细到小功能）

> 按「模块 → 入口点」列出。改某个功能时，先到这里定位入口再动代码。
> 本文件由 `AGENTS.md` 第 8 节拆分而来，是其技术型细节的唯一来源；`AGENTS.md` 只保留引用。

## 8.1 全局 / 布局

| 功能 | 入口点 |
| --- | --- |
| 主布局与工作区分发 | `app/page.tsx` 的 `Page`：渲染 `AppSidebar`、`Topbar`、`NovelWorkspace`/`MindmapWorkspace`/`CalendarWorkspace`/`ContactsWorkspace`/`VaultWorkspace`、`StatusBar`、`GlobalSearch`、`SettingsDialog`、`ConfigEditorDialog`、`ImageCacheDialog`；调用 `useGlobalShortcuts()`（`useCalendarScripts` 已弃用停用）；`VaultProvider` 在 `app/layout.tsx` 包裹 `children`（保险库会话状态/密钥驻留内存） |
| 根布局 / 主题 / 字号 / Toaster | `app/layout.tsx` 的 `RootLayout`；`components/theme-provider.tsx` 的 `ThemeProvider` / `ThemeFromStore` / `FontSizeSetter` |
| 全局快捷键 | `hooks/use-shortcuts.ts`：`useGlobalShortcuts()`、`matchShortcut(e, binding)`；绑定在 `settings.shortcuts`（`SHORTCUT_META`） |
| 底部状态栏 | `components/status-bar.tsx` 的 `StatusBar`（订阅 store 算统计）；右下角视图名取自 `lib/types.ts` 的 `VIEW_LABEL`（新增视图须在此补一项，否则状态栏会显示成「工作台」） |

## 8.2 侧边栏（`components/app-sidebar.tsx`）

| 功能 | 入口点 |
| --- | --- |
| 侧边栏容器 | `AppSidebar` |
| 内置模板快捷区 | `TemplateQuickAdd`（调用 store `addCategory`） |
| 分类项（增删改、折叠、操作菜单） | `CategoryItem` |
| 日历导航入口 | `CalendarNavItem`（调用 `goCalendar`） |
| 联系人导航入口 | `ContactNavItem`（调用 `goContacts`） |
| 密码保险库导航入口 | `VaultNavItem`（调用 `goVault`） |
| 新建分类弹窗 | `components/add-category-dialog.tsx` 的 `AddCategoryDialog` |
| 分类/章节拖拽排序 | 分类 `moveCategory(from,to)`、章节 `moveChapter(catId,from,to)`（储存在 `lib/store.ts`）；注意小分类（章节）`draggable` 嵌套在大分类容器内，章节 `onDragStart` 须 `stopPropagation()` 防止 `dataTransfer` 的 id 被外层覆盖成分类 id |

## 8.3 小说 / 通用分类（`components/novel-workspace.tsx`）

| 功能 | 入口点 |
| --- | --- |
| 工作区分发（概览 / 编辑） | `NovelWorkspace`（按 `activeItemId` 切 `ChapterOverview` / `ChapterEditor`） |
| 概览网格 + 滚动位置记忆 | `ChapterOverview`（用 `scrollRef` 经 viewport 恢复/保存 `scrollTop`） |
| 章节编辑器 | `ChapterEditor`（标题、正文 `ImageRichInput`、标签 `TagPicker`、完成 `Checkbox`、上/下篇 `updateChapter`/`removeChapter`） |
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
| 内容（防抖 + 粘贴图片） | `DebouncedTextarea`（含 `addImage` + `{{img:<id>}}` 插入；粘贴可一次插入多张，`imageBlobsFromClipboard` 返回 `Blob[]`） |
| 标签（共用） | `TagPicker`（`patch({ tags })`） |
| 完成 | `patch({ done })`（`Checkbox`「已完成」） |
| 在图里隐藏 | `patch({ hidden })`（`Checkbox`「在图里隐藏」；隐藏后仅列表显示） |
| 截止日期 / 长期任务 | `patch({ dueDate | longTerm })`（`Input type=date` + 「设为长期」按钮） |
| 解决方案 + 状态 | `setNodeSolution(catId, nodeId, content, status)`；状态 `doing|paused|done`（`STATUS_META`） |

**节点卡片（`components/mindmap/nodes.tsx`）**
| 功能 | 入口点 |
| --- | --- |
| Todo 节点卡片 | `TodoNode`（标题 + `done` 删除线/✓、原因/导向/结果、**内容常显** via `RichText`、子任务折叠钮、标签/截止/长期徽标） |
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
| 当日详情 | `DayDetail`（笔记 `ImageRichInput` → `setDayNote`；待办 `addCalendarTodo/toggleCalendarTodo/removeCalendarTodo`；事件 `addCalendarEvent/removeCalendarEvent`；生日列表 + 农历日期） |
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
| 引用扫描 | `lib/image-refs.ts`：`imageIdsInText`、`collectReferencedImageIds` |
| 含图备份 | `lib/backup.ts`：`exportBackup`、`importBackup`、`getImageInventory` |
| 图片渲染组件 | `components/rich-text.tsx`：`StoredImg`（`{{img:id}}` → IndexedDB blob URL）、`MarkdownImg`（`![](url)` 远程图）。两者被 `MarkdownView` 复用 |
| Markdown 预览渲染 | `components/markdown-view.tsx`：`MarkdownView`。**只用 `marked` 的 `lexer` 做解析，不接外部呈现库**，token 树全部由本组件手工渲染成 React 元素；`{{img:}}` 在 text token 内由 `splitImg` 拆分后走 `StoredImg`。支持标题/段落/粗斜体/删除线/行内码/代码块/引用/有序无序列表/任务列表/分割线/链接/图片；`html` token 一律不渲染，`safeHref` 只放行 http(s)/mailto/tel/锚点/相对路径/`data:image/`。另有 `clamp` 模式（`renderClamped`）：忽略块级结构、把标题/列表/引用/代码块的文本压平成一段连贯文字，供列表卡片两行截断预览用 |
| 富文本输入 | `components/image-rich-input.tsx`：`ImageRichInput`（粘贴/插图/预览切换）；预览容器须 `min-h-0 flex-1 overflow-auto` 才能在 flex 列中滚动多图，否则被祖先 `overflow-hidden` 裁切 |

## 8.10 密码保险库（Vault）

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

## 8.11 联系人（`components/contacts-workspace.tsx`）

> 只读通讯录：数据来自 `public/address_book.yml`，用户自行编辑该文件，界面不可增删改。

| 功能 | 入口点 |
| --- | --- |
| 工作区分发 | `app/page.tsx` 按 `view === "contacts"` → `ContactsWorkspace` |
| 视图 state / 切换 | store `view`（`"workspace" | "calendar" | "contacts" | "vault"`）+ `goContacts`；侧边栏 `ContactNavItem` |
| 列表 + 搜索 | `ContactsWorkspace`：`loadAddressBook()`（`lib/address-book.ts`）+ `query` 过滤（范围含 name/description/birthday/address/roles/contact，见 `filtered`） |
| dropdown 展开 contact | `ContactsWorkspace` 内 `expanded` Set + `toggle(name)`；每个 contact 项含复制按钮（`navigator.clipboard.writeText` + toast） |
| 数据模型 | `lib/address-book.ts`：`Person` / `ContactItem` / `AddressBookFile` / `loadAddressBook` / `parseBirthday` |

## 8.12 ~~日历标记脚本~~ —— 已弃用停用

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
