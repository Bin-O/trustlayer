/**
 * 業界パッケージ・タスク生成エンジン（段2・one_time 専用）
 *
 * 柱4: 共通エンジン + 業界設定パッケージ（データ）。業界専用コードを書かない。
 * 既存の面談生成 ensureQuarterlyInterviewTasks とは物理分離し、並存させる
 * （task_type 名前空間が別・共有状態なし・UNIQUE 制約で重複防止）。
 *
 * 段2スコープ:
 *   - cadence==='one_time' のみ生成（countdown は行を作らず表示側で処理・recurring は段B）
 *   - 新規入社ゲート: contract_start >= today − ONBOARDING_WINDOW_DAYS のみ生成
 *     （初任講習/診断はオンボーディング用。古参へ遡及生成しない）
 */
import { createClient } from '@/lib/supabase/client'
import { resolveIndustry } from '@/lib/industry/codes'
import { industryPackageOf } from '@/lib/industry'
import type { IndustryTaskDef } from '@/lib/industry/types'

/** 一回限りタスクの period_key（四半期でない・従業員×task_type で一意） */
export const ONE_TIME_PERIOD_KEY = 'once'

/** 新規入社ゲート日数（この日数以内に契約開始した従業員のみ one_time を生成） */
export const ONBOARDING_WINDOW_DAYS = 90

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return fmtDate(d)
}

/** one_time タスクの期限を dueRule から算出（contract_start 起点のみ対応。他は null） */
function oneTimeDueDate(def: IndustryTaskDef, contractStart: string): string | null {
  if (def.dueRule.from === 'contract_start') {
    return addDays(contractStart, def.dueRule.offsetDays)
  }
  return null  // residence_expiry 起点（countdown）は行を作らない
}

/** 全業界パッケージから task_type で定義を引く（描画側のラベル解決に使用） */
export function industryTaskDefByType(taskType: string): IndustryTaskDef | null {
  for (const code of ['transport', 'manufacturing'] as const) {
    const pkg = industryPackageOf(code)
    const def = pkg?.tasks.find(t => t.key === taskType)
    if (def) return def
  }
  return null
}

type WorkerRow = { id: string; org_id: string }

/**
 * 在職者について、業界パッケージの one_time タスクを upsert する。
 * 既存行（完了含む）は ignoreDuplicates で一切上書きしない。
 */
export async function ensureIndustryTasks(now: Date = new Date()): Promise<void> {
  const supabase = createClient()
  const gateFrom = addDays(fmtDate(now), -ONBOARDING_WINDOW_DAYS)

  const [workersRes, condsRes, contractsRes] = await Promise.all([
    supabase.from('foreign_workers').select('id, org_id').eq('status', 'active'),
    supabase.from('employment_conditions').select('worker_id, industry_field'),
    supabase.from('worker_contracts').select('worker_id, contract_start_date'),
  ])
  if (workersRes.error || condsRes.error || contractsRes.error) {
    console.warn('[industryTasks] タスク生成用データの取得に失敗:',
      workersRes.error?.message ?? condsRes.error?.message ?? contractsRes.error?.message)
    return
  }

  const industryOf = new Map(
    (condsRes.data ?? []).map(c => [c.worker_id as string, c.industry_field as string | null])
  )
  const startOf = new Map(
    (contractsRes.data ?? []).map(c => [c.worker_id as string, c.contract_start_date as string | null])
  )

  const rows: { organization_id: string; worker_id: string; task_type: string; period_key: string; due_date: string }[] = []
  for (const w of (workersRes.data ?? []) as WorkerRow[]) {
    const code = resolveIndustry(industryOf.get(w.id))
    const pkg = industryPackageOf(code)
    if (!pkg) continue
    const start = startOf.get(w.id)
    if (!start) continue
    if (start < gateFrom) continue  // 新規入社ゲート（古参は遡及生成しない）

    for (const def of pkg.tasks) {
      if (def.cadence !== 'one_time') continue  // countdown/recurring は生成しない
      const due = oneTimeDueDate(def, start)
      if (!due) continue
      rows.push({
        organization_id: w.org_id,
        worker_id: w.id,
        task_type: def.key,
        period_key: ONE_TIME_PERIOD_KEY,
        due_date: due,
      })
    }
  }
  if (rows.length === 0) return

  const { error } = await supabase.from('support_tasks')
    .upsert(rows, { onConflict: 'worker_id,task_type,period_key', ignoreDuplicates: true })
  if (error) console.warn('[industryTasks] タスク生成に失敗:', error.message)
}
