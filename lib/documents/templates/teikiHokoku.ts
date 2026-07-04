/**
 * 定期届出（参考様式第3-6号）
 * 受入れ・活動・支援実施状況に係る届出書
 */

export const TEIKI_HOKOKU_META = {
  id: 'teiki_hokoku',
  formNumber: '参考様式第３－６号',
  title: '受入れ・活動・支援実施状況に係る届出書',
  outputFormat: 'excel' as const,
}

/** 在留資格別の労働統計（月平均） */
export type LaborStats = {
  count: number                      // 届出対象人数
  avg_working_days: number | null    // (1) 実労働日数（日/月）
  avg_scheduled_hours: number | null // (2) 所定内実労働時間（時間/月）
  avg_overtime_hours: number | null  // (3) 超過実労働時間（時間/月）
  avg_gross_pay: number | null       // (4) きまって支給する現金給与額（円/月）
  avg_overtime_wages: number | null  // (4)-① 超過労働給与額（overtime_pay + late_night_pay）
  avg_commuting: number | null       // (4)-② 通勤手当
  avg_bonus: number | null           // (5) 賞与等特別給与額（年間合計の平均・円）
  avg_tax_insurance: number | null   // (6)-③ 税・社会保険料控除（円/月）
  avg_other_deduction: number | null // (6)-④ その他控除（円/月）
}

export type TeikiHokokuData = {
  org: {
    legal_person_number: string | null
    industry_field: string | null
    name_kana: string | null
    name: string
    postal_code: string | null
    address: string | null
    phone: string | null
    contact_person: string | null
    contact_phone: string | null
  } | null
  fiscal_year: number   // 届出対象年度（N年4月〜N+1年3月のN）
  total: LaborStats     // 合計（1号+2号）
  gou1: LaborStats      // 特定技能1号
  gou2: LaborStats      // 特定技能2号
  created_date: string  // YYYY-MM-DD
}
