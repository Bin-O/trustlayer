/**
 * 信頼スコア計算モジュール（仕様書 docs/trust-score-spec.md §2・§4）
 *
 * v1 の仕様書からの変更点:
 * - 届出期限遵守(8点)は「生成義務のある届出のうち生成済みの割合 × 8点」に簡略化
 *   （document_generations を根拠とし、提出日トラッキングは将来対応）
 * - evaluator_role が NULL の既存 evaluations は面談時評価の集計から除外
 *
 * formula_version 2:
 * - 有効な評価が0件のとき面談時評価は0点（ベイズ収縮の prior は1件以上でのみ適用）
 * - 届出義務が0件かつ在職実データ（worker_contracts / payroll_records いずれか1行以上）
 *   も無い場合、届出遵守8点を与えない
 * - 各内訳項目に hasData を追加（データ未蓄積のUI表示用）
 */
import { createClient } from '@/lib/supabase/client'

export const FORMULA_VERSION = 2

/** データ充足度がこの値未満の場合、総合点の数値ではなく「実績蓄積中」と表示する */
export const SUFFICIENCY_DISPLAY_THRESHOLD = 0.5

export type Badge = 'verified' | 'document_confirmed' | 'self_reported' | 'subjective'

/**
 * 信頼スコア全体の表示分岐（緑/橙/灰）。
 * - verified   緑「検証済」   : データ充足度が閾値以上。数値スコアを表示する
 * - attention  橙「要対応」   : 蓄積されるべき期間が経過してなお面談・評価が皆無 = 検証された欠缺
 * - accumulating 灰「データ蓄積中」: 新入社等でデータがまだ蓄積されていない
 */
export type TrustBranch = 'verified' | 'attention' | 'accumulating'

/** 分岐バッジの文言・配色（一覧・詳細・カードで共通利用） */
export const BRANCH_META: Record<TrustBranch, { label: string; color: string; bg: string; border: string }> = {
  verified:     { label: '検証済',       color: '#166534', bg: '#dcfce7', border: '#bbf7d0' },
  attention:    { label: '要対応',       color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  accumulating: { label: 'データ蓄積中', color: '#6b7280', bg: '#f3f4f6', border: '#e5e7eb' },
}

export type BreakdownItem = {
  key: 'continuity' | 'compliance' | 'support' | 'qualification' | 'evaluation'
  label: string
  score: number
  max: number
  badge: Badge
  /** 算出の根拠データが1件以上あるか。false のときUIは「データ未蓄積」を表示 */
  hasData: boolean
  detail?: { interview: number; behavioral: number; interviewCount: number }
}

export type TrustScoreResult = {
  formula_version: number
  total: number
  data_sufficiency: number // 0〜1
  items: BreakdownItem[]
  branch: TrustBranch
}

export type SnapshotRow = {
  month: string // 'YYYY-MM'
  total: number
  data_sufficiency: number
  calculated_at: string
}

const TOKUTEI_TYPES = ['特定技能1号', '特定技能2号']

/** 橙「要対応」判定のガード: この在職月数以上で面談・評価が皆無なら「検証された欠缺」とみなす */
export const ATTENTION_MIN_TENURE_MONTHS = 3

/**
 * スコア全体の表示分岐を導出する（緑/橙/灰）。
 *
 * 橙「要対応」の判定原則:
 *   特定技能の在留者は、支援担当者による面談を「3ヶ月に1回以上」実施する義務がある。
 *   したがって在職 ATTENTION_MIN_TENURE_MONTHS ヶ月以上を経過してもなお、面談記録・
 *   雇用主評価が一件も存在しない状態は、単なる「データ未蓄積」ではなく、蓄積される
 *   べき期間が経過してなお空である＝制度上の義務が果たされていない「検証された欠缺」
 *   である。これを灰(新入社の未蓄積)と区別して橙で明示する。
 *   ※面談義務は特定技能専属のため、非特定技能(特定活動等)はこの分岐の対象外とする。
 */
export function deriveTrustBranch(input: {
  dataSufficiency: number
  isTokutei: boolean
  tenureMonths: number
  interviewCount: number // 実施済み(completed)の本人面談の件数
  evaluationCount: number // 雇用主評価レコードの件数
}): TrustBranch {
  if (input.dataSufficiency >= SUFFICIENCY_DISPLAY_THRESHOLD) return 'verified'
  if (
    input.isTokutei &&
    input.tenureMonths >= ATTENTION_MIN_TENURE_MONTHS &&
    input.interviewCount === 0 &&
    input.evaluationCount === 0
  ) return 'attention'
  return 'accumulating'
}

// ── 日付ユーティリティ ──────────────────────────────────────

function monthsBetween(from: Date, to: Date): number {
  const m = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  return Math.max(0, m)
}

function quarterKey(d: Date): string {
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`
}

/** 現在から遡って n 個分の四半期キー（現在の四半期を含む、新しい順） */
function recentQuarters(now: Date, n: number): string[] {
  const keys: string[] = []
  const d = new Date(now.getFullYear(), now.getMonth(), 1)
  for (let i = 0; i < n; i++) {
    keys.push(quarterKey(d))
    d.setMonth(d.getMonth() - 3)
  }
  return keys
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── データ行の型 ────────────────────────────────────────────

type ContractRow = {
  contract_start_date: string | null
  termination_date: string | null
  new_contract_date: string | null
}
type PayrollRow = {
  target_year: number
  target_month: number
  basic_salary: number | null
  bonus_pay: number | null
}
type SupportRow = { type: string; quarter: string | null; completed: boolean | null }
type QualificationRow = { type: string; level: string | null; verified_level: string }
type EvaluationRow = {
  attendance_score: number | null
  performance_score: number | null
  compliance_score: number | null
  evaluated_at: string | null
  evaluator_role: string | null
  quarter: string | null
  excluded: boolean | null
}
type GenRow = { worker_id: string | null; document_id: string; generated_at: string }
type WorkerRow = {
  org_id: string
  status: string
  residence_statuses: { status_type: string; is_active: boolean }[] | null
}

// ── 各構成項目の計算 ────────────────────────────────────────

/** §2-1 就労継続性(20点) */
function calcContinuity(contract: ContractRow | null, now: Date) {
  if (!contract?.contract_start_date) return { score: 0, hasData: false }
  const start = new Date(contract.contract_start_date)
  const end = contract.termination_date ? new Date(contract.termination_date) : now
  const months = monthsBetween(start, end)
  const tenure = Math.min(months / 24, 1) * 16
  // 契約更新は worker_contracts.new_contract_date（1件のみ記録可能な現行スキーマ）
  const renewals = contract.new_contract_date ? 1 : 0
  const bonus = Math.min(renewals * 2, 4)
  return { score: Math.round(tenure + bonus), hasData: true }
}

/** §2-2 賃金・届出コンプライアンス(20点)、届出遵守はv1簡略版（生成割合×8点） */
function calcCompliance(
  payroll: PayrollRow[],
  gens: GenRow[],
  contract: ContractRow | null,
  workerId: string,
  isTokutei: boolean,
  retired: boolean,
  now: Date,
) {
  // 賃金台帳完整度(12点): 直近12か月のうち登録済み月数。入社12か月未満は在籍月数で按分
  const window: string[] = []
  const d = new Date(now.getFullYear(), now.getMonth(), 1)
  for (let i = 0; i < 12; i++) {
    window.push(`${d.getFullYear()}-${d.getMonth() + 1}`)
    d.setMonth(d.getMonth() - 1)
  }
  const present = new Set(payroll.map(p => `${p.target_year}-${p.target_month}`))
  const monthsInWindow = window.filter(k => present.has(k)).length
  const tenureMonths = contract?.contract_start_date
    ? monthsBetween(new Date(contract.contract_start_date), now) + 1
    : 12
  const denom = Math.max(1, Math.min(12, tenureMonths))
  const payrollScore = Math.min(monthsInWindow / denom, 1) * 12
  const payrollRatio = Math.min(monthsInWindow / denom, 1)

  // 届出遵守(8点) v1: 生成義務のある届出のうち document_generations に記録がある割合
  let obligations = 0
  let generated = 0
  // 3-1-2号: 特定技能の退職者は退職日以降の生成記録が必要
  if (isTokutei && retired && contract?.termination_date) {
    obligations++
    if (gens.some(g =>
      g.worker_id === workerId &&
      g.document_id === 'todoke_keiyaku_shuryo' &&
      g.generated_at.slice(0, 10) >= contract.termination_date!
    )) generated++
  }
  // 3-6号(定期届出): 特定技能在職者は年度の提出期間開始(4/1)以降の生成記録が必要
  // （機関全体で1件生成するため worker_id は問わない）
  if (isTokutei && !retired) {
    const windowStart = now >= new Date(now.getFullYear(), 3, 1)
      ? `${now.getFullYear()}-04-01`
      : `${now.getFullYear() - 1}-04-01`
    obligations++
    if (gens.some(g => g.document_id === 'teiki_hokoku' && g.generated_at.slice(0, 10) >= windowStart)) generated++
  }
  // 義務0件のとき: 在職実データ（契約 or 賃金台帳が1行以上）があれば「違反なし」として
  // 満点、実データが皆無なら加点しない（formula_version 2）
  const hasEmploymentData = contract !== null || payroll.length > 0
  const filingRatio = obligations > 0 ? generated / obligations : (hasEmploymentData ? 1 : 0)
  const filingScore = filingRatio * 8

  return {
    score: Math.round(payrollScore + filingScore),
    payrollRatio,
    hasData: hasEmploymentData || obligations > 0,
  }
}

/** §2-3 支援実施・参加(15点) */
function calcSupport(records: SupportRow[], contract: ContractRow | null, now: Date) {
  const quarters = recentQuarters(now, 4)
  // 入社1年未満は経過四半期数で按分
  const tenureQuarters = contract?.contract_start_date
    ? Math.floor(monthsBetween(new Date(contract.contract_start_date), now) / 3) + 1
    : 4
  const denom = Math.max(1, Math.min(4, tenureQuarters))
  const doneQuarters = new Set(
    records
      .filter(r => r.type === 'interview_worker' && r.completed && r.quarter && quarters.includes(r.quarter))
      .map(r => r.quarter as string)
  ).size
  const interviewRatio = Math.min(doneQuarters / denom, 1)
  const interviewScore = interviewRatio * 10
  const orientationDone = records.some(r => (r.type === 'orientation' || r.type === 'training') && r.completed)
  return {
    score: Math.round(interviewScore + (orientationDone ? 5 : 0)),
    interviewRatio,
    hasData: records.length > 0,
  }
}

/** §2-4 資格・日本語(15点)。申告のみは50%に減額 */
function calcQualification(quals: QualificationRow[]) {
  const jlptPoints: Record<string, number> = { N5: 0, N4: 8, N3: 11, N2: 15, N1: 15 }
  const discount = (q: QualificationRow, pts: number) =>
    q.verified_level === 'document_confirmed' ? pts : pts * 0.5

  let best = 0
  let bestConfirmed = true
  for (const q of quals.filter(q => q.type === 'jlpt')) {
    const pts = discount(q, jlptPoints[q.level ?? ''] ?? 0)
    if (pts > best) { best = pts; bestConfirmed = q.verified_level === 'document_confirmed' }
  }
  let total = best
  const skill = quals.find(q => q.type === 'skill_exam')
  if (skill) {
    total += discount(skill, 3)
    if (skill.verified_level !== 'document_confirmed') bestConfirmed = false
  }
  const score = Math.round(Math.min(total, 15))
  const badge: Badge = quals.length === 0 ? 'self_reported'
    : bestConfirmed ? 'document_confirmed' : 'self_reported'
  return { score, badge, hasData: quals.length > 0 }
}

/** §2-5(a) 面談時評価(15点): 時間加重平均 + ベイズ収縮 + 単一評価者上限 */
function calcInterviewScore(evals: EvaluationRow[], now: Date) {
  // v1: evaluator_role が NULL の既存レコード・除外フラグ付きは集計対象外
  const valid = evals.filter(e => e.evaluator_role !== null && !e.excluded)

  // 評価行を5段階(1〜5)に正規化。既存の3スコア列(20/20/10点満点)の達成率平均から換算
  const rating = (e: EvaluationRow): number | null => {
    const parts: number[] = []
    if (e.attendance_score !== null) parts.push(e.attendance_score / 20)
    if (e.performance_score !== null) parts.push(e.performance_score / 20)
    if (e.compliance_score !== null) parts.push(e.compliance_score / 10)
    if (parts.length === 0) return null
    return 1 + 4 * (parts.reduce((a, b) => a + b, 0) / parts.length)
  }

  // 時間加重: 直近4四半期を 4:3:2:1、それ以前は対象外
  const quarters = recentQuarters(now, 4)
  const weightOf = (e: EvaluationRow): number => {
    const q = e.quarter ?? (e.evaluated_at ? quarterKey(new Date(e.evaluated_at)) : null)
    const idx = q ? quarters.indexOf(q) : -1
    return idx === -1 ? 0 : 4 - idx
  }

  type Weighted = { rating: number; weight: number; role: string }
  const weighted: Weighted[] = []
  for (const e of valid) {
    const r = rating(e)
    const w = weightOf(e)
    if (r !== null && w > 0) weighted.push({ rating: r, weight: w, role: e.evaluator_role! })
  }

  // 単一評価者の影響上限50%: 複数評価者がいる場合、1評価者の重み合計を全体の50%までに制限
  const byRole = new Map<string, number>()
  for (const w of weighted) byRole.set(w.role, (byRole.get(w.role) ?? 0) + w.weight)
  const totalWeight = [...byRole.values()].reduce((a, b) => a + b, 0)
  const roleScale = new Map<string, number>()
  if (byRole.size >= 2) {
    for (const [role, w] of byRole) {
      roleScale.set(role, w > totalWeight * 0.5 ? (totalWeight * 0.5) / w : 1)
    }
  }

  // 有効な評価が0件なら0点。prior による中間点の付与はしない（formula_version 2）
  if (weighted.length === 0) return { score: 0, count: 0 }

  let wSum = 0
  let wrSum = 0
  for (const w of weighted) {
    const scale = roleScale.get(w.role) ?? 1
    wSum += w.weight * scale
    wrSum += w.rating * w.weight * scale
  }
  const rawMean = wrSum / wSum

  // ベイズ収縮: n=評価件数, k=4, prior=3.5（1件以上のときのみ適用）
  const n = weighted.length
  const K = 4
  const PRIOR = 3.5
  const adjusted = (n * rawMean + K * PRIOR) / (n + K)

  return { score: ((adjusted - 1) / 4) * 15, count: n }
}

/** §2-5(b) 行動シグナル(15点): 全自動算出 */
function calcBehavioralScore(payroll: PayrollRow[], contract: ContractRow | null, now: Date) {
  const cutoff = new Date(now.getFullYear() - 2, now.getMonth(), 1)
  const recent = payroll
    .filter(p => new Date(p.target_year, p.target_month - 1, 1) >= cutoff)
    .sort((a, b) => (a.target_year - b.target_year) || (a.target_month - b.target_month))

  // 昇給: 直近24か月内で基本給が前月より上昇した月がある
  let raise = false
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1].basic_salary
    const cur = recent[i].basic_salary
    if (prev !== null && cur !== null && cur > prev) { raise = true; break }
  }
  // 賞与: 直近24か月内に賞与支給あり
  const bonus = recent.some(p => (p.bonus_pay ?? 0) > 0)
  // 契約更新: new_contract_date が直近24か月内
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-01`
  const renewal = !!contract?.new_contract_date && contract.new_contract_date >= cutoffStr

  return Math.min((raise ? 6 : 0) + (bonus ? 4 : 0) + (renewal ? 5 : 0), 15)
}

// ── メイン: リアルタイム算出 ─────────────────────────────────

export async function calculateTrustScore(workerId: string): Promise<TrustScoreResult> {
  const supabase = createClient()
  const now = new Date()

  const [workerRes, contractRes, payrollRes, supportRes, qualRes, evalRes, genRes] = await Promise.all([
    supabase.from('foreign_workers')
      .select('org_id, status, residence_statuses(status_type, is_active)')
      .eq('id', workerId).single(),
    supabase.from('worker_contracts')
      .select('contract_start_date, termination_date, new_contract_date')
      .eq('worker_id', workerId).maybeSingle(),
    supabase.from('payroll_records')
      .select('target_year, target_month, basic_salary, bonus_pay')
      .eq('worker_id', workerId),
    supabase.from('support_records')
      .select('type, quarter, completed')
      .eq('worker_id', workerId),
    supabase.from('qualifications')
      .select('type, level, verified_level')
      .eq('worker_id', workerId),
    supabase.from('evaluations')
      .select('attendance_score, performance_score, compliance_score, evaluated_at, evaluator_role, quarter, excluded')
      .eq('worker_id', workerId),
    supabase.from('document_generations')
      .select('worker_id, document_id, generated_at'),
  ])

  const worker = (workerRes.data ?? null) as WorkerRow | null
  const contract = (contractRes.data ?? null) as ContractRow | null
  const payroll = (payrollRes.data ?? []) as PayrollRow[]
  const support = (supportRes.data ?? []) as SupportRow[]
  const quals = (qualRes.data ?? []) as QualificationRow[]
  const evals = (evalRes.data ?? []) as EvaluationRow[]
  const gens = (genRes.data ?? []) as GenRow[]

  const isTokutei = TOKUTEI_TYPES.includes(
    worker?.residence_statuses?.find(s => s.is_active)?.status_type ?? ''
  )
  const retired = worker?.status === 'retired'

  const continuity = calcContinuity(contract, now)
  const compliance = calcCompliance(payroll, gens, contract, workerId, isTokutei, retired, now)
  const supportCalc = calcSupport(support, contract, now)
  const qualification = calcQualification(quals)
  const interview = calcInterviewScore(evals, now)
  const behavioral = calcBehavioralScore(payroll, contract, now)
  const evaluationScore = Math.round(Math.min(interview.score + behavioral, 30))

  const items: BreakdownItem[] = [
    { key: 'continuity', label: '就労継続性', score: continuity.score, max: 20, badge: 'verified', hasData: continuity.hasData },
    { key: 'compliance', label: '賃金・届出コンプラ', score: compliance.score, max: 20, badge: 'verified', hasData: compliance.hasData },
    { key: 'support', label: '支援実施・参加', score: supportCalc.score, max: 15, badge: 'verified', hasData: supportCalc.hasData },
    { key: 'qualification', label: '資格・日本語', score: qualification.score, max: 15, badge: qualification.badge, hasData: qualification.hasData },
    {
      key: 'evaluation', label: '雇用主評価', score: evaluationScore, max: 30, badge: 'subjective',
      // 行動シグナルの算定基盤（契約 or 賃金台帳）があれば評価未入力でもデータありとみなす
      hasData: interview.count > 0 || contract !== null || payroll.length > 0,
      detail: { interview: Math.round(interview.score), behavioral: Math.round(behavioral), interviewCount: interview.count },
    },
  ]

  // データ充足度: 算出に必要なデータの存在率（重み付き）
  const sufficiency =
    (continuity.hasData ? 0.2 : 0) +
    compliance.payrollRatio * 0.3 +
    supportCalc.interviewRatio * 0.2 +
    (qualification.hasData ? 0.15 : 0) +
    (interview.count > 0 ? 0.15 : 0)

  // 表示分岐（緑/橙/灰）。橙「要対応」は特定技能で在職3ヶ月超なのに面談・評価が皆無な場合。
  const tenureMonths = contract?.contract_start_date
    ? monthsBetween(new Date(contract.contract_start_date), now)
    : 0
  const interviewCount = support.filter(r => r.type === 'interview_worker' && r.completed).length
  const branch = deriveTrustBranch({
    dataSufficiency: Math.round(sufficiency * 100) / 100,
    isTokutei,
    tenureMonths,
    interviewCount,
    evaluationCount: evals.length,
  })

  return {
    formula_version: FORMULA_VERSION,
    total: items.reduce((a, b) => a + b.score, 0),
    data_sufficiency: Math.round(sufficiency * 100) / 100,
    items,
    branch,
  }
}

// ── 月次スナップショット（レイジー作成） ─────────────────────

/**
 * 当月のスナップショットが未作成なら作成する（§4）。
 * 戻り値は推移グラフ用の全スナップショット（month 昇順）。
 */
export async function getOrCreateMonthlySnapshot(
  workerId: string,
  orgId: string,
  result: TrustScoreResult,
): Promise<SnapshotRow[]> {
  const supabase = createClient()
  const month = monthKey(new Date())

  const { data: existing } = await supabase
    .from('trust_score_snapshots')
    .select('month, total, data_sufficiency, calculated_at')
    .eq('worker_id', workerId)
    .order('month', { ascending: true })

  const rows = (existing ?? []) as SnapshotRow[]
  if (!rows.some(r => r.month === month)) {
    const { data: inserted, error } = await supabase
      .from('trust_score_snapshots')
      .insert({
        organization_id: orgId,
        worker_id: workerId,
        month,
        total: result.total,
        breakdown: { formula_version: result.formula_version, total: result.total, data_sufficiency: result.data_sufficiency, items: result.items },
        data_sufficiency: result.data_sufficiency,
        formula_version: result.formula_version,
      })
      .select('month, total, data_sufficiency, calculated_at')
    if (!error && inserted && inserted.length > 0) rows.push(inserted[0] as SnapshotRow)
  }
  return rows
}
