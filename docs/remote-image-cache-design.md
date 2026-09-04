# Markdown 外链图（`![alt](url)`）缓存方案设计

> 状态：**待审核** —— 只做设计与选型，未写实现代码。
> 目标：给正文里 `![alt](https://...)` 这类外链图加一层可控缓存，解决「离线打不开 / 每次重下 / 无法管理」的问题。

---

## 1. 结论速览

| 项 | 现状 |
| --- | --- |
| 外链图有无缓存 | **没有**。`MarkdownImg` 直接 `<img src={url}>` 热链，唯一缓存是浏览器 HTTP 缓存（不可控，可被 `no-cache` 响应头废掉） |
| 存储基座 | 已有成熟实现 `lib/image-store.ts`（IndexedDB + SHA-256 内容寻址 + 暂存区 + 导入导出），但**只服务粘贴/上传的 `imgref:` 内文图** |
| 引用扫描 | `lib/image-refs.ts` 只认 `{{img:}}` 和 `(imgref:)`，**外链 URL 完全不被统计**，所以图片缓存弹窗里看不到它们 |
| 可复用写法 | `lib/gh-card.ts` 的 `getOgImageSrc()` —— 已是「远程 URL → blob → IndexedDB，带 TTL，失败静默降级」的现成骨架 |

---

## 2. 现状盘点（代码定位）

### 2.1 `![alt](url)` 的渲染路径

| 位置 | 行为 |
| --- | --- |
| `components/rich-text.tsx` → `MarkdownImg` | `imgref:` 协议转 `StoredImg`（走 IndexedDB）；**其余一律 `<img src={url}>` 裸热链，无任何缓存逻辑** |
| `components/richtext/stored-image.tsx` | TipTap 节点视图，`isImgref(src)` 决定走内文图还是外链图 |
| `components/markdown-view.tsx:107` | 列表卡片两行截断预览，也调 `MarkdownImg` |

→ 也就是说：**同一篇正文里，内文图吃 IndexedDB 缓存，外链图裸奔。**

### 2.2 存储基座：`lib/image-store.ts`

- DB `workspace-images` / store `images`，keyPath `id`
- `id` = blob 的 **SHA-256**（内容寻址，同字节自动去重）
- 字段 `{ id, blob, kind, createdAt, staged }`，`staged` = 无引用进暂存区
- `getImageURL` 内有 `urlCache: Map<id, objectURL>` 进程内缓存，避免重绘闪烁
- 导入导出齐备：`exportImages` / `importImages` / `importImageBlobs`（供含图 ZIP 备份）

**只为用户主动粘贴/上传的图服务**，正文用 `imgref:<id>` 引用，外链 URL 从不进这个库。

### 2.3 引用扫描：`lib/image-refs.ts`

`imageIdsInText` 正则只匹配 `\{\{img:([^}]+)\}\}` 与 `\(imgref:([^)\s]+)\)`。
→ 外链图没有 id、无法判定是否被引用，因此**不适合套用现有的「暂存区」管理模型**，只能靠 TTL + 容量淘汰 + 手动清空。

### 2.4 可复用的骨架：`lib/gh-card.ts` 的 `getOgImageSrc()`

- 独立 DB `workspace-gh`，store `imgs`，keyPath = `url`
- 记录 `{ url, blob, ts }`，TTL `CACHE_MS = 6h`
- 命中未过期 → `URL.createObjectURL(blob)`；未命中 → **先返回原始直链保证能显示**，同时后台 `fetch` 写入缓存，失败静默忽略

这套「旁路缓存 + 不阻塞首屏 + 失败降级」的写法，就是方案 A 要照搬的骨架（**只复用写法，与 GitHub 卡功能本身无关**）。

---

## 3. 一个前置约束：CSP（待主人实测确认）

`scripts/inject-csp.mjs` 在 `postbuild` 为 `out/` 注入的策略（已核对 `out/index.html`）：

```
img-src     'self' blob: data:     ← 未放行 https:，规范上会拦 <img src="https://...">
connect-src 'self'                 ← 未放行外部域，会拦 fetch 下载图片
```

**但 dev 下不生效**：`app/layout.tsx` 的 CSP meta 在 `npm run dev` 下是占位符 `__CSP_INJECTED_AT_BUILD__`，浏览器忽略无效指令 → dev 里外链图显示正常。只有 `npm run build` 产出的 `out/`（即 `npm run serve` / `deploy:local` 托管的对象）才带真实策略。

| 影响 | 说明 |
| --- | --- |
| 外链图显示 | 若走 build 产物，`img-src` 需放行 `https:`；dev 下无影响 |
| 方案 A 的下载 | 方案 A 要 `fetch` 图片存 IndexedDB，走 build 产物时 `connect-src` 需放行 |

> **待确认**：主人平时是 dev 还是 build 产物？若只跑 dev，这一节可以整段跳过；若要发 build 产物，需要在落地方案 A 时顺带把这两条放行（白名单形式，不建议无脑开 `https:`）。

---

## 4. 四个方案

### 方案 A：URL → blob 旁路缓存（照搬 gh-card 骨架）⭐ 推荐

新增 `lib/remote-image-cache.ts` + 独立 DB `workspace-remote-img`（store `imgs`，keyPath = 规范化 URL）。

```
MarkdownImg 挂载
  ├─ 查缓存 → 命中且未过期 → objectURL 渲染（秒开，不打网络）
  │            └─ 后台 revalidate（带 If-None-Match），有更新则替换
  ├─ 未命中 → <img src=url> 先直出（不阻塞首屏），后台 fetch 写入缓存
  └─ 网络失败 → 回退过期缓存（离线兜底）
```

- 记录：`{ url, blob, mime, ts, size, etag?, lastModified? }`
- TTL 默认 7 天；容量上限默认 **300 条 / 100MB**，超限按 LRU 淘汰
- 设置项三档：`关闭` / `自动（缓存优先 + 后台更新，默认）` / `仅离线兜底`
- 管理入口：并入「设置 → 图片缓存/暂存区」，新增「外链缓存」分区（条数 / 占用 / 清空）

| 优点 | 缺点 |
| --- | --- |
| 骨架现成，改动集中在 `MarkdownImg` 一处 | 走 build 产物时需放行 CSP（第 3 节） |
| 离线可用、速度可控、可清可管 | 首次访问仍打网络 |
| 不动正文数据，零迁移风险 | 外链图无法参与引用扫描，只能靠 TTL + LRU 淘汰 |

### 方案 B：另存为本地图（把外链图固化成 `imgref:`）

把远程图下载成 blob 存进 `lib/image-store.ts`，并把正文的 `![](url)` **改写**为 `![](imgref:<id>)`。

| 优点 | 缺点 |
| --- | --- |
| 彻底离线、永久可用 | **改写正文 = 动数据**，有误改风险 |
| 进含图 ZIP 备份 | 备份体积变大 |
| 受引用扫描 / 暂存区统一管理 | 原图更新后本地副本不会变 |
| 天然绕开 `img-src` 限制 | 自动改写会让用户困惑（"我的链接呢"） |

**建议做成显式动作，不全自动**：图片 hover 工具栏加「存为本地图片」，点了才转。可作为 A 的补充。

### 方案 C：Service Worker 拦截

加 SW，在 `fetch` 事件里对图片请求走 Cache Storage，cache-first / stale-while-revalidate。

| 优点 | 缺点 |
| --- | --- |
| 零侵入：不改组件、不改正文 | 静态导出加 SW 要处理注册 / 更新 / 注销 |
| 浏览器原生，性能好 | `worker-src` 同样受 CSP 约束 |
| | Cache Storage 难在 UI 里列举、难导出、不进备份 |
| | 与现有 IndexedDB 体系割裂，两套缓存心智 |

对本项目的「可管理、可导出」取向而言偏重。

### 方案 D：只依赖浏览器 HTTP 缓存

什么都不建，缓存交给浏览器。

| 优点 | 缺点 |
| --- | --- |
| 零改动、零风险 | 无离线能力、无管理入口、无去重 |
| | 完全听服务端 `Cache-Control` 摆布 |

---

## 5. 对比表

| 维度 | A 旁路缓存 | B 另存本地 | C Service Worker | D 不管 |
| --- | --- | --- | --- | --- |
| 离线可用 | ✅ | ✅✅ | ✅ | ❌ |
| 改正文数据 | ❌ 不改 | ⚠️ 改写 | ❌ 不改 | ❌ 不改 |
| 可列举 / 可清理 | ✅ | ✅ | ❌ | ❌ |
| 进含图备份 | ❌（建议不带） | ✅ | ❌ | ❌ |
| 实现量 | 中 | 中 | 大 | 无 |
| 与既有体系一致性 | 高（照搬 gh-card） | 高（复用 image-store） | 低 | — |

---

## 6. 推荐

**先上方案 A；方案 B 作为后续可选增强（做成手动「存为本地图片」）。**

两者不冲突：A 解决「打开快 + 离线能看」，B 解决「永久保存」。分两步走风险最低。若第 3 节的 CSP 确需处理，建议单独一个提交，便于回滚。

### 6.1 方案 A 的实施拆分（审核通过后执行）

1. 新增 `lib/remote-image-cache.ts`：`getRemoteImageSrc(url)` / `clearRemoteImageCache()` / `remoteImageCacheStats()`；内部含 LRU 淘汰与 TTL 判断
2. 改造 `components/rich-text.tsx` 的 `MarkdownImg`：接缓存，保留 `<img src=url>` 作为加载中与失败时的兜底
3. 新增设置项 `settings.remoteImageCache`（`off | auto | fallbackOnly`）与容量上限，落到 `lib/types.ts` + `lib/store.ts` + `settings-dialog.tsx`
4. `components/image-cache-dialog.tsx` 增加「外链缓存」分区：条数 / 占用 / 清空按钮
5. 同步更新 `docs/entry-points.md` §8.9（图片系统）

---

## 7. 待主人定夺

1. **选哪个方案**（推荐 A，B 后续再说）
2. **运行方式**：平时是 dev 还是 build 产物？决定第 3 节 CSP 是否要一起处理
3. **外链缓存要不要进含图 ZIP 备份**：建议不进（体积大、可重建），需确认
4. **容量上限 300 条 / 100MB** 是否合适
5. **TTL 默认 7 天**是否合适（gh-card 现在用的是 6 小时）
