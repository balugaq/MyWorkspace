"use client"

import StarterKit from "@tiptap/starter-kit"
import TaskList from "@tiptap/extension-task-list"
import TaskItem from "@tiptap/extension-task-item"
import { createLowlight, common } from "lowlight"
import { CodeBlockEnhanced } from "./code-block"
import { Markdown } from "tiptap-markdown"
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table"
import { StoredImage } from "./stored-image"
import { GitHubCard } from "./github-card"
import { BilibiliCard } from "./bilibili-card"
import { FormatColor } from "./format-color"
import { InternalLinkMark } from "./internal-link-mark"

// 语法高亮引擎：lowlight（基于 highlight.js），common 含约 37 种常用语言。
const lowlight = createLowlight(common)

/**
 * 富文本编辑/渲染共享的扩展集（编辑态与只读态共用，保证交互与渲染一致）：
 * StarterKit、代码块增强（TODO 38）、imgref 内文图、任务列表、GitHub/B 站预览卡、GFM 表格、
 * 16 色标签（TODO 32）、内链（TODO 28）；Markdown 使正文以 markdown 字符串序列化，无需数据格式迁移。
 */
export const richTextExtensions = [
  StarterKit.configure({
    // 禁用内置 codeBlock，改用下方带语法高亮的增强版
    codeBlock: false,
  }),
  StoredImage,
  TaskList,
  TaskItem.configure({ nested: true }),
  // TODO 38：行号 gutter + 语言角标
  CodeBlockEnhanced.configure({ lowlight }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  GitHubCard,
  BilibiliCard,
  // 16 色文本标签 mark（TODO 32）：<blue>…</blue> 等，解析与序列化见 format-color.ts
  FormatColor,
  // 内链 mark（TODO 28）：[[mw:...]] 标记升级后的跳转链接（只在只读渲染激活）
  InternalLinkMark,
  Markdown.configure({
    html: false, // XSS 防护：不解析源文本里的原始 HTML
    tightLists: true,
    linkify: false,
    breaks: true, // 单换行即 <br>，贴近 textarea 体验
    transformPastedText: true, // 粘贴 markdown 文本时自动格式化
    transformCopiedText: true,
  }),
]
