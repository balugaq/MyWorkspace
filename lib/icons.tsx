import {
  BookOpen,
  GraduationCap,
  Briefcase,
  Home,
  Workflow,
  SquarePen,
  CalendarDays,
  type LucideIcon,
} from "lucide-react"

const MAP: Record<string, LucideIcon> = {
  BookOpen,
  GraduationCap,
  Briefcase,
  Home,
  Workflow,
  SquarePen,
  CalendarDays,
}

export function getIcon(name: string): LucideIcon {
  return MAP[name] ?? SquarePen
}
