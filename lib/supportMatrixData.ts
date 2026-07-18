/**
 * 支援マトリクスのデータ取得・集約(マトリクスページとダッシュボードの共通正本)
 *
 * 判定ロジックは書かず、computeServiceMatrix / completionRate の結果を集めるだけ。
 * マトリクスページ(/reports/support-matrix)とダッシュボードのサマリーカードは
 * 必ずこの loader を通し、表示数値が構造的に一致することを保証する。
 */
import { createClient } from '@/lib/supabase/client'
import { ensureQuarterlyInterviewTasks, INTERVIEW_TASK_TYPES, type SupportTask } from '@/lib/supportTasks'
import { computeServiceMatrix, completionRate, type ServiceStatus } from '@/lib/supportServices'
import { resolveIndustry, type IndustryCode } from '@/lib/industry'

type WorkerRow = {
  id: string
  name_kanji: string | null
  name_romaji: string
  residence_statuses: { status_type: string | null; is_active: boolean }[]
}

export type SupportMatrixRow = {
  workerId: string
  name: string
  statuses: Record<string, ServiceStatus>
  rate: { done: number; total: number }
  /** 未完了の面談タスク(期限最近接)。⚠️/空き枠セルからフォーム直行に使う */
  interviewTaskId: string | null
  /** 在籍業界(employment_conditions.industry_field から解決)。タブ絞込みに使用 */
  industry: IndustryCode | null
}

/**
 * 特定技能1号の在職者について、義務×実施記録の判定行を取得する。
 * 面談タスクのレイジー生成(未実施面談の「要対応」を正確に表示するため)も内包。
 */
export async function loadSupportMatrixRows(): Promise<SupportMatrixRow[]> {
  const supabase = createClient()
  await ensureQuarterlyInterviewTasks()

  const { data: workers } = await supabase.from('foreign_workers')
    .select('id, name_kanji, name_romaji, residence_statuses(status_type, is_active)')
    .eq('status', 'active')
    .order('name_kanji')
  const actives = ((workers ?? []) as WorkerRow[])
    .filter(w => w.residence_statuses?.find(s => s.is_active)?.status_type === '特定技能1号')
  const ids = actives.map(w => w.id)
  if (ids.length === 0) return []

  const [recsRes, tasksRes, condsRes] = await Promise.all([
    supabase.from('support_records').select('worker_id, type, completed, quarter').in('worker_id', ids),
    supabase.from('support_tasks')
      .select('id, worker_id, task_type, status, due_date')
      .in('worker_id', ids)
      .in('task_type', [...INTERVIEW_TASK_TYPES])
      .eq('status', 'pending'),
    supabase.from('employment_conditions').select('worker_id, industry_field').in('worker_id', ids),
  ])

  const industryBy = new Map<string, IndustryCode | null>()
  for (const c of condsRes.data ?? []) industryBy.set(c.worker_id, resolveIndustry(c.industry_field))
  const recsBy = new Map<string, { type: string; completed: boolean | null; quarter: string | null }[]>()
  for (const r of recsRes.data ?? []) {
    const list = recsBy.get(r.worker_id) ?? []
    list.push({ type: r.type, completed: r.completed, quarter: r.quarter })
    recsBy.set(r.worker_id, list)
  }
  const tasksBy = new Map<string, (Pick<SupportTask, 'task_type' | 'status' | 'due_date'> & { id: string })[]>()
  for (const t of tasksRes.data ?? []) {
    const list = tasksBy.get(t.worker_id) ?? []
    list.push({ id: t.id, task_type: t.task_type, status: t.status, due_date: t.due_date })
    tasksBy.set(t.worker_id, list)
  }

  return actives.map(w => {
    const tasks = tasksBy.get(w.id) ?? []
    const matrix = computeServiceMatrix(recsBy.get(w.id) ?? [], tasks)
    const nextTask = [...tasks].sort((a, b) => a.due_date.localeCompare(b.due_date))[0]
    return {
      workerId: w.id,
      name: w.name_kanji || w.name_romaji,
      statuses: Object.fromEntries(matrix.map(m => [m.def.key, m.status])),
      rate: completionRate(matrix),
      interviewTaskId: nextTask?.id ?? null,
      industry: industryBy.get(w.id) ?? null,
    }
  })
}

export type SupportMatrixSummary = {
  /** 全体の常時義務実施率(done/total)。マトリクスの「全体の常時義務実施率」と一致 */
  rateDone: number
  rateTotal: number
  /** 要対応(⚠️)件数 = 全在職者の due セルの合計 */
  dueCount: number
  /** 対象在職者数(特定技能1号) */
  workerCount: number
}

/** 判定行の合計だけを取る(新しい集計ロジックは書かない) */
export function summarizeSupportMatrix(rows: SupportMatrixRow[]): SupportMatrixSummary {
  return {
    rateDone: rows.reduce((a, r) => a + r.rate.done, 0),
    rateTotal: rows.reduce((a, r) => a + r.rate.total, 0),
    dueCount: rows.reduce((a, r) => a + Object.values(r.statuses).filter(s => s === 'due').length, 0),
    workerCount: rows.length,
  }
}
