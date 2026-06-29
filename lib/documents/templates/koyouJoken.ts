/**
 * 雇用条件書（参考様式第1-6号）フィールド定義
 * generator.ts がここを参照して文書を組み立てる
 */

export const KOYOU_JOKEN_META = {
  id: 'koyou_joken',
  formNumber: '参考様式第１－６号',
  title: '雇用条件書',
  outputFormat: 'docx' as const,
  /** 対応する在留資格 */
  applicableStatuses: ['特定技能1号', '特定技能2号', '技術・人文知識・国際業務', '高度専門職1号', '高度専門職2号'],
}

/** DB から取得したデータを generator に渡す統一型 */
export type KoyouJokenData = {
  worker: {
    id: string
    name_kanji: string
    name_romaji: string
    nationality: string
    date_of_birth: string
    residence_card_number: string
    org_id: string
    residence_statuses: {
      status_type: string
      expiry_date: string
      issued_date: string
      card_number: string
      is_active: boolean
    }[]
  }
  org: {
    name: string
    address: string | null
    phone: string | null
    representative_title: string | null
    representative_name: string | null
    tokutei_skills_reg_number: string | null
  } | null
  conditions: {
    workplace_type: string | null
    workplace_name: string | null
    workplace_address: string | null
    workplace_phone: string | null
    industry_field: string | null
    job_category: string | null
    // Ⅳ 労働時間等
    work_start_time: string | null
    work_end_time: string | null
    daily_scheduled_hours: number | null
    daily_scheduled_minutes: number | null
    break_minutes: number | null
    // 変形労働時間制
    henkou_roudou_jikan: boolean | null
    henkou_roudou_jikan_unit: string | null
    // 交代制
    kotai_sei: boolean | null
    shift1_start_time: string | null
    shift1_end_time: string | null
    shift1_days: string | null
    shift1_daily_hours: number | null
    shift1_daily_minutes: number | null
    shift2_start_time: string | null
    shift2_end_time: string | null
    shift2_days: string | null
    shift2_daily_hours: number | null
    shift2_daily_minutes: number | null
    shift3_start_time: string | null
    shift3_end_time: string | null
    shift3_days: string | null
    shift3_daily_hours: number | null
    shift3_daily_minutes: number | null
    weekly_scheduled_hours: number | null
    weekly_scheduled_minutes: number | null
    monthly_scheduled_hours: number | null
    annual_scheduled_hours: number | null
    weekly_scheduled_days: number | null
    monthly_scheduled_days: number | null
    annual_scheduled_days: number | null
    overtime_exists: boolean | null
    regular_holiday_days: string | null
    annual_holiday_days: number | null
    irregular_holiday_info: string | null
    annual_paid_leave_days: number | null
    other_paid_leave: string | null
    other_unpaid_leave: string | null
    // Ⅶ 賃金
    wage_type: string | null
    basic_wage: number | null
    allowance_1_name: string | null
    allowance_1_amount: number | null
    allowance_1_calc_method: string | null
    allowance_2_name: string | null
    allowance_2_amount: number | null
    allowance_2_calc_method: string | null
    allowance_3_name: string | null
    allowance_3_amount: number | null
    allowance_3_calc_method: string | null
    allowance_4_name: string | null
    allowance_4_amount: number | null
    allowance_4_calc_method: string | null
    overtime_rate_under60: number | null
    overtime_rate_over60: number | null
    overtime_rate_prescribed: number | null
    holiday_rate_statutory: number | null
    holiday_rate_non_statutory: number | null
    late_night_rate: number | null
    wage_cutoff_day: number | null
    wage_payment_day: number | null
    wage_payment_method: string | null
    wage_deduction_agreement: boolean | null
    salary_increase_exists: boolean | null
    salary_increase_details: string | null
    bonus_exists: boolean | null
    bonus_details: string | null
    severance_pay_exists: boolean | null
    severance_pay_details: string | null
    work_injury_allowance_exists: boolean | null
    work_injury_allowance_rate: string | null
    // 別紙：控除項目
    deduction_tax: number | null
    deduction_social_insurance: number | null
    deduction_employment_insurance: number | null
    deduction_food: number | null
    deduction_housing: number | null
    deduction_utilities: number | null
    deduction_other_1_name: string | null
    deduction_other_1_amount: number | null
    deduction_other_2_name: string | null
    deduction_other_2_amount: number | null
    // Ⅸ その他
    insurance_kosei_nenkin: boolean | null
    insurance_kenko: boolean | null
    insurance_koyo: boolean | null
    insurance_rousai: boolean | null
    insurance_kokumin_nenkin: boolean | null
    insurance_kokumin_kenko: boolean | null
    health_checkup_on_hire: string | null
    health_checkup_first: string | null
    health_checkup_interval: string | null
  } | null
  contract: {
    contract_start_date: string | null
    contract_end_date: string | null
    planned_entry_date: string | null
    contract_renewable: boolean | null
  } | null
}
