import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight"

/**
 * 代码块增强（TODO 38）：在 CodeBlockLowlight 之上加行号 gutter 与语言角标。
 *
 * - 语法高亮仍由 CodeBlockLowlight 内置的 ProseMirror decoration 插件负责（与 DOM 结构无关），
 *   NodeView 只额外渲染 gutter / 角标，正文内容仍走 contentDOM（code），编辑与 markdown 序列化不受影响。
 * - 行数 = textContent 按 \n 切分（pre 不折行，源码行与视觉行一一对应）。
 * - 样式见 globals.css 的 .code-block-wrap / .code-block-gutter / .code-block-lang。
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

      const lang = document.createElement("span")
      lang.className = "code-block-lang"

      wrap.appendChild(gutter)
      wrap.appendChild(pre)
      wrap.appendChild(lang)

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
        // 自维护的 gutter / 角标变更不交给 PM 处理；contentDOM 内的编辑变更照常同步
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
