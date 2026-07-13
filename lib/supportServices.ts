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

export type SupportServiceDef = {
  key: string
  no: number                 // 法定10業務の番号
  label: string
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
  { key: 'guidance',        no: 1,  label: '事前ガイダンス',            short: '事前案内',   obligation: 'always',   recordTypes: ['guidance'] },
  { key: 'airport_pickup',  no: 2,  label: '出入国する際の送迎',        short: '送迎',       obligation: 'on_event', recordTypes: ['airport_pickup'] },
  { key: 'housing',         no: 3,  label: '住居確保・生活契約支援',    short: '住居確保',   obligation: 'always',   recordTypes: ['housing'] },
  { key: 'life_orientation',no: 4,  label: '生活オリエンテーション',    short: '生活案内',   obligation: 'always',   recordTypes: ['orientation'] },
  { key: 'accompaniment',   no: 5,  label: '公的手続等への同行',        short: '手続同行',   obligation: 'on_event', recordTypes: ['accompaniment'] },
  { key: 'japanese',        no: 6,  label: '日本語学習の機会提供',      short: '日本語学習', obligation: 'always',   recordTypes: ['japanese', 'training'] },
  { key: 'consultation',    no: 7,  label: '相談・苦情への対応',        short: '相談対応',   obligation: 'on_event', recordTypes: ['consultation'] },
  { key: 'exchange',        no: 8,  label: '日本人との交流促進',        short: '交流促進',   obligation: 'always',   recordTypes: ['exchange'] },
  { key: 'job_change',      no: 9,  label: '転職支援（非自発的離職時）', short: '転職支援',   obligation: 'on_event', recordTypes: ['job_change'] },
  { key: 'interview',       no: 10, label: '定期的な面談・行政通報',    short: '定期面談',   obligation: 'always',   recordTypes: ['interview_worker', 'interview_supervisor'], taskType: TASK_TYPE_QUARTERLY_INTERVIEW },
]

/** マトリクスのセル状態 */
export type ServiceStatus = 'done' | 'due' | 'not_yet' | 'not_applicable'

export const STATUS_LABEL: Record<ServiceStatus, string> = {
  done: '実施済',
  due: '要対応',
  not_yet: '未実施',
  not_applicable: '該当なし',
}

export const STATUS_STYLE: Record<ServiceStatus, { icon: string; color: string; bg: string }> = {
  done:           { icon: '✅', color: '#166534', bg: '#dcfce7' },
  due:            { icon: '⚠️', color: '#b45309', bg: '#fef3c7' },
  not_yet:        { icon: '○',  color: '#9ca3af', bg: '#f3f4f6' },
  not_applicable: { icon: '—',  color: '#cbd5e1', bg: '#f8fafc' },
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
