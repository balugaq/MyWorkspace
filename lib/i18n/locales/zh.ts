// 中文字典（TODO 40）：i18n 源文案，key 与 en.ts 一一对应。
// 本期为样板范围：settings 标题 / 分区导航 / 通用分区 + common 通用词；其余视图后续批次抽取。

const zhCore = {
  common: {
    save: "保存",
    cancel: "取消",
    add: "添加",
    delete: "删除",
    edit: "编辑",
    rename: "重命名",
    confirm: "确认",
    close: "关闭",
    enabled: "开启",
    disabled: "关闭",
  },
  settings: {
    title: "设置",
    sections: {
      general: "通用 / 基础",
      shortcuts: "快捷键 / 键位",
      account: "账户与同步",
      ai: "AI 助手",
      advanced: "高级",
      notifications: "GitHub 集成",
      news: "新闻精选",
    },
    general: {
      theme: "主题",
      themeOptions: {
        light: "浅色",
        dark: "深色",
        system: "跟随系统",
        green: "绿色",
        purple: "紫色",
        orange: "橙色",
      },
      pickTheme: "选择主题",
      language: "语言",
      languageDesc: "界面显示语言，切换后即时生效。",
      langOptions: { zh: "中文", en: "English" },
      fontSize: "字体大小",
      fontSizeDesc: "调整全局基础字号（12–24px），实时应用到整个界面。",
      fontFamily: "字体家族",
      fontFamilyDesc: "切换界面整体字体（系统默认 / 衬线 / 等宽）。",
      fontFamilyOptions: { system: "系统默认", serif: "衬线", mono: "等宽" },
      pickFontFamily: "选择字体家族",
      startup: "启动行为",
      startupDesc: "应用每次打开时默认进入的界面。",
      viewOptions: {
        "ai-chat": "AI 对话",
        workspace: "随笔",
        calendar: "日历",
        last: "打开上次的视图",
      },
      pickView: "选择默认视图",
      birthdayBannerDays: "生日横幅提前天数",
      birthdayBannerDesc:
        "顶栏生日横幅提前 n 天显示临近生日（含当天，0 = 仅当天；上限 60）。数据源：联系人生日（含农历换算）与账户里的自己生日。",
    },
  },
}

// ===== 批 1（全局外壳，2026-10-17）新增命名空间 =====

export const toolbar = {
  title: "工具",
  expand: "展开工具栏",
  collapse: "收起工具栏",
  aiChat: "AI 对话",
  chatSuffix: "对话",
  notes: "随笔",
  calendar: "日历",
  contacts: "联系人",
  vault: "密码保险库",
  notifications: "通知",
  githubQueue: "GitHub 队列",
  vocabulary: "词汇表",
}

export const statusBar = {
  nodes: "节点",
  done: "已完成",
  items: "项",
  people: "人",
  rounds: "轮",
  tokensIn: "输入 {{n}} tok",
  tokensOut: "输出 {{n}} tok",
  workspace: "工作台",
}

export const brandHeader = {
  openNav: "打开导航",
  home: "回到主界面",
  appName: "全能工作台",
  searchAll: "搜索全部内容…",
  account: "账号",
  accountMenu: "账号菜单",
  openProfile: "打开个人主页",
  openSettings: "打开设置",
}

export const search = {
  title: "全局搜索",
  placeholder: "搜索分类、篇目、Todo、解决方案、日历笔记…",
  typeToSearch: "输入关键词开始搜索",
  noResults: "没有找到与「{{query}}」匹配的结果",
  results: "找到 {{n}} 个结果",
  from: "来自",
  scope: { all: "全部", category: "当前分类", calendar: "日历笔记", todo: "Todo", mindmap: "思维导图" },
  type: { chapter: "篇目", note: "笔记", node: "Todo", solution: "解决方案" },
}

export const home = {
  loading: "正在加载工作台…",
  openCategory: "打开一个分类",
  pickFromSidebar: "在左侧选择一个分类开始使用。",
  noCategories: "还没有分类",
  createGuide: "在左侧点击“添加分类”，选择小说、学习、工作或关系图模板开始使用。",
  resizeSidebar: "调整侧边栏宽度",
  nav: "导航",
}

export const addCategory = {
  title: "新建分类",
  desc: "选择模板并配置，创建后可在侧边栏管理内容。",
  name: "分类名称",
  namePlaceholder: "例如：我的超级无敌小说",
  template: "模板类型",
  unit: "条目单位（可选）",
  defaultUnit: "章",
  unitHint: "如 章 / 首 / 回 / 条 / 课；留空则用「章」。同时决定底部翻页（上一X/下一X）与自动编号标题（第%X → 第一章）",
  autoNumber: "自动中文编号",
  count: "初始条目数量",
  errEmpty: "请填写分类名称",
  errTooLong: "分类名称不能超过 20 个字",
  created: "已创建分类「{{name}}」",
}

export const templates = {
  novel: { label: "小说类", desc: "自动生成章节目录，适合诗集、小说、连载" },
  study: { label: "学习类", desc: "知识笔记与学习条目管理" },
  work: { label: "工作类", desc: "工作文档与任务清单" },
  life: { label: "生活类", desc: "生活记录与随手笔记" },
  relation: { label: "关系类", desc: "思维导图模式，管理 Todo 之间的因果关系" },
  custom: { label: "自定义", desc: "空白分类，自由记录" },
}

export const sidebar = {
  collapse: "收起侧边栏",
  calendar: "日历",
  aiQuickTip: "点击任意问题，自动开启一段新对话并发送。",
  lifeBar: "人生进度条",
  copyLifeBar: "复制人生进度条",
  copiedLifeBar: "已复制人生进度条",
  lifeBarHint: "先到 设置 → 账户与同步 中填写生日，这里就会显示你的进度 →",
  pwdGen: "密码生成器",
  pwdPickSet: "请至少选择一种字符",
  copyPwd: "复制密码",
  regenerate: "重新生成",
  pwdLength: "位数",
  setUpper: "大写字母",
  setLower: "小写字母",
  setDigits: "数字",
  setSymbols: "特殊字符",
  pwdHint: "勾选字符集并调整位数后自动重新生成；密码仅在本机生成，不会上传。",
  notes: "随笔",
  addCategory: "添加分类",
  myCategories: "我的分类",
  noCategories: "还没有分类，点击上方按钮创建。",
  categoryActions: "分类操作",
  open: "打开",
  deleteCatTitle: "删除分类「{{name}}」？",
  deleteCatDesc: "此操作不可撤销，该分类下的所有内容都会被删除。",
  deletedCat: "已删除分类",
  renameCat: "重命名分类",
  renamed: "已重命名",
  categoryOverview: "分类概览",
  untitled: "未命名",
  addedItem: "已添加条目",
  addItem: "添加条目",
}

/** 聚合导出：每批次一个命名空间段，common 单独一份（全站通用词） */
export const zh = {
  common: {
    ...zhCore.common,
    copyPwd: "复制密码",
  },
  settings: zhCore.settings,
  toolbar,
  statusBar,
  brandHeader,
  search,
  home,
  addCategory,
  templates,
  sidebar,
}
