/**
 * 作業資格ギャップ判定（段3・純関数）
 *
 * 柱4: 業界パッケージ（データ）の workQualRules と、従業員の作業割当
 * （worker_work_assignments）× 保有資格（qualifications）を突合する。
 * 未充足＝労働安全衛生法119条の罰則リスク（未修了従事）。
 */
import type { WorkQualRule } from '@/lib/industry/types'

export type QualRow = { type: string; level: string | null }
export type AssignmentRow = { work_key: string; status: string; planned_start_date: string | null }

export type QualGap = {
  rule: WorkQualRule
  assignment: AssignmentRow
  satisfied: boolean   // false = 資格ギャップ（119条リスク）
}

/**
 * 作業割当 × 保有資格を突合し、各割当の充足/未充足を返す。
 * - パッケージの workQualRules に無い work_key は判定対象外（除外）
 * - 充足 = requiredQualType（＋ requiredLevel があれば level）が一致する qualifications 行が存在
 */
export function computeQualGap(
  rules: WorkQualRule[],
  assignments: AssignmentRow[],
  quals: QualRow[],
): QualGap[] {
  return assignments.flatMap(a => {
    const rule = rules.find(r => r.work === a.work_key)
    if (!rule) return []
    const satisfied = quals.some(q =>
      q.type === rule.requiredQualType &&
      (!rule.requiredLevel || q.level === rule.requiredLevel))
    return [{ rule, assignment: a, satisfied }]
  })
}
