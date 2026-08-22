"use client"

// 日历标记脚本管理弹窗（已弃用 / 注释停用）。
//
// 原实现：列表展示/启停/新建/编辑/删除日历标记脚本。因日历标记脚本整体停用而注释，
// 保留文件与一个空占位导出，避免 page.tsx 的 import 报错（该调用点也已注释）。
//
// import { useState } from "react"
// import { Plus, Pencil, Trash2, Play } from "lucide-react"
// import { toast } from "sonner"
// import { useWorkspace } from "@/lib/store"
// import type { CalendarScript } from "@/lib/types"
// import {
//   Dialog,
//   DialogContent,
//   DialogDescription,
//   DialogHeader,
//   DialogTitle,
// } from "@/components/ui/dialog"
// import { Button } from "@/components/ui/button"
// import { Switch } from "@/components/ui/switch"
// import { Input } from "@/components/ui/input"
// import { Label } from "@/components/ui/label"
// import { ScrollArea } from "@/components/ui/scroll-area"

// const uid = () => Math.random().toString(36).slice(2, 10)

// const SAMPLE_CODE = `// 示例：把 yaml 里配置的纪念日标记到对应日期
// const config = useLib('yaml')(\`
// holidays:
//   - date: 01-01
//     name: 元旦
//   - date: 10-01
//     name: 国庆
// \`);
//
// renderDate((ev) => {
//   const md = ev.date.slice(5); // "MM-DD"
//   const hit = config.holidays.find((h) => h.date === md);
//   if (hit) {
//     ev.api.addMarker('holiday', hit.name);
//   }
// });
// `

/** 日历标记脚本管理弹窗（已弃用停用：仅保留占位，原实现见上方注释） */
export function CalendarScriptsDialog() {
  return null
}

// function CalendarScriptsDialog({
//   open,
//   onOpenChange,
// }: {
//   open: boolean
//   onOpenChange: (v: boolean) => void
// }) {
//   const scripts = useWorkspace((s) => s.calendarScripts)
//   const upsert = useWorkspace((s) => s.upsertCalendarScript)
//   const remove = useWorkspace((s) => s.removeCalendarScript)
//   const toggle = useWorkspace((s) => s.toggleCalendarScript)
//
//   // 编辑态
//   const [editingId, setEditingId] = useState<string | null>(null)
//   const editing: CalendarScript | null = scripts.find((s) => s.id === editingId) ?? null
//
//   function create() {
//     const id = uid()
//     upsert({ id, name: "新日历脚本", enabled: true, code: SAMPLE_CODE })
//     setEditingId(id)
//   }
//
//   return (
//     <Dialog open={open} onOpenChange={onOpenChange}>
//       <DialogContent className="sm:max-w-2xl">
//         <DialogHeader>
//           <DialogTitle>日历标记脚本</DialogTitle>
//           <DialogDescription>
//             编写 JS 脚本订阅 RenderDateEvent，为单个日期块绘制标记。脚本可经
//             useLib / lib 使用 JSON、YAML、XML 解析。信任的本地脚本。
//           </DialogDescription>
//         </DialogHeader>
//
//         {editing ? (
//           <ScriptEditor
//             script={editing}
//             onClose={() => setEditingId(null)}
//             onSave={(patch) => {
//               upsert({ ...editing, ...patch })
//               toast.success("已保存脚本")
//             }}
//           />
//         ) : (
//           <div className="flex flex-col gap-2">
//             <div className="flex items-center justify-between">
//               <span className="text-xs text-muted-foreground">
//                 共 {scripts.length} 个脚本
//               </span>
//               <Button size="sm" onClick={create}>
//                 <Plus className="size-3.5" />
//                 新建脚本
//               </Button>
//             </div>
//             {scripts.length === 0 && (
//               <p className="py-10 text-center text-sm text-muted-foreground">
//                 还没有脚本，点击“新建脚本”创建一个示例。
//               </p>
//             )}
//             <ScrollArea className="max-h-[50vh]">
//               <ul className="flex flex-col gap-2">
//                 {scripts.map((s) => (
//                   <li
//                     key={s.id}
//                     className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5"
//                   >
//                     <div className="min-w-0 flex-1">
//                       <p className="truncate text-sm font-medium">{s.name}</p>
//                       <p className="truncate text-xs text-muted-foreground">
//                         {s.enabled ? "已启用" : "已停用"}
//                       </p>
//                     </div>
//                     <Switch
//                       checked={s.enabled}
//                       onCheckedChange={(v) => {
//                         toggle(s.id, v)
//                         toast.success(v ? "脚本已启用" : "脚本已停用")
//                       }}
//                     />
//                     <Button
//                       variant="ghost"
//                       size="icon"
//                       className="size-8"
//                       onClick={() => setEditingId(s.id)}
//                     >
//                       <Pencil className="size-3.5" />
//                       <span className="sr-only">编辑</span>
//                     </Button>
//                     <Button
//                       variant="ghost"
//                       size="icon"
//                       className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
//                       onClick={() => {
//                         remove(s.id)
//                         toast.success("已删除脚本")
//                       }}
//                     >
//                       <Trash2 className="size-3.5" />
//                       <span className="sr-only">删除</span>
//                     </Button>
//                   </li>
//                 ))}
//               </ul>
//             </ScrollArea>
//           </div>
//         )}
//       </DialogContent>
//     </Dialog>
//   )
// }

// function ScriptEditor({
//   script,
//   onClose,
//   onSave,
// }: {
//   script: CalendarScript
//   onClose: () => void
//   onSave: (patch: Partial<CalendarScript>) => void
// }) {
//   const [name, setName] = useState(script.name)
//   const [code, setCode] = useState(script.code)
//
//   return (
//     <div className="flex flex-col gap-3">
//       <div className="flex flex-col gap-1.5">
//         <Label className="text-xs text-muted-foreground">脚本名称</Label>
//         <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="给脚本起个名字" />
//       </div>
//       <div className="flex flex-col gap-1.5">
//         <Label className="text-xs text-muted-foreground">脚本代码（JS，可含中文注释）</Label>
//         <textarea
//           value={code}
//           onChange={(e) => setCode(e.target.value)}
//           spellCheck={false}
//           className="min-h-64 w-full resize-y rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
//         />
//       </div>
//       <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
//         <Play className="mr-1 inline size-3" />
//         可用 API：<code>renderDate((ev) ={">"} ...)</code>——ev 含{" "}
//         <code>displayType / date / element / api</code>（displayType 为 month|week|day）；解析库{" "}
//         <code>{"useLib('yaml') / useLib('xml') / useLib('json')"}</code> 或{" "}
//         <code>{"lib.yaml(...)"}</code>。保存后刷新日历即可看到标记。
//       </p>
//       <div className="flex justify-end gap-2">
//         <Button variant="outline" onClick={onClose}>
//           返回
//         </Button>
//         <Button
//           onClick={() => {
//             onSave({ name: name.trim() || script.name, code })
//             onClose()
//           }}
//         >
//           保存
//         </Button>
//       </div>
//     </div>
//   )
// }
