'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppHeader from '@/components/AppHeader'

type Worker = {
  id: string
  name_kanji: string | null
  name_romaji: string
  nationality: string
  residence_statuses: { status_type: string; is_active: boolean }[]
}

type PayrollKey = { year: number; month: number }

type WorkerStatus = {
  worker: Worker
  present: PayrollKey[]
  missing: PayrollKey[]
}

// 年度Nの12ヶ月を返す（N年4月〜N+1年3月）
function fiscalMonths(fy: number): PayrollKey[] {
  return [
    ...Array.from({ length: 9 }, (_, i) => ({ year: fy,     month: i + 4 })),
    ...Array.from({ length: 3 }, (_, i) => ({ year: fy + 1, month: i + 1 })),
  ]
}

function currentFiscalYear() {
  const now = new Date()
  return now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1
}

const MONTH_LABELS = ['', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

export default function AnnualReportPage() {
  const router = useRouter()
  const [fy, setFy] = useState(currentFiscalYear())
  const [statuses, setStatuses] = useState<WorkerStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    setLoading(true)
    const supabase = createClient()
    ;(async () => {
      // 特定技能1号/2号のアクティブ在留資格を持つ従業員
      const { data: workers } = await supabase
        .from('foreign_workers')
        .select('id, name_kanji, name_romaji, nationality, residence_statuses(status_type, is_active)')
        .eq('status', 'active')
        .order('name_kanji')

      const targets = (workers ?? []).filter((w: Worker) =>
        w.residence_statuses?.some(
          s => s.is_active && (s.status_type === '特定技能1号' || s.status_type === '特定技能2号')
        )
      )

      if (targets.length === 0) {
        setStatuses([])
        setLoading(false)
        return
      }

      const workerIds = targets.map((w: Worker) => w.id)
      const expected = fiscalMonths(fy)

      // 年度をまたぐ2条件をorで取得
      const { data: records } = await supabase
        .from('payroll_records')
        .select('worker_id, target_year, target_month')
        .or(
          `and(target_year.eq.${fy},target_month.gte.4),` +
          `and(target_year.eq.${fy + 1},target_month.lte.3)`
        )
        .in('worker_id', workerIds)

      const result: WorkerStatus[] = targets.map((w: Worker) => {
        const mine = (records ?? []).filter((r: { worker_id: string }) => r.worker_id === w.id)
        const present: PayrollKey[] = []
        const missing: PayrollKey[] = []
        for (const m of expected) {
          const found = mine.some(
            (r: { target_year: number; target_month: number }) =>
              r.target_year === m.year && r.target_month === m.month
          )
          if (found) present.push(m); else missing.push(m)
        }
        return { worker: w, present, missing }
      })

      setStatuses(result)
      setLoading(false)
    })()
  }, [fy])

  const allReady = statuses.length > 0 && statuses.every(s => s.missing.length === 0)

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: 'teiki_hokoku', fiscalYear: fy }),
      })
      if (!res.ok) {
        const { error } = await res.json()
        alert(`生成エラー: ${error}`)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `定期届出_${fy}年度.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('生成中にエラーが発生しました')
    } finally {
      setGenerating(false)
    }
  }

  const getStatusType = (w: Worker) =>
    w.residence_statuses?.find(s => s.is_active)?.status_type ?? '—'

  const formatMissing = (keys: PayrollKey[]) =>
    keys.map(k => `${k.year}年${MONTH_LABELS[k.month]}`).join('、')

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui,sans-serif' }}>
      <AppHeader currentPage="reports" />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
        {/* ページヘッダー */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#000' }}>定期届出（参考様式第3-6号）</h1>
          <p style={{ margin: 0, fontSize: 14, color: '#666' }}>対象者の賃金台帳充足状況を確認し、定期届出書を生成します</p>
        </div>

        {/* 年度セレクター */}
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 12, padding: '16px 24px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>対象年度</span>
          <button
            onClick={() => setFy(n => n - 1)}
            style={{ background: '#f0f0f0', border: 'none', borderRadius: 6, width: 32, height: 32, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333' }}>
            ‹
          </button>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#000', minWidth: 220, textAlign: 'center' }}>
            {fy}年度（{fy}/4 〜 {fy + 1}/3）
          </span>
          <button
            onClick={() => setFy(n => n + 1)}
            style={{ background: '#f0f0f0', border: 'none', borderRadius: 6, width: 32, height: 32, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333' }}>
            ›
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#888' }}>対象者</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#000' }}>{loading ? '—' : `${statuses.length}名`}</span>
          </div>
        </div>

        {/* 一括生成ボタン */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button
            disabled={!allReady || loading || generating}
            onClick={handleGenerate}
            style={{
              padding: '11px 24px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700,
              cursor: allReady && !generating ? 'pointer' : 'not-allowed',
              background: allReady && !generating ? '#0066cc' : '#e5e7eb',
              color: allReady && !generating ? '#fff' : '#9ca3af',
              transition: 'background 0.2s',
            }}>
            {generating ? '⏳ 生成中...' : '📄 定期届出書を一括生成'}
          </button>
        </div>

        {/* サマリーバー */}
        {!loading && statuses.length > 0 && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1, background: allReady ? '#dcfce7' : '#fff', border: `1px solid ${allReady ? '#86efac' : '#e0e0e0'}`, borderRadius: 10, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
              {allReady
                ? <><span style={{ fontSize: 20 }}>✅</span><span style={{ fontSize: 14, fontWeight: 600, color: '#15803d' }}>全員の賃金台帳が揃っています。届出書を生成できます。</span></>
                : <>
                    <span style={{ fontSize: 20 }}>⚠️</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#b45309' }}>
                      {statuses.filter(s => s.missing.length > 0).length}名の賃金台帳が不足しています
                    </span>
                  </>
              }
            </div>
          </div>
        )}

        {/* 対象者一覧 */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#666' }}>読み込み中...</div>
        ) : statuses.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 12, padding: 48, textAlign: 'center', color: '#888', fontSize: 14 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
            特定技能1号・2号の在籍者がいません
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {statuses.map(({ worker, present, missing }) => {
              const ready = missing.length === 0
              return (
                <div key={worker.id}
                  style={{ background: '#fff', border: `1px solid ${ready ? '#e0e0e0' : '#fecaca'}`, borderRadius: 12, padding: '18px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                    {/* 従業員情報 */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: '#000' }}>{worker.name_kanji || worker.name_romaji}</span>
                        <span style={{ background: '#f0f4ff', color: '#3b5bdb', fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                          {getStatusType(worker)}
                        </span>
                        {/* ステータスバッジ */}
                        <span style={{
                          background: ready ? '#dcfce7' : '#fee2e2',
                          color: ready ? '#15803d' : '#dc2626',
                          fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
                        }}>
                          {ready ? '✅ 作成可能' : '❌ 台帳不足'}
                        </span>
                      </div>

                      {/* 充足状況バー */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: ready ? 0 : 10 }}>
                        <div style={{ display: 'flex', gap: 3 }}>
                          {fiscalMonths(fy).map((m, i) => {
                            const ok = present.some(p => p.year === m.year && p.month === m.month)
                            return (
                              <div key={i} title={`${m.year}年${MONTH_LABELS[m.month]}`}
                                style={{ width: 20, height: 20, borderRadius: 3, background: ok ? '#16a34a' : '#fca5a5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: ok ? '#fff' : '#7f1d1d', fontWeight: 700 }}>
                                {m.month}
                              </div>
                            )
                          })}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: ready ? '#15803d' : '#dc2626' }}>
                          {present.length}/12ヶ月
                          {!ready && `（${missing.length}ヶ月不足）`}
                        </span>
                      </div>

                      {/* 不足月の詳細 */}
                      {!ready && (
                        <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '6px 10px', display: 'inline-block' }}>
                          不足月：{formatMissing(missing)}
                        </div>
                      )}
                    </div>

                    {/* アクション */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
                      {!ready && (
                        <button
                          onClick={() => router.push(`/employees/${worker.id}/payroll`)}
                          style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #dc2626', background: '#fff', color: '#dc2626', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          賃金台帳を登録 →
                        </button>
                      )}
                      <button
                        onClick={() => router.push(`/employees/${worker.id}`)}
                        style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d0d0d0', background: '#fff', color: '#555', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        従業員詳細
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* 凡例 */}
        {!loading && statuses.length > 0 && (
          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: '#888' }}>
            <span>月別ブロック凡例：</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 16, height: 16, borderRadius: 3, background: '#16a34a' }} />
              <span>登録済み</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 16, height: 16, borderRadius: 3, background: '#fca5a5' }} />
              <span>未登録</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
