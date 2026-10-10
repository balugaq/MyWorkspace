import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight"

/** lucide 同款 copy / check 内联 SVG（NodeView 是原生 DOM，不走 React 组件） */
const ICON_COPY =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>'
const ICON_CHECK =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'

/** 复制纯文本：优先 Clipboard API，非安全上下文（http 等）降级 execCommand */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement("textarea")
      ta.value = text
      ta.style.position = "fixed"
      ta.style.opacity = "0"
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand("copy")
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

/**
 * 代码块增强（TODO 38）：在 CodeBlockLowlight 之上加行号 gutter 与语言角标、复制按钮（TODO 72）。
 *
 * - 语法高亮仍由 CodeBlockLowlight 内置的 ProseMirror decoration 插件负责（与 DOM 结构无关），
 *   NodeView 只额外渲染 gutter / 角标 / 复制按钮，正文内容仍走 contentDOM（code），
 *   编辑与 markdown 序列化不受影响。
 * - 行数 = textContent 按 \n 切分（源码行与视觉行一一对应）；
 *   长行不软折行由 CSS 保证（globals.css 对 .rich-text-content pre 显式恢复 overflow-wrap:normal，
 *   压掉 .rich-text-content 上 [overflow-wrap:anywhere] 的继承——否则长行折行会导致行号错位，TODO 72）。
 * - 复制按钮点击时复制源码纯文本（textContent），成功后图标短暂切换为 ✓。
 * - 样式见 globals.css 的 .code-block-wrap / .code-block-gutter / .code-block-meta / .code-block-lang / .code-block-copy。
 */
export const CodeBlockEnhanced = CodeBlockLowlight.extend({
  addNodeView() {
    return ({ node }) => {
      const wrap = document.createElement("div")
      wrap.className = "code-block-wrap"

      const gutter = document.createElement("div")
      gutter.className = "code-block-gutter"
      gutter.setAttribute("aria-hidden", "true")

      const pre = document.createElement("pre")
      const code = document.createElement("code")
      pre.appendChild(code)

      // 右上角 meta 容器：语言角标 + 复制按钮
      const meta = document.createElement("div")
      meta.className = "code-block-meta"
      const lang = document.createElement("span")
      lang.className = "code-block-lang"
      const copyBtn = document.createElement("button")
      copyBtn.type = "button"
      copyBtn.className = "code-block-copy"
      copyBtn.title = "复制代码"
      copyBtn.setAttribute("aria-label", "复制代码")
      copyBtn.innerHTML = ICON_COPY
      meta.appendChild(lang)
      meta.appendChild(copyBtn)

      wrap.appendChild(gutter)
      wrap.appendChild(pre)
      wrap.appendChild(meta)

      let currentNode = node

      const syncMeta = (n: typeof node) => {
        const language = String(n.attrs.language ?? "")
        pre.dataset.language = language
        lang.textContent = language
        lang.style.display = language ? "" : "none"
        const count = n.textContent.split("\n").length
        if (gutter.childElementCount !== count) {
          const frag = document.createDocumentFragment()
          for (let i = 1; i <= count; i++) {
            const num = document.createElement("div")
            num.textContent = String(i)
            frag.appendChild(num)
          }
          gutter.replaceChildren(frag)
        }
      }
      syncMeta(node)

      // 复制：mousedown 阻止夺焦（编辑态不丢选区）；成功后图标短暂切换 ✓
      copyBtn.addEventListener("mousedown", (e) => e.preventDefault())
      copyBtn.addEventListener("click", () => {
        void copyText(currentNode.textContent).then((ok) => {
          if (!ok) return
          copyBtn.innerHTML = ICON_CHECK
          copyBtn.classList.add("copied")
          copyBtn.title = "已复制"
          window.setTimeout(() => {
            copyBtn.innerHTML = ICON_COPY
            copyBtn.classList.remove("copied")
            copyBtn.title = "复制代码"
          }, 1200)
        })
      })

      // 常规输入由 PM 回调 update 同步；这里用 MutationObserver 兜底，
      // 覆盖撤销/重做等 update 时机不直观的路径（仅读计数，不碰 contentDOM，无回环风险）。
      const observer = new MutationObserver(() => syncMeta(currentNode))
      observer.observe(code, { childList: true, characterData: true, subtree: true })

      return {
        dom: wrap,
        contentDOM: code,
        update(updatedNode) {
          if (updatedNode.type.name !== "codeBlock") return false
          currentNode = updatedNode
          syncMeta(updatedNode)
          return true
        },
        // 自维护的 gutter / meta 变更不交给 PM 处理；contentDOM 内的编辑变更照常同步
        ignoreMutation(mutation) {
          return !code.contains(mutation.target)
        },
        destroy() {
          observer.disconnect()
        },
      }
    }
  },
})
