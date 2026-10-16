// 中文字典（TODO 40）：i18n 源文案，key 与 en.ts 一一对应。
// 本期为样板范围：settings 标题 / 分区导航 / 通用分区 + common 通用词；其余视图后续批次抽取。

export const zh = {
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
