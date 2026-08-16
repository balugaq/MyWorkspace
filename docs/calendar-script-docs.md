# 日历标记脚本指南（Calendar Scripts）

本指南面向希望在日历上做自定义标记（自动标注节日、纪念日、预算、习惯打卡等）的用户——通过编写一段**本地 JS 脚本**，订阅 `RenderDateEvent` 事件总线，为单个日期块追加标记节点。

> ⚠️ 脚本是**信任的本地脚本**，直接在你的浏览器里执行，不受沙箱隔离。请只在存入你信任的代码。

---

## 1. 架构概述

```
组件本身（React 渲染日历）──→ 每渲染一个日期块 ──→ emitRenderDate({ displayType, date, element, api })
                                                              │
                                                              ▼
                                              启用的脚本的 renderDate(handler)
                                                              │
                                              handler 通过 ev.api 给该日期块加标记
```

- **事件**：`RenderDateEvent`
- **触发时机**：月 / 周视图渲染完成后，对网格中的每个日期块各触发一次。
- **载荷字段**：
  - `displayType: "month" | "week" | "day"` —— 当前日历显示类型
  - `date: string` —— 该日期块对应日期，格式 `yyyy-MM-dd`
  - `element: HTMLElement` —— 该日期块的根 DOM 元素
  - `api: DateMarkerApi` —— 便捷标记工具

---

## 2. 脚本提供的全局能力

每一个脚本在启动时被包进一个受限函数，向你注入 4 个全局：

| 名称 | 说明 |
| --- | --- |
| `renderDate(handler)` | 注册一个处理函数，每个日期块渲染时都会被调用一次 |
| `useLib(name)` | 获取解析库：`useLib('json') / useLib('yaml') / useLib('xml')` |
| `lib` | 同上，门面对象：`lib.json / lib.yaml / lib.xml` |
| `console` | 控制台（`console.log/error`），便于调试 |

> `renderDate(handler)` 里 handler 的参数是 `RenderDateEvent`（见上）。

---

## 3. 编写你的第一个脚本

在「设置 → 管理日历标记脚本 → 新建脚本」里写入下面的示例，保存后打开日历即可看到标记。

```js
// 用 YAML 配置一些节假日，按 “MM-DD” 匹配并打上标记
const config = useLib('yaml')(`
holidays:
  - date: 01-01
    name: 元旦
  - date: 10-01
    name: 国庆
`);

renderDate((ev) => {
  const md = ev.date.slice(5);       // 取 "MM-DD"
  const hit = config.holidays.find((h) => h.date === md);
  if (hit) {
    // 在当前日期块上追加一个标记
    ev.api.addMarker('holiday', hit.name);
  }
});
```

效果：1 月 1 日、10 月 1 日的日期块下方会出现「元旦」「国庆」小徽标。

---

## 4. 事件对象与可用的 API

`renderDate((ev) => { ... })` 中的 `ev` 结构：

```ts
interface RenderDateEvent {
  displayType: "month" | "week" | "day";
  date: string;        // "yyyy-MM-dd"
  element: HTMLElement;
  api: DateMarkerApi;
}
```

`ev.api` 提供 3 个便捷方法：

| 方法 | 作用 |
| --- | --- |
| `api.addMarker(kind?, text?)` | 追加一个小徽标节点；`text` 为文字，缺省显示 `kind` 或 `●` |
| `api.addBulk(kinds[])` | 先清空该块的标记容器，再批量追加多个标记 |
| `api.addText(text)` | 追加一行纯文本 |

你也可以完全绕开 `api`，直接操作 `ev.element`（它就是日期块根 DOM），自由附加节点/样式。

---

## 5. 解析库用法

脚本可解析三种常见配置/数据格式：

- **JSON**（内置）：`useLib('json').parse(str)` 或直接 `JSON.parse(str)`。
- **YAML**：`useLib('yaml')(str)` → 返回解析后的对象。
- **XML**：`useLib('xml')(str)` → 返回解析后的对象。

例如：

```js
const y = useLib('yaml')(`count: 3`);
const x = useLib('xml')(`<cfg><mode>festival</mode></cfg>`);
const j = useLib('json')('{"mode":"habit"}');
```

典型用法：在脚本顶部 `const config = useLib('yaml')(\`...\`)` 写死一份配置（脚本代码内联配置即可，无需外部文件）。

---

## 6. 常见示例

**示例 A：给今天加标记**
```js
renderDate((ev) => {
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  if (ev.date === key) ev.api.addMarker('today', '今天');
});
```

**示例 B：周末加标记（利用 displayType 区分视图）**
```js
renderDate((ev) => {
  const d = new Date(ev.date + 'T00:00:00');
  const day = d.getDay(); // 0=周日 6=周六
  if (day === 0 || day === 6) {
    ev.api.addMarker('weekend', day === 0 ? '周日' : '周六');
  }
});
```

**示例 C：从 XML 读取数据并批量标记**
```js
const plan = useLib('xml')(`
<plan>
  <entry date="12-24" labels="平安夜,圣诞前夕" />
  <entry date="12-25" labels="圣诞节" />
</plan>
`);
renderDate((ev) => {
  const md = ev.date.slice(5);
  const e = plan.plan.entry.find((x) => x['@_date'] === md);
  if (e) ev.api.addBulk(e['@_labels'].split(','));
});
```

---

## 7. 脚本如何被加载与运行

1. 脚本数据（`name` / `enabled` / `code`）保存在本地 store（localStorage），随应用持久化。
2. 应用启动时（`app/page.tsx` 挂载），`use-calendar-scripts.ts` 会把所有**启用**的脚本载入事件总线；脚本调用 `renderDate(...)` 订阅。
3. 编辑脚本、切换启停、删除脚本时，对应订阅会被**自动重载/清理**，无需刷新页面。
4. 打开日历（月/周视图）时，每个日期块渲染完会触发 `RenderDateEvent`，你的处理函数随即执行并加标记。

---

## 8. 排错

| 现象 | 排查 |
| --- | --- |
| 打开日历没有任何标记 | 确认脚本「已启用」；确认写了 `renderDate(...)` 并在 `ev.api.addMarker` 或类似操作；检查浏览器控制台（F12）错误 |
| 只在部分日期出现 | 检查你的日期匹配逻辑（`ev.date` 为 `yyyy-MM-dd`，`slice(5)` 取 `MM-DD`） |
| 脚本报错 | 用 `console.log(ev)` 在控制台观察事件体；错误会在控制台打印但不会影响其他脚本 |
| 标记重复累积 | 切月/切视图后标记应被清空重建；若发现残留，多半是脚本用了 `ev.element.appendChild` 而没有用 `api.addMarker/addBulk` |

---

## 9. 高级提示

- **内联配置**：把 YAML/XML/JSON 直接写在脚本里（模板字符串），最简单；也可自己用 `fetch` 读取 `public/` 下文件（需处理跨域/相对路径）。
- **多脚本互不影响**：每个脚本独立订阅、独立清理，一个脚本崩了不会拖垮其它脚本或日历。
- **不止标记**：`ev.element` 完全暴露，你可以改日期块的背景、加边框、塞自定义控件等。
