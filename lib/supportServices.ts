/**
 * 10支援業務マトリクス（レポートビュー）
 *
 * product-direction.md 柱1: マトリクスは「監査・投資家向けレポートビュー」であり
 * 操作画面ではない。原則2の証拠層（support_records + support_tasks）の集約表示に徹する。
 *
 * SUPPORT_SERVICES_DEF は将来の業界パッケージ（柱4）で差し替え可能な形にしておく:
 * 業界ごとに追加業務が入る想定のため、この配列を業界パッケージから拡張する。
 * 業務専用コードは書かず、定義データで表現する。
 */
import {
  TASK_TYPE_QUARTERLY_INTERVIEW,
  quarterKey,
  type SupportTask,
} from '@/lib/supportTasks'

/** 業務の義務区分。always=常時義務 / on_event=事由発生時のみ（該当なし表示の基準） */
export type Obligation = 'always' | 'on_event'

/** 雇用ライフサイクル上の段階(マトリクスの工程順表示・叙事層の4段骨格に使用) */
export type LifecycleStage = 'pre_hire' | 'onboarding' | 'employed' | 'offboarding'

export const STAGE_LABEL: Record<LifecycleStage, string> = {
  pre_hire: '入社前',
  onboarding: '入社時',
  employed: '在職中',
  offboarding: '離職時',
}

export type SupportServiceDef = {
  key: string
  no: number                 // 法定10業務の番号
  label: string
  desc: string               // 義務の一句説明(表頭tooltip・三段式フォームで共用)
  notApplicableReason?: string // on_event 業務が「該当なし」となる理由(該当なしセルの tooltip 用)
  stage: LifecycleStage      // 雇用ライフサイクル段階(マトリクスの列グループ)
  short: string              // マトリクス縦書きヘッダー用の短縮表記（全文は title 属性で表示）
  obligation: Obligation
  recordTypes: string[]      // 実施済み判定に用いる support_records.type（複数可）
  /** 定期面談だけはタスク化済みのため、期限概念（⚠️）を持つ */
  taskType?: string
}

/**
 * 義務的支援10業務の標準定義（特定技能・全業種共通のベースパッケージ）。
 * recordTypes が空の業務は現時点で記録投入UIが無く、記録があれば✅、無ければ
 * always→未実施○ / on_event→該当なし— で表示される（実施記録UIは次フェーズ）。
 */
export const SUPPORT_SERVICES_DEF: SupportServiceDef[] = [
  { key: 'guidance',        no: 1,  label: '事前ガイダンス',            short: '事前案内', stage: 'pre_hire',   obligation: 'always',   recordTypes: ['guidance'],
    desc: '雇用契約後・入国前に、労働条件や活動内容、入国手続等を説明する義務' },
  { key: 'airport_pickup',  no: 2,  label: '出入国する際の送迎',        short: '空港送迎', stage: 'onboarding', obligation: 'on_event', recordTypes: ['airport_pickup'],
    desc: '入国時に空港から事業所・住居まで、帰国時に空港の保安検査場まで送迎する義務',
    notApplicableReason: '海外からの入国・出国時にのみ発生する義務のため、在職中は対象外' },
  { key: 'housing',         no: 3,  label: '住居確保・生活契約支援',    short: '住居確保', stage: 'onboarding', obligation: 'always',   recordTypes: ['housing'],
    desc: '住居の確保と、銀行口座・携帯電話・ライフライン等の契約手続を支援する義務' },
  { key: 'life_orientation',no: 4,  label: '生活オリエンテーション',    short: '生活案内', stage: 'onboarding', obligation: 'always',   recordTypes: ['orientation'],
    desc: '入国後に日本の生活ルールや公共機関の利用方法等を説明する義務' },
  { key: 'accompaniment',   no: 5,  label: '公的手続等への同行',        short: '手続同行', stage: 'employed',   obligation: 'on_event', recordTypes: ['accompaniment'],
    desc: '住居地届出・社会保険・税等の手続に必要に応じて同行し書類作成を補助する義務',
    notApplicableReason: '公的手続の事由が発生したときにのみ生じる義務のため、現在は対象外' },
  { key: 'japanese',        no: 6,  label: '日本語学習の機会提供',      short: '語学支援', stage: 'employed',   obligation: 'always',   recordTypes: ['japanese', 'training'],
    desc: '日本語教室の入学案内や学習教材の提供等により学習機会を確保する義務' },
  { key: 'consultation',    no: 7,  label: '相談・苦情への対応',        short: '相談対応', stage: 'employed',   obligation: 'on_event', recordTypes: ['consultation'],
    desc: '本人が理解できる言語で相談・苦情に応じ、助言や必要な案内を行う義務',
    notApplicableReason: '本人から相談・苦情の申出があったときにのみ生じる義務のため、現在は対象外' },
  { key: 'exchange',        no: 8,  label: '日本人との交流促進',        short: '交流促進', stage: 'employed',   obligation: 'always',   recordTypes: ['exchange'],
    desc: '地域行事の案内や参加支援等により日本人との交流機会を設ける義務' },
  { key: 'job_change',      no: 9,  label: '転職支援（非自発的離職時）', short: '転職支援', stage: 'offboarding', obligation: 'on_event', recordTypes: ['job_change'],
    desc: '会社都合等の非自発的離職時に、次の受入れ先探しを支援する義務',
    notApplicableReason: '会社都合等の非自発的離職が生じたときにのみ発生する義務のため、現在は対象外' },
  { key: 'interview',       no: 10, label: '定期的な面談・行政通報',    short: '定期面談', stage: 'employed',   obligation: 'always',   recordTypes: ['interview_worker', 'interview_supervisor'], taskType: TASK_TYPE_QUARTERLY_INTERVIEW,
    desc: '3ヶ月に1回以上本人と監督者に面談し、法令違反を把握した場合は通報する義務' },
]

/**
 * マトリクスの列順（雇用ライフサイクルの工程順）。
 * SUPPORT_SERVICES_DEF は公式番号順の正本のまま変更しない（詳細ページの縦リスト・
 * 業界パッケージ拡張が公式順に依存）。列位置だけ工程順にし、公式番号は表示で維持する。
 * 在職中は公式順を保ちつつ、定期面談（反復義務）→転職支援（ライフサイクル終端）の順で締める。
 */
const MATRIX_COLUMN_KEYS = [
  'guidance',
  'airport_pickup', 'housing', 'life_orientation',
  'accompaniment', 'japanese', 'consultation', 'exchange', 'interview', 'job_change',
] as const

export const SUPPORT_SERVICES_MATRIX_ORDER: SupportServiceDef[] =
  MATRIX_COLUMN_KEYS.map(k => SUPPORT_SERVICES_DEF.find(d => d.key === k)!)

/** マトリクスのセル状態 */
export type ServiceStatus = 'done' | 'due' | 'not_yet' | 'not_applicable'

export const STATUS_LABEL: Record<ServiceStatus, string> = {
  done: '実施済',
  due: '要対応',
  not_yet: '未実施',
  not_applicable: '該当なし',
}

/** 凡例用の補足(未実施=空き枠/該当なし=対象外の区別を文言でも支える) */
export const STATUS_LEGEND_NOTE: Record<ServiceStatus, string> = {
  done: '実施済',
  due: '要対応',
  not_yet: '未実施(記録待ち)',
  not_applicable: '該当なし(対象外)',
}

// 記号の描画は components/SupportStatusGlyph に集約(未実施=破線の空き枠、○×文化との衝突回避)。
// ここは色定義のみ。該当なしは背景を持たず、未実施(空き枠)より一段薄い。
export const STATUS_STYLE: Record<ServiceStatus, { color: string; bg: string }> = {
  done:           { color: '#166534', bg: '#dcfce7' },
  due:            { color: '#b45309', bg: '#fef3c7' },
  not_yet:        { color: '#9ca3af', bg: '#f3f4f6' },
  not_applicable: { color: '#d1d5db', bg: 'transparent' },
}

/** 集約に必要な最小レコード形。quarter は面談の当四半期判定に用いる（他業務は NULL 可） */
export type ServiceRecordRow = { type: string; completed: boolean | null; quarter?: string | null }
export type ServiceTaskRow = Pick<SupportTask, 'task_type' | 'status' | 'due_date'>

/**
 * 1業務×1従業員の状態を判定する。
 * - taskType あり（定期面談）: 当四半期(quarter==当Q)の完了記録あれば done / 期限超過の
 *   未完了タスクあれば due / 期限内の未完了タスクは not_yet（予定あり・未実施。新人の初回面談は
 *   期日前のため⚠️にしない）/ タスクが無ければ not_yet。
 *   ※過去四半期の完了記録では done にしない（監査ビューとして当Qの実施状況を反映）。
 *   判定は completed_date ではなく quarter(=period_key)基準（当Q義務の充足を見る）
 * - taskType なし: 実施記録あれば done（四半期概念なし・従来通り）/
 *   無ければ always→not_yet, on_event→not_applicable
 */
export function serviceStatusOf(
  def: SupportServiceDef,
  records: ServiceRecordRow[],
  tasks: ServiceTaskRow[],
  now: Date = new Date(),
): ServiceStatus {
  const currentQuarter = quarterKey(now)
  const hasDoneRecord = records.some(r =>
    def.recordTypes.includes(r.type) && r.completed !== false
    // 面談(taskType あり)のみ当四半期に限定。他業務は四半期を問わない
    && (!def.taskType || r.quarter === currentQuarter))
  if (hasDoneRecord) return 'done'

  if (def.taskType) {
    const pending = tasks.filter(t => interviewTaskMatches(def, t.task_type) && t.status === 'pending')
    // 期限超過（due_date < now）の未完了タスクのみ「要対応」。期限内は「未実施（予定あり）」
    const overdue = pending.some(t => new Date(t.due_date) < now)
    return overdue ? 'due' : 'not_yet'
  }

  return def.obligation === 'on_event' ? 'not_applicable' : 'not_yet'
}

/** 定期面談は本人+監督者の2 task_type を1業務としてまとめる（他業務は taskType 完全一致） */
function interviewTaskMatches(def: SupportServiceDef, taskType: string): boolean {
  if (def.key === 'interview') return taskType.startsWith('quarterly_interview')
  return def.taskType === taskType
}

/** 実施率の分母（常時義務の件数）と分子（done の常時義務件数）。on_event は分母から除外 */
export function completionRate(statuses: { def: SupportServiceDef; status: ServiceStatus }[]): {
  done: number; total: number
} {
  const always = statuses.filter(s => s.def.obligation === 'always')
  return {
    done: always.filter(s => s.status === 'done').length,
    total: always.length,
  }
}

/** 全業務の状態をまとめて算出 */
export function computeServiceMatrix(
  records: ServiceRecordRow[],
  tasks: ServiceTaskRow[],
  now: Date = new Date(),
): { def: SupportServiceDef; status: ServiceStatus }[] {
  return SUPPORT_SERVICES_DEF.map(def => ({ def, status: serviceStatusOf(def, records, tasks, now) }))
}
