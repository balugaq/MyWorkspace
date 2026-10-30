# HANDOFF — 交接笔记（给未来接手者，包括未来的 LLM 代理）

> 目标：不读完全部代码也能安全地发布、更新依赖、改持久化 schema。
> 配套阅读：[`AGENTS.md`](../AGENTS.md)（操作契约与红线）、[`docs/entry-points.md`](./entry-points.md)（功能入口地图）、[`docs/data-storage.md`](./data-storage.md)（数据落点）。

---

## 1. 发布流程

### 1.1 三条发布通道

| 通道 | 触发 | 产物 | 配置差异 |
| --- | --- | --- | --- |
| **GitHub Pages**（线上主入口） | push 到 `master`（`.github/workflows/deploy.yml` 自动） | Pages 站点 | `NEXT_PUBLIC_BASE_PATH=/MyWorkspace` + `NEXT_PUBLIC_ASSET_PREFIX=/MyWorkspace` + `NEXT_PUBLIC_UNOPTIMIZED_IMAGES=true` |
| **GitHub Release**（本地可用版） | push tag `v*` 或手动 workflow_dispatch（`release.yml`） | `myworkspace-<tag>.zip`（out/ 打包） | **不设** basePath/assetPrefix，解压后任意静态服务器可直接托管 |
| **本地验证** | `npm run deploy:local`（= `next build` + `scripts/serve-static.mjs`） | `out/` 本地托管 | 同 Release（无 basePath） |

### 1.2 发布前必过门禁

```
npm run typecheck   # tsc --noEmit，0 错误
npm run lint        # eslint，0 错误 0 警告
npm test            # node --test，tests/*.test.ts，0 失败
```

CI（`ci.yml`）在 PR/push 上也会跑同样的门禁，外加 `npm audit --audit-level=high` 与 peer-deps 检查——本地全绿但 CI 红时先看这两项。

### 1.3 构建特性须知

- **静态导出**（`next.config.ts` 的 `output: "export"`）：产物是纯静态 `out/`，**不兼容 `next start`**；本地起服务用 `npm run serve`。
- **依赖数据构建时打包**：`lunar-javascript` 等依赖携带的静态数据（农历/节气/法定节假日调休）在构建期打进产物，运行时无法更新——这正是 §2 `update-dependencies` 存在的原因。
- **wrangler.jsonc**：预留的 Cloudflare Pages 资产目录指向 `./out`，当前未在 CI 中使用；如启用，注意 basePath 语义与 Pages 版保持一致或按需留空。

### 1.4 版本号

- 唯一来源是 `package.json` 的 `version`（设置页「账户」分区展示）。
- 发版 = 改 version → commit → 打 `v<version>` tag 推送（Release workflow 自动出包）。tag 必须匹配 `v*`，否则 release.yml 不触发。

---

## 2. `update-dependencies` 脚本

- 位置：`scripts/update-dependencies.mjs`；挂在 **predev / prebuild** 钩子，`npm run dev` 与 `npm run build` 前自动执行；也可 `npm run update-dependencies` 手动跑。
- 作用：对 `DEPS` 清单里的包执行 `npm update <pkg>`，**只更新 package.json `^` 范围内的最新版**，不会跨大版本。
- 失败非致命：离线/超时（90s）仅 `console.warn`，构建继续用现有版本。
- 整体跳过：`SKIP_DEP_UPDATE=1 npm run build`。CI（ci.yml）不跑 build（只 typecheck/lint/test/audit），deploy.yml 的 Pages 构建会正常执行 prebuild 更新；本地动打包链/验证构建时建议带上 `SKIP_DEP_UPDATE=1`，避免产物数据漂移干扰排查。
- **扩展方式**：需要构建期刷新数据的依赖，往脚本顶部 `DEPS` 数组追加 `{ name, purpose }` 一项即可。当前只有 `lunar-javascript`（中国农历/节气/节假日调休数据）。

---

## 3. localStorage schema 迁移惯例

### 3.1 基本盘

- persist 键：`my-omni-workspace`（`lib/store.ts` 的 `STORAGE_NAME`），Zustand persist + 防抖存储（静止 800ms 落盘，`pagehide`/切后台立即 flush）。
- 其他后端：图片/自动备份在 IndexedDB，全量清单见 [`docs/data-storage.md`](./data-storage.md)。

### 3.2 改 schema 的铁律

1. **禁止破坏性改动已发布字段**（AGENTS.md 红线 #1）：旧 localStorage 里的数据是用户唯一副本，读不兼容 = 数据丢失。
2. 新增字段必须双写：`lib/types.ts` 类型 + `lib/store.ts`（现为 12 个切片组合，见 `lib/store/slices/`）默认值，并让旧存档经 `merge` 补齐默认值。
3. **迁移逻辑写在 `lib/persist-merge.ts`**，不写进组件、不写进 store 组合层：
   - 纯数据变换、零 DOM/存储/React 依赖 → `tests/persist-merge.test.ts` 可直接测（node:test，import 源码须带 `.ts` 扩展名）；
   - persist 的 `merge: mergePersistedState` 与备份导入（`importData`/`mergeData`）**共用**同一批迁移函数——改迁移时两条路径都要想到。
4. 迁移模式参考（persist-merge.ts 内已有先例）：
   - 字段改名/升级结构：`migratePersona`（旧 `aiPersona` 字符串 → `aiPersonas` 列表）、旧 `Category.relation` → `relationFamilies` 默认族；
   - 缺失字段补默认：`normalizeMindNodes`（旧节点补 `LEGACY_NODE_TIME`；约定 `undefined`=缺失补值，`null`=明确状态保留）；
   - 设置兜底归一：`normalizeDayStartOffset` / `normalizeNotificationRepos` 等。
5. 每条迁移在 `tests/persist-merge.test.ts` 配回归断言（旧快照 → 期望新结构），改坏旧档兼容会在这里先红。

### 3.3 验收一个 schema 改动

1. `npm run typecheck && npm run lint && npm test` 全绿；
2. 手测路径：用旧结构造一份 localStorage 快照（或从自动备份拿）→ 粘进 `my-omni-workspace` → 刷新页面 → 确认新功能可用且旧数据未丢；
3. 备份导入路径再走一遍（设置 → 账户 → 导入备份），确认共用迁移函数没只修一半。

---

## 4. 接手 checklist

- [ ] `npm install` → `npm run dev` 能起（predev 会先跑 update-dependencies，离线也只警告）。
- [ ] 读一遍 `AGENTS.md` 的 TL;DR 与红线，特别是：AI/协作者不得代执行 `git commit`、不得自行开浏览器做视觉验证、验收三件套。
- [ ] UI 约定在 `docs/ui-conventions.md`；新增视图/模板/快捷键/设置项的入口改法在 `AGENTS.md` 决策树（§4）。
- [ ] 第三方依赖新增后必须在 `lib/licenses.ts` 的 `THIRD_PARTY_LICENSES` 补声明，否则许可证页不展示。
- [ ] 本文件与 `AGENTS.md`/`entry-points.md`/`data-storage.md` 之间以「文件名/方法名」互链，**不写行号**（行号会漂移，这是既有纪律）。
