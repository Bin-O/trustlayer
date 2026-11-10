import type { Form } from '@/components/EmploymentConditionsWizard'

/**
 * 随時届出（参考様式第3-1-1号）の要否判定を集約する唯一の関数。
 *
 * 保存フロー（EmploymentConditionsWizard）はこの関数だけを呼び、
 * ダッシュボードはこの関数の結果を保存した employment_condition_history.todoke_status
 * を読むだけにする（判定ロジックを二重に持たない）。
 *
 * ── 次セッションでの全面改訂予定 ──
 * 入管庁「特定技能所属機関からの随時届出Q&A」（令和7年6月）に基づき、
 * 「差分あり＝届出必要」ではなくなる。届出不要となる代表例：
 *   ・昇給による基本賃金の増額
 *   ・控除の減少（他の支出増を伴わないもの）
 *   ・始業終業の変更で所定労働時間が変わらないもの
 * これらを prevSnapshot / form の中身を見て除外する判定へ差し替える。
 * 変更はこの1関数に閉じ、保存フローとダッシュボードの両方を直す必要をなくす。
 */
export type TodokeDiffEntry = {
  item: { label: string; before: string; after: string }
  section: string
}

export function isTodokeRequired(
  diff: TodokeDiffEntry[],
  _prevSnapshot: Record<string, unknown>,
  _form: Form,
): boolean {
  // 今回の実装：差分が1つ以上あれば届出必要。
  // （prevSnapshot / form は次セッションの精緻化のために受け取っておく）
  return diff.length > 0
}
