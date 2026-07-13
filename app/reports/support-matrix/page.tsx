'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppHeader from '@/components/AppHeader'
import {
  ensureQuarterlyInterviewTasks, INTERVIEW_TASK_TYPES, type SupportTask,
} from '@/lib/supportTasks'
import {
  SUPPORT_SERVICES_DEF, computeServiceMatrix, completionRate,
  STATUS_STYLE, STATUS_LABEL, type ServiceStatus,
} from '@/lib/supportServices'

type WorkerRow = {
  id: string
  name_kanji: string | null
  name_romaji: string
  residence_statuses: { status_type: string | null; is_active: boolean }[]
}

type RowResult = {
  workerId: string
  name: string
  statuses: { key: string; status: ServiceStatus }[]
  rate: { done: number; total: number }
}

export default function SupportMatrixPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<RowResult[]>([])

  useEffect(() => {
    const supabase = createClient()
    const load = async () => {
      // 面談タスクのレイジー生成（未実施面談の「要対応」を正確に表示するため）
      await ensureQuarterlyInterviewTasks()

      const { data: workers } = await supabase.from('foreign_workers')
        .select('id, name_kanji, name_romaji, residence_statuses(status_type, is_active)')
        .eq('status', 'active')
        .order('name_kanji')
      const actives = ((workers ?? []) as WorkerRow[])
        .filter(w => w.residence_statuses?.find(s => s.is_active)?.status_type === '特定技能1号')
      const ids = actives.map(w => w.id)

      if (ids.length === 0) { setRows([]); setLoading(false); return }

      const [recsRes, tasksRes] = await Promise.all([
        supabase.from('support_records').select('worker_id, type, completed').in('worker_id', ids),
        supabase.from('support_tasks')
          .select('worker_id, task_type, status, due_date')
          .in('worker_id', ids)
          .in('task_type', [...INTERVIEW_TASK_TYPES])
          .eq('status', 'pending'),
      ])
      const recsBy = new Map<string, { type: string; completed: boolean | null }[]>()
      for (const r of recsRes.data ?? []) {
        const list = recsBy.get(r.worker_id) ?? []
        list.push({ type: r.type, completed: r.completed })
        recsBy.set(r.worker_id, list)
      }
      const tasksBy = new Map<string, Pick<SupportTask, 'task_type' | 'status' | 'due_date'>[]>()
      for (const t of tasksRes.data ?? []) {
        const list = tasksBy.get(t.worker_id) ?? []
        list.push({ task_type: t.task_type, status: t.status, due_date: t.due_date })
        tasksBy.set(t.worker_id, list)
      }

      const result: RowResult[] = actives.map(w => {
        const matrix = computeServiceMatrix(recsBy.get(w.id) ?? [], tasksBy.get(w.id) ?? [])
        return {
          workerId: w.id,
          name: w.name_kanji || w.name_romaji,
          statuses: matrix.map(m => ({ key: m.def.key, status: m.status })),
          rate: completionRate(matrix),
        }
      })
      setRows(result)
      setLoading(false)
    }
    load()
  }, [])

  const totalRate = rows.reduce((acc, r) => ({ done: acc.done + r.rate.done, total: acc.total + r.rate.total }), { done: 0, total: 0 })

  const th: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: '#6b7280', padding: '8px 6px', textAlign: 'center',
    borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', verticalAlign: 'bottom',
  }
  const td: React.CSSProperties = { padding: '8px 6px', textAlign: 'center', borderBottom: '1px solid #f3f4f6' }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui,sans-serif' }}>
      <AppHeader currentPage="reports" />
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 24px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, color: '#111', letterSpacing: '-0.01em' }}>支援業務の実施状況</h1>
          {!loading && rows.length > 0 && (
            <span style={{ fontSize: 13, color: '#6b7280' }}>
              全体の常時義務実施率 <span data-testid="total-rate" style={{ fontWeight: 700, color: '#111' }}>{totalRate.done}/{totalRate.total}</span>
            </span>
          )}
        </div>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#6b7280' }}>
          特定技能1号の在職者について、義務的支援10業務の実施記録を一覧化した監査用レポートです。
        </p>

        {loading ? (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>読み込み中...</div>
        ) : rows.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: '#6b7280' }}>対象となる特定技能1号の在職者がいません。</div>
          </div>
        ) : (
          <>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: 'left', position: 'sticky', left: 0, background: '#fff', minWidth: 140 }}>従業員</th>
                    {SUPPORT_SERVICES_DEF.map(def => (
                      <th key={def.key} style={th} title={def.label}>
                        <div style={{ fontSize: 10, color: '#9ca3af' }}>{def.no}</div>
                        <div style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', margin: '2px auto 0', fontWeight: 600, color: '#374151' }}>{def.short}</div>
                      </th>
                    ))}
                    <th style={{ ...th, minWidth: 56 }}>実施率</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.workerId} data-testid={`matrix-worker-row`}>
                      <td style={{ ...td, textAlign: 'left', position: 'sticky', left: 0, background: '#fff' }}>
                        <button onClick={() => router.push(`/employees/${row.workerId}`)}
                          style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                          {row.name}
                        </button>
                      </td>
                      {row.statuses.map(s => {
                        const st = STATUS_STYLE[s.status]
                        return (
                          <td key={s.key} style={td}>
                            <span data-testid={`cell-${row.workerId}-${s.key}`} title={STATUS_LABEL[s.status]}
                              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, background: st.bg, color: st.color, fontSize: 13 }}>
                              {st.icon}
                            </span>
                          </td>
                        )
                      })}
                      <td style={{ ...td, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#111' }}>
                        {row.rate.done}/{row.rate.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 凡例 */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14, fontSize: 12, color: '#6b7280' }}>
              {(['done', 'due', 'not_yet', 'not_applicable'] as ServiceStatus[]).map(s => (
                <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 5, background: STATUS_STYLE[s].bg, color: STATUS_STYLE[s].color, fontSize: 12 }}>{STATUS_STYLE[s].icon}</span>
                  {STATUS_LABEL[s]}
                </span>
              ))}
              <span style={{ marginLeft: 'auto', color: '#9ca3af' }}>実施率は常時義務の業務のみを分母とします（該当なしの業務は除外）。</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
