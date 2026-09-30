# 数据持久化总览（Data Storage）

> 本文件是「数据落在哪、怎么读写、谁负责」的唯一来源，配合 [`docs/entry-points.md`](./entry-points.md)（功能入口）与 [`AGENTS.md`](../AGENTS.md)（契约）使用。
> 按**存储后端**划分功能；每个后端列出「持久化字段 / 一句话说明」，并标注数据链路、See also、Notice。
> 索引只用**文件名 / 字段名 / 方法名 / 库名**，不使用行号。

---

## 1. Zustand persist → localStorage

- 键：`my-omni-workspace`
- 写：防抖持久化（`lib/store.ts` 的 `createDebouncedStorage`，静止 800ms 落盘；`pagehide` / 切后台立即 flush）
- 读 / 合并：`merge` 对旧存档做字段兜底；`onRehydrateStorage` 强制把 `pendingAiQuery` 置空（刷新不重发）

| 持久化字段 | 说明 |
| --- | --- |
| `categories` | 全部分类与章节；关系类分类内含思维图节点与连线（核心数据） |
| `calendar` | 按 `yyyy-MM-dd` 聚合的笔记 / 待办 / 事件 |
| `activeCategoryId` | 当前选中的分类 id；`null` 表示选中日历（导航态） |
| `activeItemId` | 当前选中的条目 id（章节 id 或思维图节点 id） |
| `view` | 当前视图（`workspace` / `calendar` / `contacts` / `vault` / `ai-chat` / `profile` / `settings` / `notifications`） |
| `selectedDate` | 日历选中的日期（`yyyy-MM-dd`），默认今天 |
| `hydrated` | 水合完成标志；会被序列化进存档，但 `onRehydrateStorage` 强制重置为 `true`，不依赖持久化值 |
| `settings` | 系统设置对象；子字段见下方 §1.1 |
| `addCategoryOpen` | 新建分类弹窗开关（跨组件触发，如 Ctrl+M） |
| `configEditorOpen` | 配置源文本编辑弹窗开关 |
| `imagesOpen` | 图片缓存 / 暂存弹窗开关 |
| `calendarDetailWidth` | 日历 / DayDetail 分隔条宽度（px），拖动后保留 |
| `sidebarWidth` | 桌面端侧边栏宽度（px），拖动后保留 |
| `sidebarCollapsed` | 侧边栏是否收起 |
| `sidebarToggleY` | 侧边栏收起后悬浮开关的纵向位置（px）；`null` = 默认垂直居中 |
| `toolbarCollapsed` | 底部工具栏是否收起 |
| `knownTags` | 全局标签库（从联系人 roles 等导入，供 TagPicker 复用） |
| `conversations` | AI 多会话（各持完整上下文，持久化到 localStorage） |
| `activeConversationId` | 当前选中的会话 id；`null` = 无选中 |
| `pendingAiQuery` | 外部触发的待发送 AI query；`onRehydrateStorage` 强制置空，刷新不重发、不持久化生效 |
| `contributions` | 贡献账本（真账本，非派生；Profile 热力图数据源） |
| `notifications` | 通知中心列表（GitHub sender 等产生；按 `createdAt` 降序，上限 200 条截断） |
| `notificationLogs` | 通知系统日志（每轮扫描明细；按 `at` 降序，上限 500 条截断） |
| `notificationWatermark` | 扫描水位（epoch ms），上一轮成功扫描时间；`null` = 从未扫过 |
| `lastActiveAt` | 最近活跃时间（epoch ms），调度器心跳 / `pagehide` 维护，作为首次扫描兜底起算点 |
| `lastReadNotificationsAt` | 已读水位（epoch ms），`createdAt` 晚于此的通知计为未读 |
| `lastWaterRemindAt` | 喝水提醒上次触发时间（epoch ms），按墙钟对表 |
| `lastStandRemindAt` | 站立提醒上次触发时间（epoch ms） |
| `newsLastFetchedAt` | 新闻精选上次触发时刻（epoch ms），与 18:00 周期比对；`null` = 从未拉过 |
| `mindmapViewports` | 关系类思维图视口存档（key = `category.id`，含 scale / x / y） |

### 1.1 `settings` 子字段

`settings` 本身是一个对象，以下每一项都是持久化字段（随 `settings` 一起落盘）：

| 子字段 | 说明 |
| --- | --- |
| `theme` | 主题偏好（浅色 / 深色 / 跟随系统） |
| `defaultView` | 启动默认视图（`ai-chat` / `calendar` / `last` 等） |
| `shortcuts` | 快捷键绑定表（action → 按键绑定），由 `setShortcut` 修改 |
| `fontSize` | 全局基础字号（rem），由字号滑块修改 |
| `uiFontFamily` | 界面字体家族（system / serif / mono 等） |
| `githubToken` | GitHub 个人访问令牌（PAT），明文存 `localStorage`；提升预览卡 API 限额 |
| `uapiToken` | UAPI 天气接口 Bearer 令牌；留空则匿名调用 |
| `aiModels` | AI 模型配置数组，支持多模型切换 |
| `aiActiveModelId` | 当前选中的模型 id；`null` = 尚未配置 |
| `aiEnabledSkills` | 启用的技能名列表；`null` = 全部启用 |
| `aiUserAvatar` | 用户头像（data URL，压缩后）；留空用默认用户图标 |
| `aiAssistantAvatar` | AI 头像（data URL，压缩后）；留空用默认机器人图标 |
| `baiduAiSearchApiKey` | 联网搜索 API Key（百度千帆），仅存本机；留空则该技能不可用 |
| `location` | 用户所在地区标签（Profile 头像下方展示） |
| `userName` | 用户昵称；「删除全部数据」二次确认以此比对 |
| `birthday` | 用户生日（`yyyy-MM-dd`，日历「人生进度条」使用） |
| `aiForceSync` | AI 对话强制串行队列开关 |
| `aiPersonas` | AI 人设列表，可创建多条 |
| `aiActivePersonaId` | 当前人设 id；`null` = 仅用基础提示词 |
| `dayStartOffset` | 每天翻篇时间（`HH:mm`，默认 `"04:00"`），影响贡献按日分桶 |
| `notificationRepos` | 通知扫描仓库列表（含各自扫描类型 / 起点；旧存档 `string[]` 由 `normalizeNotificationRepos` 兼容） |
| `notificationChannels` | 通知投递渠道（`builtin` 右下角弹窗 / `qq` 本机中转） |
| `newsEnabled` | 新闻精选 sender 开关（默认开启） |
| `qqRelayUrl` | QQ 中转服务地址（POST `{"text":"..."}`）；留空回落 `DEFAULT_QQ_RELAY_URL` |
| `pwdGenerator` | 保险库密码生成器偏好（`length` / `upper` / `lower` / `digits` / `symbols`） |

- **数据链路**：组件 → `useWorkspace` action → `set` → 防抖 `setItem` → localStorage；启动时 `getItem` → `merge` 兜底 → hydrate。
- **See also**：[`docs/entry-points.md`](./entry-points.md) §8.5（store actions）、§8.13（会话）、§8.16（贡献账本）。
- **Notice**：
  - persist **未配置 `partialize`**，故 `WorkspaceState` 顶层所有非函数字段都会被 `JSON.stringify` 落盘（上表 30 项），动作函数自然被跳过。
  - `merge` 对旧存档缺字段均有回落默认值（如 `contributions→[]`、`mindmapViewports→{}`、`dayStartOffset→"04:00"`、`notificationRepos` 旧 `string[]` 兼容）；新增已发布字段须在 `merge` 兼容，否则旧 localStorage 读崩（红线第 1 条）。
  - `hydrated` 与 `pendingAiQuery` 虽被序列化，但 `onRehydrateStorage` 会**强制覆盖**（`hydrated=true`、`pendingAiQuery=null`），不依赖其持久化值；前者是运行时水合标志、后者刷新后不应重发。

---

## 2. IndexedDB — 图片库 `workspace-images`

- store：`images`，keyPath `id`
- 写：`lib/image-store.ts`（`addImage` 内容寻址去重、`deleteImage`、`setStaged`、`exportImages` / `importImages`；`clearAllImages` 清空整库）

| 持久化字段 | 说明 |
| --- | --- |
| `id` | blob 的 SHA-256 摘要（内容寻址，相同字节复用同一 id） |
| `blob` | 图片二进制 |
| `kind` | MIME 类型 |
| `createdAt` | 入库时间（epoch ms） |
| `staged` | true = 无任何文本引用、进暂存区待清理 |

- **数据链路**：粘贴 / 上传 → `addImage`（SHA-256）→ IndexedDB；正文用 `imgref:<id>` token 引用，`lib/image-refs.ts` 扫描引用。
- **See also**：[`docs/entry-points.md`](./entry-points.md) §8.9；`components/richtext/stored-image.tsx`。
- **Notice**：非安全上下文（无 `crypto.subtle`）下降级为随机 id，仅保证可用、不去重。

---

## 3. IndexedDB — 密码保险库 `workspace-vault`

- 写：`lib/vault-store.ts`（`saveVaultBlob` / `loadVaultBlob` / `hasVault` / `clearVault` / `exportVault` / `importVault`）
- 加密：AES-256-GCM，主密码经 PBKDF2 派生；**密钥仅驻留 `VaultProvider` 内存，不落盘**

| 持久化字段 | 说明 |
| --- | --- |
| 加密 blob | 保险库全部条目经 AES-256-GCM 加密后的二进制（含盐 / IV） |

- **See also**：[`docs/entry-points.md`](./entry-points.md) §8.11；`lib/crypto.ts`。
- **Notice**：明文与密钥均不持久化；Web Crypto 仅 `https` / `localhost` 可用。

---

## 4. IndexedDB — GitHub OG 图缓存 `workspace-gh`

- store：`imgs`，keyPath `url`
- 写：`lib/gh-card.ts` 的 `getOgImageSrc`（TTL `CACHE_MS = 6h`；命中未过期直接返回、未命中后台写入、失败静默）

| 持久化字段 | 说明 |
| --- | --- |
| `url` | 远程图直链（主键） |
| `blob` | 抓取到的图片二进制 |
| `ts` | 写入时间戳（用于 TTL 判断） |

- **See also**：[`docs/entry-points.md`](./entry-points.md) §8.10；[`docs/remote-image-cache-design.md`](./remote-image-cache-design.md)（外链图缓存方案）。
- **Notice**：仅 GitHub 卡片 OG 图走此库；正文 `![](url)` 外链图当前**不缓存**（方案待定）。

---

## 5. `public/*.yml`（只读，用户手改）

- 加载：`fetch` 同源只读；缺失 / 失败 toast 提示并跳过

| 文件 | 说明 |
| --- | --- |
| `public/address_book.yml` | 通讯录与生日（界面只读，不可增删改） |
| `public/custom_festivals.yml` | 自定义节日 / 假班覆盖（与内置中国日历要素合并） |

- **See also**：[`docs/custom-data-docs.md`](./custom-data-docs.md)。
- **Notice**：应用只读加载、不回写；改文件后需刷新页面。

---

## 6. 其它 localStorage 键（非 store）

| 键 | 说明 |
| --- | --- |
| `mw:weather-cache` | 天气结果缓存，2 小时内复用（`lib/weather.ts`） |
| `mw:weather-cooldown` | 天气 429 冷却到期时间，刷新不绕过 |

- **Notice**：AI API Key 存于 `settings`（属 §1 的 store），不单独落键。
