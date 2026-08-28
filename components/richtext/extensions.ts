"use client"

import StarterKit from "@tiptap/starter-kit"
import TaskList from "@tiptap/extension-task-list"
import TaskItem from "@tiptap/extension-task-item"
import { Markdown } from "tiptap-markdown"
import { StoredImage } from "./stored-image"
import { GitHubCard } from "./github-card"

/**
 * 富文本编辑/渲染共享的扩展集（编辑态与只读态共用，保证交互与渲染一致）。
 *
 * 组成：
 *  - StarterKit：段落/标题/列表/引用/代码块/hr/链接/撤销等（v3 已内置 Link/Underline）。
 *  - StoredImage：自研图片节点，支持 imgref:<id>（IndexedDB 内文图）与远程图。
 *  - TaskList / TaskItem：任务列表（checkbox）。
 *  - GitHubCard：GitHub Issue/PR 预览卡节点。
 *  - Markdown：让正文以 markdown 字符串序列化（getMarkdown/setMarkdown），正文仍是 markdown，无需数据格式迁移。
 */
export const richTextExtensions = [
  StarterKit.configure({
    // 保留默认，链接已内置
  }),
  StoredImage,
  TaskList,
  TaskItem.configure({ nested: true }),
  GitHubCard,
  Markdown.configure({
    html: false, // 不解析原始 HTML（XSS 防护，沿用原 safeHref 思路）
    tightLists: true,
    linkify: false,
    breaks: true, // 单换行即 <br>，贴近 textarea 体验
    transformPastedText: true, // 粘贴 markdown 文本时自动格式化
    transformCopiedText: true,
  }),
]
