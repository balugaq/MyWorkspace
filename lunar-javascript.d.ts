// TypeScript 声明：lunar-javascript (CommonJS, 无内置类型)
// 仅声明本项目用到的 API；如需更多方法请补充。
declare module "lunar-javascript" {
  export class Solar {
    static fromYmd(year: number, month: number, day: number): Solar
    getYear(): number
    getMonth(): number
    getDay(): number
    toYmd(): string
  }

  export class Lunar {
    static fromDate(date: Date): Lunar
    /** 农历某年某月某日（month 负数/0 表示闰月，见库文档；month 需为正数，0 表示闰上个月） */
    static fromYmd(year: number, month: number, day: number): Lunar
    getYear(): number
    /** 农历月，闰月返回负数（-2 表示闰二月） */
    getMonth(): number
    getDay(): number
    /** 中文月，不含"月"字，如 "五"、"闰六" */
    getMonthInChinese(): string
    /** 中文日，如 "初一"、"十五" */
    getDayInChinese(): string
    getSolar(): Solar
    /** 节气名：该日为二十四节气之一时返回名称（如"立春"），否则返回空串 */
    getJieQi(): string
  }

  /** 中国法定节假日 / 调休（lunar-javascript 内置，覆盖约 2010–2026） */
  export const HolidayUtil: {
    getHoliday(
      year: number,
      month: number,
      day: number
    ): { _p: { day: string; name?: string; work: boolean; target: string } } | null
  }

  export class LunarMonth {
    static fromYm(year: number, month: number): LunarMonth
    /** 该农历月天数，29=小月，30=大月 */
    getDayCount(): number
    /** 是否闰月 */
    getLeap(): boolean
  }

  export class LunarYear {
    static fromYear(year: number): LunarYear
    getMonth(month: number): { getDayCount(): number; getLeap(): number }
  }
}
