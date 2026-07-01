/**
 * 随時届出（雇用条件変更）参考様式第3-1-1号 フィールド定義
 */

export const TODOKE_JOKEN_HENKOU_META = {
  id: 'todoke_joken_henkou',
  formNumber: '参考様式第３－１－１号',
  title: '特定技能雇用契約の変更に係る届出書',
  outputFormat: 'excel' as const,
  applicableStatuses: ['特定技能1号'],
}

/** 変更があった雇用条件書セクション（Ⅰ〜Ⅸ） */
export type ChangedSection = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI' | 'VII' | 'VIII' | 'IX'

export type TodokeJokenHenkouData = {
  worker: {
    name_romaji: string
    date_of_birth: string | null  // YYYY-MM-DD
    nationality: string | null
    residence_card_number: string | null
  }
  conditions: {
    industry_field: string | null
    job_category: string | null
  } | null
  change: {
    change_date: string           // YYYY-MM-DD（変更が適用された日）
    changed_sections: ChangedSection[]
  }
  org: {
    name: string
    address: string | null
    phone: string | null
    representative_name: string | null
  } | null
  created_date: string            // YYYY-MM-DD（作成年月日）
}
