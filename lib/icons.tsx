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

export const ICONS: Record<string, LucideIcon> = {
  BookOpen,
  GraduationCap,
  Briefcase,
  Home,
  Workflow,
  SquarePen,
  CalendarDays,
}

export function getIcon(name: string): LucideIcon {
  return ICONS[name] ?? SquarePen
}
