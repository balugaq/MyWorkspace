#!/usr/bin/env python3
"""检查 ts/tsx 源码中不在注释内的中文，用于发现遗漏的翻译（TODO 40 配套工具）。

用法：
  python scripts/check-untranslated.py            # 扫描并按文件分组输出
  python scripts/check-untranslated.py --quiet    # 只输出统计与异常文件

规则：
  - 剥离 // 行注释、/* */ 块注释、{/* */} JSX 注释（状态机处理 ' " ` 字符串，
    模板串内 ${} 表达式递归回代码态，避免 http:// 之类误判）。
  - zh.ts（源字典）排除；en.ts 扫描（其值应为英文，中文命中即异常）。
  - 字符串/JSX 文本里的中文会命中——它们是文案遗漏的主要来源；
    数据默认值、AI prompt 等有意保留的中文见 KNOWN_OK_FILES / WHITELIST。
"""
import sys
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_PARTS = {"node_modules", "out", ".next", ".workbuddy", "scripts"}
EXCLUDE_FILES = {"zh.ts"}  # 源字典本身
TARGET_EXT = {".ts", ".tsx"}

# 已知有意保留的中文（数据默认值 / prompt / 特例），命中这些文件的报告仅供参考
KNOWN_OK_FILES = {
    "lib/store.ts",                      # 存档数据默认值：我的分类 / 待办事项 / 新对话 / 默认人设
    "lib/notifications/news-sender.ts",  # AI prompt 与平台数据默认值（field 默认「国内」）
    "lib/types.ts",                      # 数据层标注（GH_EVENT_LABEL 等，无 UI 消费）
    "lib/ai/request-queue.ts",           # SYSTEM_BASE 系统提示词（AI prompt，有意中文）
    "lib/i18n/locales/en.ts",            # langOptions.zh: "中文" 为语言名特例
}

# 有意保留的中文命中（zh 竖排日期卡的「月」字等）
WHITELIST = {
    ("components/profile-workspace.tsx", "月"),
}

STR_CH = {"'": "'", '"': '"', "`": "`"}


def strip_comments(text: str) -> str:
    """状态机剥离注释：返回等长文本，注释字符替换为空格（保留行号）。"""
    out = []
    i = 0
    n = len(text)
    mode = "code"  # code | line | block | ' | " | `
    tmpl_depth = []  # 模板串内 ${ 时的模式栈
    while i < n:
        c = text[i]
        nxt = text[i + 1] if i + 1 < n else ""
        if mode == "code":
            if c == "/" and nxt == "/":
                mode = "line"
                out.append("  ")
                i += 2
                continue
            if c == "/" and nxt == "*":
                mode = "block"
                out.append("  ")
                i += 2
                continue
            if c in STR_CH:
                mode = STR_CH[c]
                out.append(c)
                i += 1
                continue
            out.append(c)
            i += 1
        elif mode == "line":
            if c == "\n":
                mode = "code"
                out.append(c)
            else:
                out.append(" ")
            i += 1
        elif mode == "block":
            if c == "*" and nxt == "/":
                mode = "code"
                out.append("  ")
                i += 2
                continue
            out.append(c if c == "\n" else " ")
            i += 1
        else:  # 字符串态：mode 即引号字符
            if c == "\\":
                out.append("  ")
                i += 2
                continue
            if mode == "`" and c == "$" and nxt == "{":
                tmpl_depth.append("`")
                mode = "code"
                out.append("  ")
                i += 2
                continue
            if c == mode:
                mode = "code"
                out.append(c)
                i += 1
                continue
            out.append(c if c == "\n" else " ")
            i += 1
        # code 态里模板串表达式结束回字符串
        if mode == "code" and tmpl_depth and c == "}":
            mode = tmpl_depth.pop()
    return "".join(out)


ZH_RE = re.compile(r"[\u4e00-\u9fff]+")


def main() -> None:
    quiet = "--quiet" in sys.argv
    files = sorted(
        f for f in ROOT.rglob("*")
        if f.suffix in TARGET_EXT
        and not (set(f.parts) & SKIP_PARTS)
        and f.name not in EXCLUDE_FILES
    )
    total = 0
    by_file: dict[str, list[str]] = {}
    for f in files:
        rel = f.relative_to(ROOT).as_posix()
        text = f.read_text(encoding="utf-8", errors="replace")
        stripped = strip_comments(text)
        hits: list[str] = []
        for lineno, line in enumerate(stripped.split("\n"), 1):
            for m in ZH_RE.finditer(line):
                if (rel, m.group(0)) in WHITELIST:
                    continue
                ctx_line = text.split("\n")[lineno - 1].strip()
                hits.append(f"  {lineno}: …{m.group(0)}…  |  {ctx_line[:90]}")
        if hits:
            by_file[rel] = hits
            total += len(hits)

    for rel, hits in by_file.items():
        tag = " [已知例外，人工判断]" if rel in KNOWN_OK_FILES else ""
        if quiet and tag:
            continue
        print(f"\n=== {rel} ({len(hits)} 处){tag}")
        if not quiet:
            for h in hits:
                print(h)

    print(f"\n总计：{total} 处中文（涉及 {len(by_file)} 个文件）；其中已知例外文件见标注。")


if __name__ == "__main__":
    main()
