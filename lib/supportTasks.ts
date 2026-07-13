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
export const TASK_TYPE_QUARTERLY_INTERVIEW_SUPERVISOR = 'quarterly_interview_supervisor'
export const INTERVIEW_TASK_TYPES = [
  TASK_TYPE_QUARTERLY_INTERVIEW,
  TASK_TYPE_QUARTERLY_INTERVIEW_SUPERVISOR,
] as const

export type InterviewVariant = 'worker' | 'supervisor'

export function interviewVariantOf(taskType: string): InterviewVariant {
  return taskType === TASK_TYPE_QUARTERLY_INTERVIEW_SUPERVISOR ? 'supervisor' : 'worker'
}

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
 * 在職中の特定技能1号全員について、いま必要な四半期面談タスク
 * （本人面談 + 監督者面談の2種）を upsert する。
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
    for (const task_type of INTERVIEW_TASK_TYPES) {
      rows.push({
        organization_id: w.org_id,
        worker_id: w.id,
        task_type,
        period_key,
        due_date,
      })
    }
  }
  if (rows.length === 0) return

  const { error } = await supabase.from('support_tasks')
    .upsert(rows, { onConflict: 'worker_id,task_type,period_key', ignoreDuplicates: true })
  if (error) console.warn('[supportTasks] タスク生成に失敗:', error.message)
}

// ── 面談フォーム保存（4連書込） ─────────────────────────────

/**
 * 参考様式第5-5号「３ 面談結果」の確認項目（18項目・5グループ）。
 * row は帳票テンプレート mendan-hokoku-5-5.xlsx の行番号（W列=有無、Z列=問題の内容）
 */
export const INTERVIEW_ITEMS = [
  { key: 'work1',    group: '業務内容', label: '雇用契約と異なる業務に従事していないこと', row: 18 },
  { key: 'work2',    group: '業務内容', label: '他の事業主の下で業務に従事していないこと', row: 19 },
  { key: 'work3',    group: '業務内容', label: '安全衛生に配慮して適切に業務を行っていること', row: 20 },
  { key: 'pay1',     group: '待遇',     label: '雇用契約に基づき毎月適切に報酬を受け取っていること', row: 21 },
  { key: 'pay2',     group: '待遇',     label: '雇用契約と異なる労働時間となっていないこと', row: 22 },
  { key: 'pay3',     group: '待遇',     label: '休日、休暇等が適切に付与されていること（一時帰国休暇を含む）', row: 23 },
  { key: 'pay4',     group: '待遇',     label: '適切な住居が確保されていること', row: 24 },
  { key: 'pay5',     group: '待遇',     label: '定期的に負担する食費、居住費等が合意したとおりの内容であること', row: 25 },
  { key: 'pay6',     group: '待遇',     label: '支援計画にのっとった支援の提供を受けていること', row: 26 },
  { key: 'protect1', group: '保護',     label: '暴行・脅迫・監禁等の不法行為を受けていないこと', row: 27 },
  { key: 'protect2', group: '保護',     label: '相手方を問わず保証金の徴収・違約金を定める契約等がないこと', row: 28 },
  { key: 'protect3', group: '保護',     label: '預金通帳の管理など不当な財産管理を受けていないこと', row: 29 },
  { key: 'protect4', group: '保護',     label: '旅券・在留カードを自分で保管していること', row: 30 },
  { key: 'protect5', group: '保護',     label: '私生活上の自由を不当に制限されていないこと', row: 31 },
  { key: 'life1',    group: '生活',     label: '日常生活においてトラブルが発生していないこと', row: 32 },
  { key: 'life2',    group: '生活',     label: '健康状態に異常がないこと', row: 33 },
  { key: 'other1',   group: 'その他',   label: '不法就労者が働いていないこと', row: 34 },
  { key: 'other2',   group: 'その他',   label: 'その他', row: 35 },
] as const

export type InterviewItemKey = typeof INTERVIEW_ITEMS[number]['key']

/**
 * 参考様式第5-6号（監督者用）の確認項目ラベル。行構成・グループは5-5号と
 * 完全に同一（18〜35行）だが、文言が雇用主・監督者視点になる
 */
export const SUPERVISOR_ITEM_LABELS: Record<InterviewItemKey, string> = {
  work1:    '雇用契約と異なる業務に従事させていないこと',
  work2:    '他の事業主の下で業務に従事させていないこと',
  work3:    '安全衛生に配慮して適切に業務を行わせていること',
  pay1:     '雇用契約に基づき毎月適切に報酬を支払っていること',
  pay2:     '雇用契約と異なる労働時間とさせていないこと',
  pay3:     '休日、休暇等を適切に付与していること（一時帰国休暇を含む）',
  pay4:     '適切な住居を確保していること',
  pay5:     '定期的に負担する食費、居住費等が合意したとおりの内容であること',
  pay6:     '支援計画にのっとった支援の提供を行っていること',
  protect1: '暴行・脅迫・監禁等の不法行為を行っていないこと',
  protect2: '相手方を問わず保証金の徴収・違約金を定める契約等を締結していないこと',
  protect3: '預金通帳の管理など不当な財産管理を行っていないこと',
  protect4: '旅券・在留カードを管理していないこと',
  protect5: '私生活上の自由を不当に制限していないこと',
  life1:    '日常生活においてトラブルが発生していないこと',
  life2:    '健康診断を定期的に実施し、健康状態に異常がないことを確認していること',
  other1:   '不法就労者を雇用していないこと',
  other2:   'その他',
}

/** variant に応じた項目ラベルを返す（行・キー・グループは共通） */
export function itemLabelOf(key: InterviewItemKey, variant: InterviewVariant): string {
  if (variant === 'supervisor') return SUPERVISOR_ITEM_LABELS[key]
  return INTERVIEW_ITEMS.find(i => i.key === key)!.label
}

export type ItemCheck = {
  hasIssue: boolean
  detail: string  // 問題ありの場合の内容（帳票の「問題の内容」欄）
}

export type EvaluatorRatings = {
  performance: number  // 業務遂行 1〜5
  attendance: number   // 勤怠・時間 1〜5
  compliance: number   // 安全衛生・規範遵守 1〜5
}

export type StaffRole = 'support_staff' | 'support_manager'  // 支援担当者 | 支援責任者

/** 監督者面談（5-6号）の面談対象者情報 */
export type SupervisorTarget = {
  name: string        // 監督者の氏名
  title: string       // 監督者の役職（L8 は「氏名及び役職」のため氏名と併記して出力）
  department: string  // 監督者の所属部署（L9）
}

export type InterviewForm = {
  interviewDate: string
  method: 'in_person' | 'online'
  onlineConsent: boolean  // 本人面談のオンライン時のみ使用（監督者面談は同意要件なし）
  recordingUrl: string
  staffName: string
  staffRole: StaffRole
  staffRoleTitle: string  // 役職名（任意）
  supervisorTarget: SupervisorTarget | null  // 監督者面談のみ（本人面談は null）
  otherParticipants: string
  language: string
  hasInterpreter: boolean
  interpreterName: string
  items: Record<InterviewItemKey, ItemCheck>  // 5-5/5-6号の確認18項目
  violation: {
    has: boolean       // ⑥基準不適合等の有無
    date: string       // 有りの場合の発生年月日
    detail: string     // 有りの場合の内容
  }
  freeNote: string
  // 評価の分担方式: 本人面談=支援担当者(support_staff)、監督者面談=現場責任者(site_supervisor)。
  // 同一四半期に同一 evaluator_role が二重登録されることを構造的に防ぐ
  ratings: EvaluatorRatings
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
 *  ① support_records INSERT（法定記録の正本・証拠層。type は variant で書き分け）
 *  ② evaluations INSERT（分担方式: 本人面談=support_staff / 監督者面談=site_supervisor）
 *  ③ support_tasks UPDATE（タスク完了。RLSサイレント失敗対策で更新行数を検証）
 *  ④ document_generations INSERT（面談記録書の生成記録。5-5/5-6で document_id を書き分け）
 */
export async function completeInterviewTask(
  task: Pick<SupportTask, 'id' | 'organization_id' | 'worker_id' | 'period_key' | 'task_type'>,
  form: InterviewForm,
): Promise<{ error: string | null; supportRecordId?: string }> {
  const supabase = createClient()
  const evaluatedAt = new Date().toISOString()
  const variant = interviewVariantOf(task.task_type)

  // ① 法定記録（正本）。notes は5-5/5-6号の項目構造（items 18項目）で保持
  const { data: rec, error: recErr } = await supabase.from('support_records').insert({
    organization_id: task.organization_id,
    worker_id: task.worker_id,
    type: variant === 'supervisor' ? 'interview_supervisor' : 'interview_worker',
    quarter: task.period_key,
    scheduled_date: form.interviewDate,
    completed: true,
    completed_date: form.interviewDate,
    method: form.method,
    online_consent: variant === 'worker' && form.method === 'online' ? form.onlineConsent : null,
    recording_url: variant === 'worker' && form.method === 'online' && form.recordingUrl ? form.recordingUrl : null,
    notes: {
      staff_name: form.staffName,
      staff_role: form.staffRole,
      staff_role_title: form.staffRoleTitle,
      supervisor_target: form.supervisorTarget,
      other_participants: form.otherParticipants,
      language: form.language,
      has_interpreter: form.hasInterpreter,
      interpreter_name: form.interpreterName,
      items: form.items,
      violation: form.violation,
      free_note: form.freeNote,
    },
  }).select().single()
  if (recErr || !rec) return { error: `面談記録の保存に失敗: ${recErr?.message}` }

  // ② 雇用主評価（5段階→既存3列へ換算・分担方式で role を決定）
  const { error: evalErr } = await supabase.from('evaluations').insert([
    toEvaluationRow(
      task.worker_id,
      variant === 'supervisor' ? 'site_supervisor' : 'support_staff',
      task.period_key, rec.id, evaluatedAt, form.ratings,
    ),
  ])
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

  // ④ 面談記録書の生成記録（帳票の実生成は保存後に /api/documents/generate を呼ぶ。
  //    生成記録はここで一元管理するため、API側の mendan 分岐では記録しない）
  const { error: genErr } = await supabase.from('document_generations').insert({
    worker_id: task.worker_id,
    document_id: interviewDocumentIdOf(variant),
  })
  if (genErr) return { error: `生成記録の保存に失敗: ${genErr.message}` }

  return { error: null, supportRecordId: rec.id }
}

/** variant に応じた帳票の document_id（5-5号=mendan_kiroku / 5-6号=mendan_kiroku_supervisor） */
export function interviewDocumentIdOf(variant: InterviewVariant): string {
  return variant === 'supervisor' ? 'mendan_kiroku_supervisor' : 'mendan_kiroku'
}
