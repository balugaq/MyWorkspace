// 数据导入导出领域切片（TODO 85 / 41）：exportData / importData / mergeData
import type { StoreApi } from "zustand"
import type { WorkspaceState } from "../../store"
import type {
  Conversation,
  CalendarData,
  Contribution,
  NotificationItem,
  NotificationLogEntry,
  IssueQueueItem,
  Person,
  FestivalDef,
  Settings,
  BackupSectionId,
  Category,
  RelationFamily,
} from "../../types"
import { mergeCalendarDay } from "../shared"
import {
  migrateRelationState,
  migratePersona,
  normalizeFamily,
} from "../../persist-merge"
import { normalizeDayStartOffset } from "../../contributions"
import {
  DEFAULT_SETTINGS,
  normalizeNotificationRepos,
  normalizeNotificationChannels,
  normalizeQqRelayUrl,
  normalizeBirthdayBannerDays,
} from "../../types"

type SetState = StoreApi<WorkspaceState>["setState"]
type GetState = StoreApi<WorkspaceState>["getState"]

export type BackupSlice = Pick<
  WorkspaceState,
  "exportData" | "importData" | "mergeData"
>

export const createBackupSlice = (set: SetState, get: GetState): BackupSlice => ({
  // 分区导出（TODO 41）：sections 指明各分区是否携带；缺省（未传）= 除 vault / contacts 外全部分区
  // （兼容旧调用方如 ConfigEditorDialog 的全量快照语义）。settings 始终携带（应用配置，恢复必需）。
  exportData: (sections) => {
    const s = get()
    const want = (id: BackupSectionId) =>
      sections ? sections[id] === true : id !== "vault" && id !== "contacts"
    try {
      const payload: Record<string, unknown> = {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: s.settings,
      }
      if (want("notes")) {
        payload.categories = s.categories
        // TODO 54：关系族随「随笔数据」分区携带（含族内节点/连线/视口）
        payload.relationFamilies = s.relationFamilies
      }
      if (want("calendar")) {
        payload.calendar = s.calendar
        // TODO 48：自定义节日归日历分区（它是日历数据，主人定的口径）
        payload.customFestivals = s.customFestivals
      }
      if (want("ai")) {
        payload.conversations = s.conversations
        payload.activeConversationId = s.activeConversationId
      }
      if (want("contributions")) payload.contributions = s.contributions
      if (want("notifications")) {
        payload.notifications = s.notifications
        payload.notificationLogs = s.notificationLogs
        payload.notificationWatermark = s.notificationWatermark
      }
      if (want("githubQueue")) payload.issueQueue = s.issueQueue
      // TODO 48：联系人已持久化，contacts 分区解锁（敏感分区，默认不勾选）
      if (want("contacts")) payload.contacts = s.contacts
      return JSON.stringify(payload, null, 2)
    } catch {
      return null
    }
  },

  importData: (json) => {
    try {
      const data = JSON.parse(json)
      if (!data || typeof data !== "object") return false
      // 分区备份兼容（TODO 41）：按「字段是否出现」识别分区；至少含一个数据分区才合法。
      // 替换语义 = 只替换备份携带的分区，未携带的分区保留当前数据（向后兼容旧版全量备份）。
      const hasNotes = Array.isArray(data.categories)
      const hasFamilies =
        !!data.relationFamilies &&
        typeof data.relationFamilies === "object" &&
        !Array.isArray(data.relationFamilies)
      const hasCalendar = typeof data.calendar === "object" && data.calendar !== null
      const hasAi = Array.isArray(data.conversations)
      const hasContribs = Array.isArray(data.contributions)
      const hasNotifications = Array.isArray(data.notifications)
      const hasQueue = Array.isArray(data.issueQueue)
      const hasContacts = Array.isArray(data.contacts)
      const hasFestivals = Array.isArray(data.customFestivals)
      if (
        !hasNotes &&
        !hasFamilies &&
        !hasCalendar &&
        !hasAi &&
        !hasContribs &&
        !hasNotifications &&
        !hasQueue &&
        !hasContacts &&
        !hasFestivals
      )
        return false
      const cur = get()
      // 关系族（TODO 54）：随 notes 分区迁移（旧备份 categories[].relation 一并转为默认族）
      const migratedNotes = hasNotes
        ? migrateRelationState(data.categories, data.relationFamilies, undefined)
        : null
      const convs = hasAi ? (data.conversations as Conversation[]) : null
      const bContribs = hasContribs ? (data.contributions as Contribution[]) : null
      // settings：备份携带才覆盖（分区导出始终携带 settings；防御旧备份缺失时保留现值）
      const bSettings =
        data.settings && typeof data.settings === "object" ? (data.settings as object) : null
      const persona = migratePersona((bSettings ?? {}) as Record<string, unknown>)
      set({
        ...(migratedNotes
          ? {
              categories: migratedNotes.categories,
              relationFamilies: migratedNotes.relationFamilies,
              activeCategoryId: migratedNotes.categories[0]?.id ?? null,
              activeItemId: null,
            }
          : {}),
        ...(hasCalendar ? { calendar: data.calendar as CalendarData } : {}),
        settings: bSettings
          ? ({
              ...DEFAULT_SETTINGS,
              ...bSettings,
              aiPersonas: persona.aiPersonas,
              aiActivePersonaId: persona.aiActivePersonaId,
              // 兜底：备份里的 dayStartOffset 缺失 / 非法 → "04:00"
              dayStartOffset: normalizeDayStartOffset(
                (bSettings as Record<string, unknown>).dayStartOffset
              ),
              // 兜底：旧备份 string[] 或坏值 → NotificationRepoConfig[]
              notificationRepos: normalizeNotificationRepos(
                (bSettings as Record<string, unknown>).notificationRepos
              ),
              // 兜底：备份里的渠道配置缺失 / 坏值 → 默认（builtin 开、qq 关）
              notificationChannels: normalizeNotificationChannels(
                (bSettings as Record<string, unknown>).notificationChannels
              ),
              // 兜底：备份里的 QQ 中转地址缺失 / 非法 → 默认地址
              qqRelayUrl: normalizeQqRelayUrl(
                (bSettings as Record<string, unknown>).qqRelayUrl
              ),
              // 兜底（TODO 61）：备份里的横幅提前天数缺失 / 非法 / 越界 → 默认 7
              birthdayBannerDays: normalizeBirthdayBannerDays(
                (bSettings as Record<string, unknown>).birthdayBannerDays
              ),
              // 兜底（TODO 40）：界面语言非法 → 默认中文
              uiLanguage:
                (bSettings as Record<string, unknown>).uiLanguage === "en" ? "en" : "zh",
            } as Settings)
          : cur.settings,
        conversations: convs ?? cur.conversations,
        activeConversationId: convs
          ? (convs.find((c) => c.id === data.activeConversationId)
              ? data.activeConversationId
              : convs[0]?.id ?? null)
          : cur.activeConversationId,
        contributions: bContribs ?? cur.contributions,
        // 通知分区：列表整体替换；日志 / 水位出现才覆盖
        ...(hasNotifications
          ? {
              notifications: data.notifications as NotificationItem[],
              ...(Array.isArray(data.notificationLogs)
                ? { notificationLogs: data.notificationLogs as NotificationLogEntry[] }
                : {}),
              ...(data.notificationWatermark === null ||
              typeof data.notificationWatermark === "number"
                ? { notificationWatermark: data.notificationWatermark as number | null }
                : {}),
            }
          : {}),
        ...(hasQueue ? { issueQueue: data.issueQueue as IssueQueueItem[] } : {}),
        ...(hasContacts ? { contacts: data.contacts as Person[] } : {}),
        // 自定义节日（TODO 48，随日历分区携带）：整体替换
        ...(hasFestivals ? { customFestivals: data.customFestivals as FestivalDef[] } : {}),
        // 有随笔分区才跳工作区（与旧版全量导入行为一致）；部分备份停留在当前视图
        ...(hasNotes ? { view: "workspace" as const } : {}),
      })
      return true
    } catch {
      return false
    }
  },

  // 合并导入：分类按 id、日历按日期、账本 / 对话 / 通知 / 队列按 id 合并；
  // 仅处理备份携带的分区（TODO 41），未携带的分区完全不碰；settings 与视图状态保留当前值。
  mergeData: (json) => {
    try {
      const data = JSON.parse(json)
      if (!data || typeof data !== "object") return false
      const hasNotes = Array.isArray(data.categories)
      const hasFamilies =
        !!data.relationFamilies &&
        typeof data.relationFamilies === "object" &&
        !Array.isArray(data.relationFamilies)
      const hasCalendar = typeof data.calendar === "object" && data.calendar !== null
      const hasAi = Array.isArray(data.conversations)
      const hasContribs = Array.isArray(data.contributions)
      const hasNotifications = Array.isArray(data.notifications)
      const hasQueue = Array.isArray(data.issueQueue)
      const hasContacts = Array.isArray(data.contacts)
      const hasFestivals = Array.isArray(data.customFestivals)
      if (
        !hasNotes &&
        !hasFamilies &&
        !hasCalendar &&
        !hasAi &&
        !hasContribs &&
        !hasNotifications &&
        !hasQueue &&
        !hasContacts &&
        !hasFestivals
      )
        return false
      const cur = get()
      const patch: Record<string, unknown> = {}
      // 分类：按 id 合并（备份覆盖同 id，新 id 追加）；关系族一并按 id 合并后统一迁移
      // （旧备份 categories[].relation → 默认族；TODO 54）
      if (hasNotes) {
        const catMap = new Map<string, Category>()
        for (const c of cur.categories) catMap.set(c.id, c)
        for (const c of data.categories as Category[]) catMap.set(c.id, c)
        const famMap: Record<string, RelationFamily> = { ...cur.relationFamilies }
        if (hasFamilies) {
          for (const val of Object.values(
            data.relationFamilies as Record<string, unknown>
          )) {
            const fam = normalizeFamily(val, "")
            if (fam) famMap[fam.id] = fam
          }
        }
        const migrated = migrateRelationState([...catMap.values()], famMap, undefined)
        patch.categories = migrated.categories
        patch.relationFamilies = migrated.relationFamilies
      }
      if (hasCalendar) {
        const calendar: CalendarData = { ...cur.calendar }
        const bCal = data.calendar as CalendarData
        for (const date of Object.keys(bCal)) {
          const bDay = bCal[date]
          const cDay = calendar[date]
          calendar[date] = cDay ? mergeCalendarDay(cDay, bDay) : bDay
        }
        patch.calendar = calendar
      }
      if (hasContribs) {
        const contribMap = new Map<string, Contribution>()
        for (const x of cur.contributions) contribMap.set(x.id, x)
        for (const x of data.contributions as Contribution[]) contribMap.set(x.id, x)
        patch.contributions = [...contribMap.values()]
      }
      // AI 对话：按 id 合并；合并模式不改动当前选中的会话（若仍存在于结果中）。
      if (hasAi) {
        const convMap = new Map<string, Conversation>()
        for (const c of cur.conversations) convMap.set(c.id, c)
        for (const c of data.conversations as Conversation[]) convMap.set(c.id, c)
        const conversations = [...convMap.values()]
        patch.conversations = conversations
        patch.activeConversationId =
          cur.activeConversationId && convMap.has(cur.activeConversationId)
            ? cur.activeConversationId
            : (conversations[0]?.id ?? null)
      }
      // 通知分区：通知 / 日志按 id 合并；水位取两边的较大值（避免回退导致重复扫描）
      if (hasNotifications) {
        const nMap = new Map<string, NotificationItem>()
        for (const n of cur.notifications) nMap.set(n.id, n)
        for (const n of data.notifications as NotificationItem[]) nMap.set(n.id, n)
        patch.notifications = [...nMap.values()]
        if (Array.isArray(data.notificationLogs)) {
          const lMap = new Map<string, NotificationLogEntry>()
          for (const e of cur.notificationLogs) lMap.set(e.id, e)
          for (const e of data.notificationLogs as NotificationLogEntry[]) lMap.set(e.id, e)
          patch.notificationLogs = [...lMap.values()]
        }
        if (
          data.notificationWatermark === null ||
          typeof data.notificationWatermark === "number"
        ) {
          const bWm = data.notificationWatermark as number | null
          patch.notificationWatermark =
            bWm === null
              ? cur.notificationWatermark
              : Math.max(cur.notificationWatermark ?? 0, bWm)
        }
      }
      if (hasQueue) {
        const qMap = new Map<string, IssueQueueItem>()
        for (const it of cur.issueQueue) qMap.set(it.id, it)
        for (const it of data.issueQueue as IssueQueueItem[]) qMap.set(it.id, it)
        patch.issueQueue = [...qMap.values()]
      }
      if (hasContacts) {
        const cMap = new Map<string, Person>()
        for (const p of cur.contacts) cMap.set(p.id, p)
        for (const p of data.contacts as Person[]) cMap.set(p.id, p)
        patch.contacts = [...cMap.values()]
      }
      // 自定义节日（TODO 48）：按 name 合并（同名以备份为准；节日定义无 id）
      if (hasFestivals) {
        const fMap = new Map<string, FestivalDef>()
        for (const f of cur.customFestivals) fMap.set(f.name, f)
        for (const f of data.customFestivals as FestivalDef[]) fMap.set(f.name, f)
        patch.customFestivals = [...fMap.values()]
      }
      set(patch)
      return true
    } catch {
      return false
    }
  },
})
