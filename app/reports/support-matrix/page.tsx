'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppHeader from '@/components/AppHeader'
import SupportStatusGlyph from '@/components/SupportStatusGlyph'
import {
  ensureQuarterlyInterviewTasks, INTERVIEW_TASK_TYPES, type SupportTask,
} from '@/lib/supportTasks'
import {
  SUPPORT_SERVICES_MATRIX_ORDER, STAGE_LABEL,
  computeServiceMatrix, completionRate,
  STATUS_LABEL, STATUS_LEGEND_NOTE,
  type ServiceStatus, type SupportServiceDef, type LifecycleStage,
} from '@/lib/supportServices'
import { COMMON_OBLIGATIONS, STAGE_PERIOD_NOTE } from '@/lib/obligations'
import { resolveIndustry, industryPackageOf, type IndustryCode, type IndustryPackage } from '@/lib/industry'
import { ArrowRight } from 'lucide-react'

type WorkerRow = {
  id: string
  name_kanji: string | null
  name_romaji: string
  residence_statuses: { status_type: string | null; is_active: boolean }[]
}

type RowResult = {
  workerId: string
  name: string
  statuses: Record<string, ServiceStatus>
  rate: { done: number; total: number }
  /** 未完了の面談タスク(期限最近接)。⚠️/空き枠セルからフォーム直行に使う */
  interviewTaskId: string | null
  /** 在籍業界(employment_conditions.industry_field から解決)。タブ絞込みに使用 */
  industry: IndustryCode | null
}

/** 叙事層の4段骨格の描画順 */
const FLOW_STAGES: LifecycleStage[] = ['pre_hire', 'onboarding', 'employed', 'offboarding']

const SERIF = "'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif"

/** 義務1行の表示。未実装は灰色破線+「— 対応予定」(4色体系と衝突しない灰のみ) */
function ObligationRow({ text, implemented, legalBasis }: {
  text: string; implemented: boolean; legalBasis?: string
}) {
  const color = implemented ? '#374151' : '#9ca3af'
  // 注記(トリガー条件・周期)を欠かさないため省略せず折り返す
  return (
    <div title={legalBasis} style={{ fontSize: 11, color, lineHeight: 1.7 }}>
      {implemented ? text : <span style={{ borderBottom: '1px dashed #d1d5db' }}>{text} — 対応予定</span>}
    </div>
  )
}

/**
 * 叙事層(読む層): 4段の工程カード+矢印。共通義務は常に表示し、業界層は
 * 在籍従業員の業界パッケージから純導出(タブ選択時は当該業界のみ)。
 * 明朝体の段名でデータ格子(引く層)と書体を分離する。
 */
function ObligationFlowStrip({ packages, activeIndustry }: {
  packages: IndustryPackage[]
  activeIndustry: IndustryCode | 'all'
}) {
  const visiblePkgs = activeIndustry === 'all' ? packages : packages.filter(p => p.code === activeIndustry)
  return (
    <div data-testid="obligation-flow-strip" style={{ display: 'flex', alignItems: 'stretch', marginBottom: 16 }}>
      {FLOW_STAGES.map((stage, i) => {
        const common = COMMON_OBLIGATIONS.filter(o => o.stage === stage)
        // 業界層: 同一文言(協議会加入等)は業界タグをまとめて1行に統合する
        const industryLines = new Map<string, { tags: string[]; implemented: boolean; legalBasis?: string }>()
        for (const pkg of visiblePkgs) {
          for (const o of pkg.obligations.filter(o => o.stage === stage)) {
            const line = industryLines.get(o.text)
            if (line) line.tags.push(pkg.labelShort)
            else industryLines.set(o.text, { tags: [pkg.labelShort], implemented: o.implemented, legalBasis: o.legalBasis })
          }
        }
        return (
          <div key={stage} style={{ display: 'contents' }}>
            {i > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', padding: '0 2px', color: '#9ca3af', flexShrink: 0 }}>
                <ArrowRight size={14} strokeWidth={2} />
              </div>
            )}
            <div data-testid={`flow-stage-${stage}`}
              style={{ flex: 1, minWidth: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 600, color: '#111827', letterSpacing: '0.08em' }}>
                {STAGE_LABEL[stage]}
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 10, color: '#9ca3af', marginBottom: 5 }}>{STAGE_PERIOD_NOTE[stage]}</div>
              {common.map(o => (
                <ObligationRow key={o.key} text={o.text} implemented={o.implemented} legalBasis={o.legalBasis} />
              ))}
              {industryLines.size > 0 && (
                <div style={{ borderTop: '1px dashed #f3f4f6', marginTop: 5, paddingTop: 4 }}>
                  {[...industryLines.entries()].map(([text, line]) => (
                    <div key={text} title={line.legalBasis}
                      style={{ fontSize: 11, color: line.implemented ? '#6b7280' : '#9ca3af', lineHeight: 1.7 }}>
                      {line.tags.map(t => (
                        <span key={t} style={{ border: '1px solid #e5e7eb', borderRadius: 3, padding: '0 3px', color: '#9ca3af', fontSize: 10, marginRight: 3 }}>{t}</span>
                      ))}
                      {line.implemented ? text : <span style={{ borderBottom: '1px dashed #d1d5db' }}>{text} — 対応予定</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** 工程順の列を段階ごとに区切るためのグループ(colSpan と境界罫線の計算) */
const STAGE_GROUPS: { stage: LifecycleStage; span: number }[] = (() => {
  const groups: { stage: LifecycleStage; span: number }[] = []
  for (const def of SUPPORT_SERVICES_MATRIX_ORDER) {
    const last = groups[groups.length - 1]
    if (last && last.stage === def.stage) last.span++
    else groups.push({ stage: def.stage, span: 1 })
  }
  return groups
})()

/** 段階の先頭列(グループ境界の縦罫線を引く列)の key 集合 */
const STAGE_FIRST_KEYS = new Set(
  STAGE_GROUPS.reduce<{ keys: string[]; idx: number }>((acc, g) => {
    acc.keys.push(SUPPORT_SERVICES_MATRIX_ORDER[acc.idx].key)
    acc.idx += g.span
    return acc
  }, { keys: [], idx: 0 }).keys,
)

/** セルの title(操作ヒント込み)。記号の意味+クリック先を1行で伝える */
function cellHint(def: SupportServiceDef, status: ServiceStatus): string {
  const base = STATUS_LABEL[status]
  if (def.key === 'interview' && status !== 'done') return `${base} — クリックで面談を記録`
  if (status === 'done') return `${base} — クリックで記録を確認`
  return `${base} — クリックで詳細を確認`
}

export default function SupportMatrixPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<RowResult[]>([])
  // 業界タブ(在籍業界が2つ以上の場合のみ表示)。'all'=共通層+全在籍業界層
  const [tab, setTab] = useState<IndustryCode | 'all'>('all')

  useEffect(() => {
    const supabase = createClient()
    const load = async () => {
      // 面談タスクのレイジー生成(未実施面談の「要対応」を正確に表示するため)
      await ensureQuarterlyInterviewTasks()

      const { data: workers } = await supabase.from('foreign_workers')
        .select('id, name_kanji, name_romaji, residence_statuses(status_type, is_active)')
        .eq('status', 'active')
        .order('name_kanji')
      const actives = ((workers ?? []) as WorkerRow[])
        .filter(w => w.residence_statuses?.find(s => s.is_active)?.status_type === '特定技能1号')
      const ids = actives.map(w => w.id)

      if (ids.length === 0) { setRows([]); setLoading(false); return }

      const [recsRes, tasksRes, condsRes] = await Promise.all([
        supabase.from('support_records').select('worker_id, type, completed, quarter').in('worker_id', ids),
        supabase.from('support_tasks')
          .select('id, worker_id, task_type, status, due_date')
          .in('worker_id', ids)
          .in('task_type', [...INTERVIEW_TASK_TYPES])
          .eq('status', 'pending'),
        // 叙事層の業界層・タブの導出元(在籍従業員の業界フィールド)
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

      const result: RowResult[] = actives.map(w => {
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
      setRows(result)
      setLoading(false)
    }
    load()
  }, [])

  // 在籍業界のパッケージ(純導出)。2つ以上ある場合のみタブを表示する
  const presentPackages = [...new Set(rows.map(r => r.industry).filter((c): c is IndustryCode => c !== null))]
    .map(c => industryPackageOf(c))
    .filter((p): p is IndustryPackage => p !== null)
  const visibleRows = tab === 'all' ? rows : rows.filter(r => r.industry === tab)
  const rateScope = tab === 'all' ? '全体' : (presentPackages.find(p => p.code === tab)?.labelShort ?? '')
  const totalRate = visibleRows.reduce((acc, r) => ({ done: acc.done + r.rate.done, total: acc.total + r.rate.total }), { done: 0, total: 0 })

  // セルクリック: 面談の未完了(要対応/未実施)は面談フォーム直行、それ以外は詳細の該当セクションへ
  const openCell = (row: RowResult, def: SupportServiceDef, status: ServiceStatus) => {
    if (def.key === 'interview') {
      if (status !== 'done' && row.interviewTaskId) {
        router.push(`/employees/${row.workerId}?task=${row.interviewTaskId}`)
        return
      }
      router.push(`/employees/${row.workerId}?section=interviews`)
      return
    }
    router.push(`/employees/${row.workerId}?section=support`)
  }

  const th: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: '#6b7280', padding: '8px 6px', textAlign: 'center',
    borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', verticalAlign: 'bottom',
  }
  const td: React.CSSProperties = { padding: '8px 6px', textAlign: 'center', borderBottom: '1px solid #f3f4f6' }
  const groupBorderTh: React.CSSProperties = { borderLeft: '1px solid #e5e7eb' }
  const groupBorderTd: React.CSSProperties = { borderLeft: '1px solid #f3f4f6' }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui,sans-serif' }}>
      {/* ホバー時の視覚フィードバック(クリック可の合図)。stickyセルはinline背景のためクラスで上書き */}
      <style>{`
        .mx-cell-btn { background: none; border: none; padding: 0; cursor: pointer; border-radius: 6px; display: inline-flex; }
        .mx-cell-btn:hover, .mx-cell-btn:focus-visible { box-shadow: 0 0 0 2px #bfdbfe; outline: none; }
        .mx-row:hover td { background: #f9fafb !important; }
        .mx-name-btn:hover { text-decoration: underline; }
        .mx-th { position: relative; }
        .mx-th .mx-tip { display: none; }
        .mx-th:hover .mx-tip { display: block; }
      `}</style>
      <AppHeader currentPage="reports" />
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 24px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, color: '#111', letterSpacing: '-0.01em' }}>支援・義務フロー — 入社前から離職まで</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* 業界タブ: 在籍業界が2つ以上の場合のみ表示(1業界の会社ではタブなし) */}
            {presentPackages.length >= 2 && (
              <div style={{ display: 'flex', gap: 4 }}>
                {([{ code: 'all' as const, labelShort: '全体' }, ...presentPackages]).map(p => {
                  const active = tab === p.code
                  return (
                    <button key={p.code} data-testid={`industry-tab-${p.code}`}
                      onClick={() => setTab(p.code as IndustryCode | 'all')}
                      style={{
                        fontSize: 12, fontWeight: active ? 600 : 400, padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
                        background: active ? '#eff6ff' : '#fff', color: active ? '#2563eb' : '#6b7280',
                        border: `1px solid ${active ? '#bfdbfe' : '#e5e7eb'}`,
                      }}>
                      {p.labelShort}
                    </button>
                  )
                })}
              </div>
            )}
            {!loading && rows.length > 0 && (
              <span style={{ fontSize: 13, color: '#6b7280' }}>
                {rateScope}の常時義務実施率 <span data-testid="total-rate" style={{ fontWeight: 700, color: '#111' }}>{totalRate.done}/{totalRate.total}</span>
              </span>
            )}
          </div>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
          特定技能1号の在職者{!loading && rows.length > 0 ? `${rows.length}名(${presentPackages.map(p => `${p.labelShort}${rows.filter(r => r.industry === p.code).length}`).join('・')})` : ''}について、雇用ライフサイクル上の義務と実施記録を一覧化した監査用レポートです。セルをクリックすると記録・詳細に移動します。
          <span style={{ marginLeft: 10, color: '#374151', whiteSpace: 'nowrap' }}>◆ 全員一律</span>
          <span style={{ marginLeft: 6, color: '#374151', whiteSpace: 'nowrap' }}>◇ 条件触発</span>
          <span style={{ marginLeft: 6, color: '#9ca3af', whiteSpace: 'nowrap' }}>破線=対応予定</span>
        </p>

        {loading ? (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>読み込み中...</div>
        ) : rows.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: '#6b7280' }}>対象となる特定技能1号の在職者がいません。</div>
          </div>
        ) : (
          <>
            {/* 叙事層(読む層): 4段の工程軸。データ格子(引く層)とは書体・階層で分離 */}
            <ObligationFlowStrip packages={presentPackages} activeIndustry={tab} />
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
                <thead>
                  {/* 雇用ライフサイクルの段階帯(入社前→入社時→在職中) */}
                  <tr>
                    <th style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 1 }} />
                    {STAGE_GROUPS.map(g => (
                      <th key={g.stage} colSpan={g.span}
                        style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', padding: '4px 0', letterSpacing: '0.06em' }}>
                        {STAGE_LABEL[g.stage]}
                      </th>
                    ))}
                    <th />
                  </tr>
                  <tr>
                    <th style={{ ...th, textAlign: 'left', position: 'sticky', left: 0, background: '#fff', minWidth: 140, zIndex: 1 }}>従業員</th>
                    {SUPPORT_SERVICES_MATRIX_ORDER.map(def => (
                      <th key={def.key} className="mx-th"
                        aria-label={`${def.no}. ${def.label} — ${def.desc}`}
                        style={{ ...th, ...(STAGE_FIRST_KEYS.has(def.key) ? groupBorderTh : null) }}>
                        <div style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af' }}>{def.no}</div>
                        <div style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', margin: '4px auto 0', fontSize: 12, fontWeight: 600, color: '#374151' }}>{def.short}</div>
                        {/* 表頭tooltip: 正式名称+義務の一句説明(title属性では2階層を表現できないため) */}
                        <div className="mx-tip" style={{
                          position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', zIndex: 20,
                          width: 230, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
                          boxShadow: '0 8px 32px rgba(0,0,0,0.18)', padding: '8px 10px', textAlign: 'left', whiteSpace: 'normal',
                        }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{def.no}. {def.label}</div>
                          <div style={{ fontSize: 11, fontWeight: 400, color: '#6b7280', lineHeight: 1.5, marginTop: 2 }}>{def.desc}</div>
                        </div>
                      </th>
                    ))}
                    <th style={{ ...th, minWidth: 56 }}>実施率</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(row => (
                    <tr key={row.workerId} className="mx-row" data-testid={`matrix-worker-row`}>
                      <td style={{ ...td, textAlign: 'left', position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>
                        <button onClick={() => router.push(`/employees/${row.workerId}`)} className="mx-name-btn"
                          style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 13, fontWeight: 500, cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                          {row.name}
                        </button>
                      </td>
                      {SUPPORT_SERVICES_MATRIX_ORDER.map(def => {
                        const status = row.statuses[def.key]
                        return (
                          <td key={def.key} style={{ ...td, ...(STAGE_FIRST_KEYS.has(def.key) ? groupBorderTd : null) }}>
                            <button className="mx-cell-btn"
                              data-testid={`cell-${row.workerId}-${def.key}`}
                              data-status={status}
                              title={cellHint(def, status)}
                              aria-label={`${row.name} ${def.label}: ${STATUS_LABEL[status]}`}
                              onClick={() => openCell(row, def, status)}>
                              <SupportStatusGlyph status={status} />
                            </button>
                          </td>
                        )
                      })}
                      <td style={{ ...td, fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#111' }}>
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
                  <SupportStatusGlyph status={s} size={22} />
                  {STATUS_LEGEND_NOTE[s]}
                </span>
              ))}
              <span style={{ marginLeft: 'auto', color: '#9ca3af' }}>実施率は常時義務の業務のみを分母とします(該当なしの業務は除外)。</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
