/**
 * タスクエンジン基盤（Phase 2 面談タスク様板）
 *
 * support_tasks のレイジー生成（cron 不使用・ダッシュボード等の閲覧時に
 * 不足分だけ upsert）。重複は UNIQUE (worker_id, task_type, period_key) で
 * 構造的に防止する。
 *
 * 四半期の起算は暦四半期（trustScore.ts の quarterKey と同一キー体系）。
 * 初回のみハイブリッドルール:
 *   初回期限 = 契約開始日 + 3ヶ月、period_key はその期限日が属する四半期
 *   （法定の「3ヶ月に1回以上」の初回間隔を担保しつつ、以降はスコア計算・
 *     evaluations.quarter と同じ暦四半期リズムに揃える）
 * 2回目以降: 当四半期のタスク、期限 = 四半期末日
 */
import { createClient } from '@/lib/supabase/client'

export const TASK_TYPE_QUARTERLY_INTERVIEW = 'quarterly_interview'

export type SupportTask = {
  id: string
  organization_id: string
  worker_id: string
  task_type: string
  period_key: string
  due_date: string
  status: 'pending' | 'completed'
  completed_at: string | null
  record: Record<string, unknown> | null
  support_record_id: string | null
}

// ── 日付ユーティリティ ──────────────────────────────────────

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** trustScore.ts の quarterKey と同一形式（'2026-Q3'） */
export function quarterKey(d: Date): string {
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`
}

/** d が属する暦四半期の末日 */
function quarterEnd(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3)
  return new Date(d.getFullYear(), q * 3 + 3, 0)
}

function addMonths(dateStr: string, n: number): Date {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + n)
  return d
}

// ── 期限計算 ────────────────────────────────────────────────

/**
 * 契約開始日から、いま生成すべき四半期面談タスクの period_key / due_date を返す。
 * - 初回期限（契約開始+3ヶ月）が当四半期より先 → 初回タスク（期限=契約開始+3ヶ月）
 * - 初回期限が当四半期内 → 当四半期タスク（期限=契約開始+3ヶ月）
 * - それ以前に初回を過ぎている（定常） → 当四半期タスク（期限=四半期末日）
 */
export function computeInterviewTask(
  contractStart: string,
  now: Date,
): { period_key: string; due_date: string } {
  const first = addMonths(contractStart, 3)
  if (first > quarterEnd(now)) {
    return { period_key: quarterKey(first), due_date: fmtDate(first) }
  }
  if (quarterKey(first) === quarterKey(now)) {
    return { period_key: quarterKey(now), due_date: fmtDate(first) }
  }
  return { period_key: quarterKey(now), due_date: fmtDate(quarterEnd(now)) }
}

// ── レイジー生成 ────────────────────────────────────────────

type WorkerJoinRow = {
  id: string
  org_id: string
  residence_statuses: { status_type: string | null; is_active: boolean }[]
}

/**
 * 在職中の特定技能1号全員について、いま必要な四半期面談タスクを upsert する。
 * 既存行（完了済み含む）は ignoreDuplicates で一切上書きしない。
 * 過去四半期の未完了タスクは pending のまま残り、期限超過として表示される。
 */
export async function ensureQuarterlyInterviewTasks(): Promise<void> {
  const supabase = createClient()
  const now = new Date()

  const [workersRes, contractsRes] = await Promise.all([
    supabase.from('foreign_workers')
      .select('id, org_id, residence_statuses(status_type, is_active)')
      .eq('status', 'active'),
    supabase.from('worker_contracts').select('worker_id, contract_start_date'),
  ])
  if (workersRes.error || contractsRes.error) {
    console.warn('[supportTasks] タスク生成用データの取得に失敗:',
      workersRes.error?.message ?? contractsRes.error?.message)
    return
  }

  const startOf = new Map(
    (contractsRes.data ?? []).map(c => [c.worker_id as string, c.contract_start_date as string | null])
  )

  const rows = []
  for (const w of (workersRes.data ?? []) as WorkerJoinRow[]) {
    const active = w.residence_statuses?.find(s => s.is_active)
    if (active?.status_type !== '特定技能1号') continue  // 義務的支援は1号専属
    const start = startOf.get(w.id)
    if (!start) continue
    const { period_key, due_date } = computeInterviewTask(start, now)
    rows.push({
      organization_id: w.org_id,
      worker_id: w.id,
      task_type: TASK_TYPE_QUARTERLY_INTERVIEW,
      period_key,
      due_date,
    })
  }
  if (rows.length === 0) return

  const { error } = await supabase.from('support_tasks')
    .upsert(rows, { onConflict: 'worker_id,task_type,period_key', ignoreDuplicates: true })
  if (error) console.warn('[supportTasks] タスク生成に失敗:', error.message)
}

// ── 面談フォーム保存（4連書込） ─────────────────────────────

export type CategoryCheck = {
  hasIssue: boolean
  detail: string    // 問題ありの場合の詳細
  response: string  // 問題ありの場合の対応
}

export type EvaluatorRatings = {
  performance: number  // 業務遂行 1〜5
  attendance: number   // 勤怠・時間 1〜5
  compliance: number   // 安全衛生・規範遵守 1〜5
}

export type InterviewForm = {
  interviewDate: string
  method: 'in_person' | 'online'
  onlineConsent: boolean
  recordingUrl: string
  staffName: string
  otherParticipants: string
  language: string
  hasInterpreter: boolean
  interpreterName: string
  categories: {
    work: CategoryCheck
    life: CategoryCheck
    health: CategoryCheck
    complaint: CategoryCheck
  }
  freeNote: string
  staffRatings: EvaluatorRatings            // 支援担当者（必須）
  supervisorRatings: EvaluatorRatings | null // 現場責任者（任意・後追い可）
}

/**
 * 5段階評価(1〜5)を evaluations の既存3列へ換算する。
 * calcInterviewScore は 達成率 = score/満点 を 1+4×達成率 で5段階に戻すため、
 * 逆写像 score = (rating-1)/4 × 満点 で往復が一致する
 * （compliance は10点満点のため整数丸めで最大±0.5点の誤差、集計上は無視できる）
 */
function toEvaluationRow(
  workerId: string, role: 'support_staff' | 'site_supervisor',
  quarter: string, supportRecordId: string, evaluatedAt: string, r: EvaluatorRatings,
) {
  return {
    worker_id: workerId,
    evaluator_role: role,
    quarter,
    support_record_id: supportRecordId,
    evaluated_at: evaluatedAt,
    performance_score: Math.round((r.performance - 1) / 4 * 20),
    attendance_score: Math.round((r.attendance - 1) / 4 * 20),
    compliance_score: Math.round((r.compliance - 1) / 4 * 10),
  }
}

/**
 * 面談フォーム保存の4連書込（原則1: 1保存で全書込を完結させ二度書きを作らない）
 *  ① support_records INSERT（法定記録の正本・証拠層）
 *  ② evaluations INSERT（支援担当者は必須・現場責任者は任意）
 *  ③ support_tasks UPDATE（タスク完了。RLSサイレント失敗対策で更新行数を検証）
 *  ④ document_generations INSERT（面談記録書の生成記録）
 */
export async function completeInterviewTask(
  task: Pick<SupportTask, 'id' | 'organization_id' | 'worker_id' | 'period_key'>,
  form: InterviewForm,
): Promise<{ error: string | null }> {
  const supabase = createClient()
  const evaluatedAt = new Date().toISOString()

  // ① 法定記録（正本）
  const { data: rec, error: recErr } = await supabase.from('support_records').insert({
    organization_id: task.organization_id,
    worker_id: task.worker_id,
    type: 'interview_worker',
    quarter: task.period_key,
    scheduled_date: form.interviewDate,
    completed: true,
    completed_date: form.interviewDate,
    method: form.method,
    online_consent: form.method === 'online' ? form.onlineConsent : null,
    recording_url: form.method === 'online' && form.recordingUrl ? form.recordingUrl : null,
    notes: {
      staff_name: form.staffName,
      other_participants: form.otherParticipants,
      language: form.language,
      has_interpreter: form.hasInterpreter,
      interpreter_name: form.interpreterName,
      categories: form.categories,
      free_note: form.freeNote,
    },
  }).select().single()
  if (recErr || !rec) return { error: `面談記録の保存に失敗: ${recErr?.message}` }

  // ② 雇用主評価（5段階→既存3列へ換算）
  const evalRows = [
    toEvaluationRow(task.worker_id, 'support_staff', task.period_key, rec.id, evaluatedAt, form.staffRatings),
  ]
  if (form.supervisorRatings) {
    evalRows.push(toEvaluationRow(task.worker_id, 'site_supervisor', task.period_key, rec.id, evaluatedAt, form.supervisorRatings))
  }
  const { error: evalErr } = await supabase.from('evaluations').insert(evalRows)
  if (evalErr) return { error: `評価の保存に失敗: ${evalErr.message}` }

  // ③ タスク完了（更新行数を検証: RLSサイレント失敗の既知パターン対策）
  const { data: updated, error: taskErr } = await supabase.from('support_tasks')
    .update({
      status: 'completed',
      completed_at: evaluatedAt,
      record: form as unknown as Record<string, unknown>,
      support_record_id: rec.id,
      updated_at: evaluatedAt,
    })
    .eq('id', task.id)
    .select()
  if (taskErr) return { error: `タスク完了の記録に失敗: ${taskErr.message}` }
  if ((updated ?? []).length !== 1) {
    return { error: 'タスク完了の記録に失敗: 更新行数が1ではありません（RLSポリシーを確認してください）' }
  }

  // ④ 面談記録書の生成記録（帳票テンプレートは後続タスクで実装）
  const { error: genErr } = await supabase.from('document_generations').insert({
    worker_id: task.worker_id,
    document_id: 'mendan_kiroku',
  })
  if (genErr) return { error: `生成記録の保存に失敗: ${genErr.message}` }

  return { error: null }
}
