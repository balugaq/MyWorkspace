// 日历领域切片（TODO 85）：日期数据（笔记 / 待办 / 事件）及其 actions
import type { StoreApi } from "zustand"
import type { WorkspaceState } from "../../store"
import { emptyDay, uid } from "../shared"

export type CalendarSlice = Pick<
  WorkspaceState,
  | "calendar"
  | "setDayNote"
  | "addCalendarTodo"
  | "toggleCalendarTodo"
  | "removeCalendarTodo"
  | "addCalendarEvent"
  | "removeCalendarEvent"
>

type SetState = StoreApi<WorkspaceState>["setState"]

export const createCalendarSlice = (set: SetState): CalendarSlice => ({
  calendar: {},

  setDayNote: (date, note) =>
    set((s) => ({
      calendar: {
        ...s.calendar,
        [date]: { ...(s.calendar[date] ?? emptyDay()), note },
      },
    })),

  addCalendarTodo: (date, content) =>
    set((s) => {
      const day = s.calendar[date] ?? emptyDay()
      return {
        calendar: {
          ...s.calendar,
          [date]: {
            ...day,
            todos: [...day.todos, { id: uid(), content, done: false }],
          },
        },
      }
    }),

  toggleCalendarTodo: (date, todoId) =>
    set((s) => {
      const day = s.calendar[date] ?? emptyDay()
      return {
        calendar: {
          ...s.calendar,
          [date]: {
            ...day,
            todos: day.todos.map((t) =>
              t.id === todoId ? { ...t, done: !t.done } : t
            ),
          },
        },
      }
    }),

  removeCalendarTodo: (date, todoId) =>
    set((s) => {
      const day = s.calendar[date] ?? emptyDay()
      return {
        calendar: {
          ...s.calendar,
          [date]: {
            ...day,
            todos: day.todos.filter((t) => t.id !== todoId),
          },
        },
      }
    }),

  addCalendarEvent: (date, time, content) =>
    set((s) => {
      const day = s.calendar[date] ?? emptyDay()
      return {
        calendar: {
          ...s.calendar,
          [date]: {
            ...day,
            events: [...day.events, { id: uid(), time, content }],
          },
        },
      }
    }),

  removeCalendarEvent: (date, eventId) =>
    set((s) => {
      const day = s.calendar[date] ?? emptyDay()
      return {
        calendar: {
          ...s.calendar,
          [date]: {
            ...day,
            events: day.events.filter((e) => e.id !== eventId),
          },
        },
      }
    }),
})
