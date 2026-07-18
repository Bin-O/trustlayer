/**
 * 業界パッケージ / タスク定義スキーマ（データで表現・業界専用コードを書かない）
 *
 * 段A実装スコープ:
 *   - cadence は one_time のみエンジン化（ensureIndustryTasks）
 *   - countdown は support_tasks 行を作らず residence_expiry から表示のみ
 *   - recurring はPhaseBへ（既存 ensureQuarterlyInterviewTasks は不変更で並存）
 */
import type { IndustryCode } from './codes'

/** タスクの発生リズム */
export type TaskCadence = 'one_time' | 'recurring' | 'countdown'

/** 三段式指引（これは何 / どうやる） */
export type TaskGuide = { what: string; how: string; legalBasis?: string }

/** 期限計算ルール（データで表現） */
export type DueRule =
  // 乗務開始前が原則。offsetDays は「やむを得ない場合」の上限日数 = システム最終期限
  | { from: 'contract_start'; offsetDays: number }
  // countdown 用（在留期限をそのまま起点。support_tasks 行は作らない）
  | { from: 'residence_expiry' }

export type IndustryTaskDef = {
  key: string              // = support_tasks.task_type（例 'transport_shonin_kyoshu'）
  label: string
  cadence: TaskCadence
  dueRule: DueRule
  alertDays?: number[]     // 残日数の色分け閾値（例 [14, 30]）
  validMonths?: number     // 有効期間（初任診断 = 36ヶ月・3年）。段Bで有効期限判定に使用
  guide?: TaskGuide
}

/** 作業 × 必要資格（資格ギャップ判定の「要求ルール」） */
export type WorkQualRule = {
  work: string                 // = worker_work_assignments.work_key
  label: string                // 例 'フォークリフト（1t以上）'
  requiredQualType: string     // = qualifications.type（例 'skill_training'）
  requiredLevel?: string       // = qualifications.level（type だけで一意なら省略）
  legalBasis: string           // 例 '労働安全衛生法61条'
  penalty: string              // 例 '119条（6月以下の懲役 or 50万円以下の罰金）'
}

/**
 * 業界特有の時系列義務(叙事層=支援・義務フローの業界層)。
 * 共通義務は lib/obligations.ts 側。在籍従業員の業界から純導出で表示され、
 * データ格子の判定には関与しない(2026-07-18 裁定)。
 */
export type IndustryObligation = {
  key: string
  stage: import('@/lib/supportServices').LifecycleStage
  /** ◆=全員一律 / ◇=条件触発 を文頭に含む表示文言 */
  text: string
  implemented: boolean
  legalBasis?: string
}

export type IndustryPackage = {
  code: IndustryCode
  label: string
  labelShort: string       // 叙事層の業界タグ・切替タブ表示用(例 '運送')
  jobCategories: string[]  // 雇用条件の職種(従事すべき業務)選択肢。先頭にデモ既定値
  tasks: IndustryTaskDef[]
  workQualRules: WorkQualRule[]
  obligations: IndustryObligation[]
}
