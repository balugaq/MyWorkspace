export interface ThirdPartyLicense {
  /** 软件名称 */
  name: string
  /** 作者 / 维护组织 */
  author: string
  /** 简短描述（中文，说明本项目如何用到它） */
  description: string
  /** 许可证简称（如 MIT / ISC / Apache-2.0） */
  license: string
  /** 许可证文本链接（标准许可证页面） */
  licenseUrl: string
}

// 收集自 package.json 的运行时依赖与关键构建依赖。
// 许可证简称若有出入，链接指向的是对应标准许可证文本，整体可信。
export const THIRD_PARTY_LICENSES: ThirdPartyLicense[] = [
  {
    name: "Next.js",
    author: "Vercel Inc.",
    description: "React 应用框架，本项目的基座（App Router + 静态导出）。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "React",
    author: "Meta Platform, Inc.",
    description: "用于构建用户界面的 JavaScript 库。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "React DOM",
    author: "Meta Platform, Inc.",
    description: "React 的 DOM 渲染器。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "@base-ui/react (Base UI)",
    author: "MUI Team",
    description: "无样式、可访问的基础组件（Dialog / Select / ScrollArea 等）。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "@xyflow/react (React Flow)",
    author: "xyflow",
    description: "思维导图画布的节点/连线交互引擎。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "zustand",
    author: "pmndrs",
    description: "轻量状态管理库，承载全局工作台状态。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "date-fns",
    author: "date-fns contributors",
    description: "日期处理工具（日历与截止日期计算）。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "lucide-react",
    author: "Lucide",
    description: "图标库，提供各处的矢量图标。",
    license: "ISC",
    licenseUrl: "https://opensource.org/licenses/ISC",
  },
  {
    name: "sonner",
    author: "Emil Kowalski",
    description: "轻量 toast 通知组件。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "clsx",
    author: "Luke Edwards",
    description: "条件类名拼接工具。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "class-variance-authority",
    author: "Joe Bell",
    description: "组件变体样式管理（cva）。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "tailwind-merge",
    author: "Dani Castilho",
    description: "合并 Tailwind 类名并消除冲突。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "tailwindcss",
    author: "Tailwind Labs, Inc.",
    description: "原子化 CSS 框架。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "tw-animate-css",
    author: "tw-animate",
    description: "Tailwind v4 的动画工具集。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "yaml",
    author: "Eemeli Aro",
    description: "YAML 解析/序列化（自定义节日/通讯录数据）。",
    license: "ISC",
    licenseUrl: "https://opensource.org/licenses/ISC",
  },
  {
    name: "fflate",
    author: "Matt DesLauriers (101arrowz)",
    description: "ZIP 备份的压缩/解压（禁止手写 ZIP 读写）。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "marked",
    author: "Christopher Jeffrey（markedjs）",
    description:
      "Markdown 解析库，预览渲染用它把文本解析成 token 树（仅用 lexer 解析，渲染由本项目自行实现，不接外部呈现库）。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "lunar-javascript",
    author: "6tail",
    description: "农历/节气/节假日计算（日历要素）。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "fast-xml-parser",
    author: "Naveen (natural-intelligence)",
    description: "XML 解析（自定义数据兼容）。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "cmdk",
    author: "Paco Coursey",
    description: "命令面板（全局搜索交互）。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "next-themes",
    author: "Paco Coursey",
    description: "主题切换（浅色/深色/跟随系统）。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "shadcn/ui",
    author: "shadcn",
    description: "组件源码集合（本项目 UI 基础）。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "TypeScript",
    author: "Microsoft",
    description: "类型化 JavaScript 编译器（构建期）。",
    license: "Apache-2.0",
    licenseUrl: "https://opensource.org/licenses/Apache-2.0",
  },
  {
    name: "ESLint",
    author: "OpenJS Foundation",
    description: "代码静态检查（构建期）。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "Prettier",
    author: "Prettier",
    description: "代码格式化（构建期）。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "@tiptap/core",
    author: "tiptap.dev（Philipp Kühn）",
    description:
      "富文本编辑器内核（ProseMirror 封装）。本项目用它接管正文编辑/渲染，作为 QQ 式「消息链」元素模型底座；仅用其核心 + 扩展，不接任何云端服务。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "@tiptap/react",
    author: "tiptap.dev（Philipp Kühn）",
    description: "TipTap 的 React 绑定（useEditor / EditorContent / BubbleMenu）。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "@tiptap/starter-kit",
    author: "tiptap.dev（Philipp Kühn）",
    description: "TipTap 常用扩展集合（段落/标题/列表/引用/代码块/hr/链接/撤销等）。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "@tiptap/extension-image",
    author: "tiptap.dev（Philipp Kühn）",
    description: "图片节点扩展；本项目在其上派生自定义图片节点以支持 IndexedDB 内文图（imgref scheme）。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "@tiptap/extension-task-list",
    author: "tiptap.dev（Philipp Kühn）",
    description: "任务列表（checkbox 列表）节点扩展。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "@tiptap/extension-task-item",
    author: "tiptap.dev（Philipp Kühn）",
    description: "任务列表项节点扩展。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "@tiptap/extension-code-block-lowlight",
    author: "tiptap.dev（Philipp Kühn）",
    description: "带语法高亮的代码块扩展，把 highlight.js（经 lowlight）的 token 着色接入代码块节点视图。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "lowlight",
    author: "Titus Wormer",
    description: "基于 highlight.js 的语法高亮引擎，被 @tiptap/extension-code-block-lowlight 用来做代码着色（common 含约 37 种常用语言）。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "highlight.js",
    author: "highlight.js core team",
    description: "底层语法定义与 tokenizer，被 lowlight 依赖用于识别各语言 token。",
    license: "BSD-3-Clause",
    licenseUrl: "https://opensource.org/licenses/BSD-3-Clause",
  },
  {
    name: "tiptap-markdown",
    author: "Agontuk",
    description:
      "让 TipTap 以 Markdown 字符串作为内容序列化格式（getMarkdown/setMarkdown）。本项目正文仍存 Markdown 字符串，靠本扩展让 TipTap 直接读写，避免数据格式迁移。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
  {
    name: "ProseMirror",
    author: "Marijn Haverbeke",
    description: "TipTap 底层的文档模型/状态/视图引擎（prosemirror-model/state/view 等，经 @tiptap/pm 引入）。",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
  },
]
