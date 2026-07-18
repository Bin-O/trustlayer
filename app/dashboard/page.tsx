'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppHeader from '@/components/AppHeader'
import { getActiveAnnouncements } from '@/lib/announcements'
import { ensureQuarterlyInterviewTasks, interviewVariantOf, INTERVIEW_TASK_TYPES } from '@/lib/supportTasks'
import { loadSupportMatrixRows, summarizeSupportMatrix, type SupportMatrixSummary } from '@/lib/supportMatrixData'
import { ensureIndustryTasks, industryTaskDefByType } from '@/lib/industryTasks'
import { SUBTYPE_TOKUTEI_KATSUDO_55 } from '@/lib/industry/packages/transport'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { Megaphone, ClipboardList, CheckCircle2 } from 'lucide-react'
import { semantic } from '@/lib/ui/tokens'

const TOKUTEI_TYPES = ['特定技能1号', '特定技能2号']

type ResidenceStatus = {
  status_type: string | null
  status_subtype: string | null
  expiry_date: string | null
  is_active: boolean
}

type WorkerRow = {
  id: string
  name_kanji: string | null
  name_romaji: string
  nationality: string | null
  residence_statuses: ResidenceStatus[]
}

type ContractRow = {
  worker_id: string
  contract_start_date: string | null
  termination_date: string | null
}

type GenRow = {
  worker_id: string | null
  document_id: string
  generated_at: string
}

type TaskRow = {
  id: string
  worker_id: string
  task_type: string
  period_key: string
  due_date: string
}

type TimelineKind = 'expiry' | 'todoke' | 'mendan' | 'industry'
type TlFilter = 'all' | TimelineKind

type TimelineItem = {
  key: string
  kind: TimelineKind
  due: string
  urgency: 'red' | 'amber' | 'gray'
  title: string
  detail: string
  actionLabel: string
  href: string
  badge?: string  // 特記バッジ（例: 特定活動55号の「更新不可」）
}

type Dist = { name: string; value: number }

type Snapshot = {
  headcount: number
  tokutei1: number
  tokutei2: number
  expiry30: number
  expiry60: number
  expiry90: number
  todokeCount: number
  mendanCount: number
  payrollMissingCount: number
  timeline: TimelineItem[]
  nationalityDist: Dist[]
  statusTypeDist: Dist[]
  expiryDist: { label: string; count: number; color: string }[]
}

// 4色体系(docs/product-direction.md 原則3): 期日前タスクは灰。緑は完了・検証済にのみ使う
const URGENCY_COLOR = { red: semantic.red.text, amber: semantic.orange.text, gray: '#9ca3af' } as const
const DONE_GREEN = semantic.green.text
const KIND_LABEL: Record<TimelineKind, string> = { expiry: '在留期限', todoke: '届出', mendan: '面談', industry: '業界研修' }

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysUntil(dateStr: string, now: Date): number {
  return Math.ceil((new Date(dateStr).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return fmtDate(d)
}

/** 年度Nの12ヶ月（N年4月〜N+1年3月） */
function fiscalMonths(fy: number): { year: number; month: number }[] {
  return [
    ...Array.from({ length: 9 }, (_, i) => ({ year: fy, month: i + 4 })),
    ...Array.from({ length: 3 }, (_, i) => ({ year: fy + 1, month: i + 1 })),
  ]
}

function currentFiscalYear(now: Date): number {
  return now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1
}

function buildSnapshot(
  actives: WorkerRow[],
  retired: WorkerRow[],
  contracts: ContractRow[],
  gens: GenRow[],
  tasks: TaskRow[],
  industryTasks: TaskRow[],
  payrollKeys: Set<string>,
  now: Date,
): Snapshot {
  const contractOf = new Map(contracts.map(c => [c.worker_id, c]))
  const activeStatusOf = (w: WorkerRow) => w.residence_statuses?.find(s => s.is_active)
  const nameOf = (w: WorkerRow) => w.name_kanji || w.name_romaji
  const isTokutei = (w: WorkerRow) => TOKUTEI_TYPES.includes(activeStatusOf(w)?.status_type ?? '')

  const timeline: TimelineItem[] = []

  // ── 在留期限（全在留資格の在職者） ──
  let expiry30 = 0, expiry60 = 0, expiry90 = 0, expiryOver90 = 0, expiryUnknown = 0
  for (const w of actives) {
    const st = activeStatusOf(w)
    if (!st?.expiry_date) { expiryUnknown++; continue }
    const d = daysUntil(st.expiry_date, now)
    if (d <= 30) expiry30++
    else if (d <= 60) expiry60++
    else if (d <= 90) expiry90++
    else expiryOver90++

    if (d <= 90) {
      // 特定活動55号は更新不可の時限資格。期限内に免許取得→特技1号変更申請が必要
      const is55 = st.status_subtype === SUBTYPE_TOKUTEI_KATSUDO_55
      timeline.push({
        key: `expiry-${w.id}`,
        kind: 'expiry',
        due: st.expiry_date,
        // 在留期限は回復不能のため ≤30日=赤 / 31〜60日=橙 / 61〜90日=灰(赤の例外規定)
        urgency: d <= 30 ? 'red' : d <= 60 ? 'amber' : 'gray',
        title: `${nameOf(w)}さんの在留期限`,
        detail: is55
          ? (d < 0 ? `期限を${-d}日超過（${st.expiry_date}）／免許取得→特技1号変更が必要`
                   : `残り${d}日（${st.expiry_date}）／免許取得→特技1号変更が必要`)
          : (d < 0 ? `期限を${-d}日超過しています（${st.expiry_date}）` : `残り${d}日（${st.expiry_date}）`),
        actionLabel: '従業員詳細へ',
        href: `/employees/${w.id}`,
        ...(is55 ? { badge: '更新不可' } : {}),
      })
    }
  }

  // ── 未対応の届出①：3-1-2号（特定技能の退職者・退職日以降に生成記録なし） ──
  let todoke312 = 0
  for (const w of retired) {
    if (!isTokutei(w)) continue
    const termination = contractOf.get(w.id)?.termination_date
    if (!termination) continue
    const done = gens.some(g =>
      g.worker_id === w.id &&
      g.document_id === 'todoke_keiyaku_shuryo' &&
      g.generated_at.slice(0, 10) >= termination
    )
    if (done) continue
    todoke312++
    const due = addDays(termination, 14)
    const d = daysUntil(due, now)
    timeline.push({
      key: `todoke312-${w.id}`,
      kind: 'todoke',
      due,
      urgency: d < 0 ? 'red' : 'amber',
      title: `${nameOf(w)}さんの契約終了届出（3-1-2号）`,
      detail: d < 0
        ? `届出期限を${-d}日超過（退職日 ${termination}・期限 ${due}）`
        : `退職日 ${termination}・届出期限 ${due}`,
      actionLabel: '届出を作成',
      href: `/employees/${w.id}`,
    })
  }

  // ── 未対応の届出②：定期届出3-6号（前年度分・提出期間開始後に生成記録なし） ──
  const tokuteiActives = actives.filter(isTokutei)
  let teikiPending = 0
  const prevFy = currentFiscalYear(now) - 1
  const windowStart = `${prevFy + 1}-04-01`
  if (tokuteiActives.length > 0 && fmtDate(now) >= windowStart) {
    const done = gens.some(g => g.document_id === 'teiki_hokoku' && g.generated_at.slice(0, 10) >= windowStart)
    if (!done) {
      teikiPending = 1
      const due = `${prevFy + 1}-05-31`
      const d = daysUntil(due, now)
      timeline.push({
        key: 'teiki-todoke',
        kind: 'todoke',
        due,
        urgency: d < 0 ? 'red' : 'amber',
        title: `定期届出（${prevFy}年度分・参考様式第3-6号）`,
        detail: d < 0 ? `提出期限を${-d}日超過（期限 ${due}）` : `提出期限 ${due}`,
        actionLabel: '定期届出ページへ',
        href: '/reports/annual',
      })
    }
  }

  // ── 面談タスク：四半期面談（support_tasks の未完了分・特定技能1号） ──
  let mendanCount = 0
  const activeNameOf = new Map(actives.map(w => [w.id, nameOf(w)]))
  for (const t of tasks) {
    const name = activeNameOf.get(t.worker_id)
    if (!name) continue  // 退職者等・在職一覧にいない従業員のタスクは表示しない
    mendanCount++
    const d = daysUntil(t.due_date, now)
    timeline.push({
      key: `mendan-${t.id}`,
      kind: 'mendan',
      due: t.due_date,
      urgency: d < 0 ? 'red' : d <= 14 ? 'amber' : 'gray',
      title: interviewVariantOf(t.task_type) === 'supervisor'
        ? `${name}さんの監督者面談（${t.period_key}）`
        : `${name}さんの四半期面談（${t.period_key}）`,
      detail: d < 0 ? `期限を${-d}日超過しています（期限 ${t.due_date}）` : `期限 ${t.due_date}（残り${d}日）`,
      actionLabel: '面談を記録',
      href: `/employees/${t.worker_id}?task=${t.id}`,
    })
  }

  // ── 業界パッケージ由来の一回限りタスク（初任講習・初任診断等・在職者分） ──
  for (const t of industryTasks) {
    const name = activeNameOf.get(t.worker_id)
    if (!name) continue
    const def = industryTaskDefByType(t.task_type)
    const d = daysUntil(t.due_date, now)
    timeline.push({
      key: `industry-${t.id}`,
      kind: 'industry',
      due: t.due_date,
      urgency: d < 0 ? 'red' : d <= 14 ? 'amber' : 'gray',
      title: `${name}さんの${def?.label ?? t.task_type}`,
      detail: d < 0 ? `期限を${-d}日超過しています（期限 ${t.due_date}）` : `期限 ${t.due_date}（残り${d}日）`,
      actionLabel: '従業員詳細へ',
      href: `/employees/${t.worker_id}`,
    })
  }

  // ── 賃金台帳：今年度の経過月に未登録がある特定技能の在職者数 ──
  const fy = currentFiscalYear(now)
  const currentYm = now.getFullYear() * 100 + (now.getMonth() + 1)
  const expected = fiscalMonths(fy).filter(m => m.year * 100 + m.month < currentYm)
  let payrollMissingCount = 0
  if (expected.length > 0) {
    for (const w of tokuteiActives) {
      const missing = expected.some(m => !payrollKeys.has(`${w.id}:${m.year}:${m.month}`))
      if (missing) payrollMissingCount++
    }
  }

  // ── タイムラインを期日順（同日なら緊急度順）に整列 ──
  const rank = { red: 0, amber: 1, gray: 2 }
  timeline.sort((a, b) => a.due.localeCompare(b.due) || rank[a.urgency] - rank[b.urgency])

  // ── 全体ヘルス ──
  const groupBy = (items: WorkerRow[], keyFn: (w: WorkerRow) => string): Dist[] => {
    const map = new Map<string, number>()
    for (const w of items) {
      const k = keyFn(w)
      map.set(k, (map.get(k) ?? 0) + 1)
    }
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }

  return {
    headcount: actives.length,
    tokutei1: actives.filter(w => activeStatusOf(w)?.status_type === '特定技能1号').length,
    tokutei2: actives.filter(w => activeStatusOf(w)?.status_type === '特定技能2号').length,
    expiry30,
    expiry60,
    expiry90,
    todokeCount: todoke312 + teikiPending,
    mendanCount,
    payrollMissingCount,
    timeline,
    nationalityDist: groupBy(actives, w => w.nationality || '未登録'),
    statusTypeDist: groupBy(actives, w => activeStatusOf(w)?.status_type || '未登録'),
    expiryDist: [
      { label: '30日以内', count: expiry30, color: URGENCY_COLOR.red },
      { label: '31〜60日', count: expiry60, color: URGENCY_COLOR.amber },
      { label: '61〜90日', count: expiry90, color: '#9ca3af' },
      { label: '91日以上', count: expiryOver90, color: '#d1d5db' },
      { label: '期限未登録', count: expiryUnknown, color: '#e5e7eb' },
    ],
  }
}

// ── UI部品 ──────────────────────────────────────────────

function Skeleton({ height, width }: { height: number; width?: number | string }) {
  return <div style={{ height, width: width ?? '100%', borderRadius: 8, background: '#f3f4f6', animation: 'dashPulse 1.4s ease-in-out infinite' }} />
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: '18px 20px',
  textAlign: 'left',
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#6b7280', letterSpacing: '0.02em' }}>{children}</h2>
}

/** 要対応タイムライン: 既定は先頭3件のみ表示し、4件目以降は展開ボタンで開閉する */
const TL_COLLAPSED_COUNT = 3

function ActionTimeline({ items, todayStr, todayYear }: {
  items: TimelineItem[]
  todayStr: string
  todayYear: string
}) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? items : items.slice(0, TL_COLLAPSED_COUNT)
  const hiddenCount = items.length - TL_COLLAPSED_COUNT

  return (
    <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
      {visible.map((t, i) => (
        <div key={t.key} data-testid={`tl-${t.kind}`}
          style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', borderBottom: i < visible.length - 1 || items.length > TL_COLLAPSED_COUNT ? '1px solid #f3f4f6' : 'none', flexWrap: 'wrap' }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: URGENCY_COLOR[t.urgency], flexShrink: 0 }} />
          {t.due < todayStr && (
            <span data-testid="tl-overdue-tag" style={{ fontSize: 10, fontWeight: 700, color: semantic.red.text, background: '#fee2e2', borderRadius: 4, padding: '2px 6px', flexShrink: 0, letterSpacing: '0.05em' }}>超過</span>
          )}
          {t.badge && (
            <span data-testid="tl-badge" style={{ fontSize: 10, fontWeight: 700, color: semantic.red.text, background: semantic.red.bg, border: `1px solid ${semantic.red.border}`, borderRadius: 4, padding: '2px 6px', flexShrink: 0, letterSpacing: '0.05em' }}>{t.badge}</span>
          )}
          <div style={{ width: 76, flexShrink: 0 }}>
            <div style={{ fontSize: t.due.slice(0, 4) === todayYear ? 13 : 12, fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
              {t.due.slice(0, 4) === todayYear
                ? t.due.slice(5).replace('-', '/')
                : t.due.replace(/-/g, '/')}
            </div>
            <div style={{ fontSize: 10, color: '#9ca3af' }}>{KIND_LABEL[t.kind]}</div>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{t.title}</div>
            <div style={{ fontSize: 12, color: t.urgency === 'red' ? URGENCY_COLOR.red : '#6b7280', marginTop: 1 }}>{t.detail}</div>
          </div>
          <button className="tl-action" onClick={() => router.push(t.href)}>
            {t.actionLabel} →
          </button>
        </div>
      ))}

      {items.length > TL_COLLAPSED_COUNT && (
        <button
          data-testid="tl-toggle"
          onClick={() => setExpanded(v => !v)}
          style={{ width: '100%', background: '#f9fafb', border: 'none', padding: '10px 18px', fontSize: 12, fontWeight: 600, color: '#2563eb', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {expanded ? '▲ 折りたたむ' : `▼ 他 ${hiddenCount} 件を表示`}
        </button>
      )}
    </div>
  )
}

const CHART_COLORS = ['#1e40af', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe']

/** 凡例が長い在留資格名の略称（title属性で全文を保持） */
const LEGEND_ABBREV: Record<string, string> = {
  '技術・人文知識・国際業務': '技人国',
}

function CompositionCard({ title, dist }: { title: string; dist: Dist[] }) {
  const top = dist.slice(0, 5)
  const rest = dist.slice(5).reduce((sum, d) => sum + d.value, 0)
  const data = rest > 0 ? [...top, { name: 'その他', value: rest }] : top
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.05em', marginBottom: 10 }}>{title}</div>
      {data.length === 0 ? (
        <div style={{ fontSize: 13, color: '#9ca3af', padding: '24px 0', textAlign: 'center' }}>データがありません</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 96, height: 96, flexShrink: 0 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius={28} outerRadius={46} paddingAngle={2} stroke="none" isAnimationActive={false}>
                  {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0, flex: 1 }}>
            {data.map((d, i) => (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
                <span title={d.name} style={{ color: '#374151', flex: 1, lineHeight: 1.35 }}>{LEGEND_ABBREV[d.name] ?? d.name}</span>
                <span style={{ color: '#111827', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── ページ本体 ──────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [supportSummary, setSupportSummary] = useState<SupportMatrixSummary | null>(null)
  const [tlFilter, setTlFilter] = useState<TlFilter>('all')
  const announcements = getActiveAnnouncements()

  useEffect(() => {
    const supabase = createClient()
    const now = new Date()
    const fy = currentFiscalYear(now)
    const fetchAll = async () => {
      // タスクのレイジー生成（不足分のみ upsert・重複はUNIQUE制約で防止）
      // 面談（四半期）と業界パッケージ（one_time）は別関数で並存生成する
      await ensureQuarterlyInterviewTasks()
      await ensureIndustryTasks(now)

      const [activesRes, retiredRes, contractsRes, gensRes, tasksRes, industryTasksRes, payrollRes] = await Promise.all([
        supabase.from('foreign_workers')
          .select('id, name_kanji, name_romaji, nationality, residence_statuses(status_type, status_subtype, expiry_date, is_active)')
          .eq('status', 'active'),
        supabase.from('foreign_workers')
          .select('id, name_kanji, name_romaji, nationality, residence_statuses(status_type, status_subtype, expiry_date, is_active)')
          .eq('status', 'retired'),
        supabase.from('worker_contracts').select('worker_id, contract_start_date, termination_date'),
        supabase.from('document_generations').select('worker_id, document_id, generated_at'),
        supabase.from('support_tasks')
          .select('id, worker_id, task_type, period_key, due_date')
          .in('task_type', [...INTERVIEW_TASK_TYPES])
          .eq('status', 'pending'),
        supabase.from('support_tasks')
          .select('id, worker_id, task_type, period_key, due_date')
          .not('task_type', 'in', `(${INTERVIEW_TASK_TYPES.join(',')})`)
          .eq('status', 'pending'),
        supabase.from('payroll_records')
          .select('worker_id, target_year, target_month')
          .or(`and(target_year.eq.${fy},target_month.gte.4),and(target_year.eq.${fy + 1},target_month.lte.3)`),
      ])

      if (gensRes.error) {
        // document_generations 未作成でもページ自体は動かす（届出はすべて未対応扱いになる）
        console.warn('[dashboard] document_generations の取得に失敗:', gensRes.error.message)
      }

      const payrollKeys = new Set(
        (payrollRes.data ?? []).map((r: { worker_id: string; target_year: number; target_month: number }) =>
          `${r.worker_id}:${r.target_year}:${r.target_month}`)
      )

      setSnap(buildSnapshot(
        (activesRes.data ?? []) as WorkerRow[],
        (retiredRes.data ?? []) as WorkerRow[],
        (contractsRes.data ?? []) as ContractRow[],
        (gensRes.data ?? []) as GenRow[],
        (tasksRes.data ?? []) as TaskRow[],
        (industryTasksRes.data ?? []) as TaskRow[],
        payrollKeys,
        now,
      ))
      setLoading(false)

      // 支援サマリー(実施率・要対応件数)は /reports/support-matrix と同じ loader を通し数値を一致させる
      const supportRows = await loadSupportMatrixRows()
      setSupportSummary(summarizeSupportMatrix(supportRows))
    }
    fetchAll()
  }, [])

  const focusTimeline = (f: TlFilter) => {
    setTlFilter(f)
    requestAnimationFrame(() => document.getElementById('action-timeline')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const timeline = snap?.timeline ?? []
  const filteredTimeline = timeline.filter(t => tlFilter === 'all' || t.kind === tlFilter)
  const today = new Date()
  const todayStr = fmtDate(today)
  // 「超過」は緊急度であり分類ではないため、フィルタに関わらず全件から数える
  const tlOverdueCount = timeline.filter(t => t.due < todayStr).length
  const todayLabel = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`

  const alertCardBtn: React.CSSProperties = {
    ...cardStyle,
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    width: '100%',
  }

  // 統計カードは脇役(主役は要対応タイムライン)。数字は22px/600で一段引く
  const bigNum = (n: number, color: string): React.CSSProperties => ({
    fontSize: 22,
    fontWeight: 600,
    lineHeight: 1.1,
    color,
    fontVariantNumeric: 'tabular-nums',
  })

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui,sans-serif' }}>
      <style>{`
        @keyframes dashPulse { 0%,100% { opacity: .5 } 50% { opacity: 1 } }
        .tl-action {
          border: 1px solid #e5e7eb; border-radius: 8px; padding: 7px 14px;
          font-size: 12px; font-weight: 600; cursor: pointer; flex-shrink: 0;
          background: #fff; color: #6b7280; font-family: inherit; white-space: nowrap;
          transition: border-color .15s ease, color .15s ease, background .15s ease;
        }
        .tl-action:hover { border-color: #9ca3af; color: #111827; background: #f9fafb; }
      `}</style>
      <AppHeader currentPage="dashboard" />

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 24px 48px' }}>

        {/* 制度改正のお知らせ */}
        {announcements.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {announcements.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '11px 16px' }}>
                <Megaphone size={16} strokeWidth={2} color="#1e40af" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#1e40af', fontWeight: 500, lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 700, marginRight: 8 }}>制度改正</span>
                  {a.message}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ページタイトル */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, color: '#111827', letterSpacing: '-0.01em' }}>コンプライアンス ダッシュボード</h1>
          <span style={{ fontSize: 13, color: '#9ca3af' }}>{todayLabel} 時点</span>
        </div>

        {/* 要対応タイムライン */}
        <section id="action-timeline" style={{ marginBottom: 28, scrollMarginTop: 72 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SectionTitle>要対応タイムライン</SectionTitle>
              {tlOverdueCount > 0 && (
                <span data-testid="tl-overdue-badge" style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: '#dc2626', borderRadius: 9999, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                  超過 {tlOverdueCount}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {([['all', 'すべて'], ['expiry', '在留期限'], ['todoke', '届出'], ['mendan', '面談'], ['industry', '業界研修']] as [TlFilter, string][]).map(([f, label]) => {
                const count = f === 'all' ? timeline.length : timeline.filter(t => t.kind === f).length
                const disabled = !!snap && f !== 'all' && count === 0
                return (
                  <button key={f} data-testid={`tl-filter-${f}`} disabled={disabled}
                    onClick={() => setTlFilter(f)}
                    style={{
                      border: tlFilter === f ? '1px solid #2563eb' : '1px solid #e5e7eb',
                      background: disabled ? '#f9fafb' : tlFilter === f ? '#eff6ff' : '#fff',
                      color: disabled ? '#d1d5db' : tlFilter === f ? '#2563eb' : '#6b7280',
                      borderRadius: 9999, padding: '4px 12px', fontSize: 12, fontWeight: 600,
                      cursor: disabled ? 'default' : 'pointer',
                    }}>
                    {label}{snap ? ` ${count}` : ''}
                  </button>
                )
              })}
            </div>
          </div>

          {loading || !snap ? (
            <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Skeleton height={40} /><Skeleton height={40} /><Skeleton height={40} />
            </div>
          ) : filteredTimeline.length === 0 ? (
            <div style={{ ...cardStyle, padding: '32px 20px', textAlign: 'center' }}>
              <CheckCircle2 size={22} strokeWidth={2} color={DONE_GREEN} style={{ display: 'inline', marginBottom: 6 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: DONE_GREEN }}>現在、緊急の対応事項はありません</div>
            </div>
          ) : (
            /* key=tlFilter でフィルタ切替時に展開状態をリセットする */
            <ActionTimeline key={tlFilter} items={filteredTimeline} todayStr={todayStr} todayYear={String(today.getFullYear())} />
          )}
        </section>

        {/* アラートサマリー */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, marginBottom: 28 }}>
          {loading || !snap ? (
            <>
              {[0, 1, 2, 3].map(i => (
                <div key={i} style={cardStyle}><Skeleton height={16} width={120} /><div style={{ height: 10 }} /><Skeleton height={36} width={80} /></div>
              ))}
            </>
          ) : (
            <>
              {/* 在留期限警告 */}
              <button data-testid="card-expiry" onClick={() => focusTimeline('expiry')} style={alertCardBtn}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.05em' }}>在留期限の警告</div>
                <div style={{ display: 'flex', gap: 18 }}>
                  {[
                    { label: '30日以内', n: snap.expiry30, color: snap.expiry30 > 0 ? URGENCY_COLOR.red : '#d1d5db' },
                    { label: '31〜60日', n: snap.expiry60, color: snap.expiry60 > 0 ? URGENCY_COLOR.amber : '#d1d5db' },
                    { label: '61〜90日', n: snap.expiry90, color: snap.expiry90 > 0 ? '#374151' : '#d1d5db' },
                  ].map(b => (
                    <div key={b.label}>
                      <div style={bigNum(b.n, b.color)}>{b.n}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>{b.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>クリックで該当一覧を表示</div>
              </button>

              {/* 未対応の届出 */}
              <button data-testid="card-todoke" onClick={() => focusTimeline('todoke')} style={alertCardBtn}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.05em' }}>未対応の届出</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <div style={bigNum(snap.todokeCount, snap.todokeCount > 0 ? URGENCY_COLOR.red : DONE_GREEN)}>{snap.todokeCount}</div>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>件</span>
                  {snap.todokeCount === 0 && <span style={{ fontSize: 12, color: DONE_GREEN, fontWeight: 600 }}>✓ すべて対応済み</span>}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>契約終了（3-1-2号）・定期届出（3-6号）</div>
              </button>

              {/* 四半期面談タスク */}
              <button data-testid="card-mendan" onClick={() => focusTimeline('mendan')} style={alertCardBtn}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.05em' }}>四半期面談タスク</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  {/* 件数は状態色ではなく中立色(青=ブランド/アクション専用) */}
                  <div style={bigNum(snap.mendanCount, snap.mendanCount > 0 ? '#111827' : DONE_GREEN)}>{snap.mendanCount}</div>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>件</span>
                  {snap.mendanCount === 0 && <span style={{ fontSize: 12, color: DONE_GREEN, fontWeight: 600 }}>✓ すべて実施済み</span>}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>未完了の定期面談（本人+監督者・特定技能1号・3ヶ月に1回以上）</div>
              </button>

              {/* 賃金台帳 */}
              <button data-testid="card-payroll" onClick={() => router.push('/reports/annual')} style={alertCardBtn}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.05em' }}>賃金台帳の未登録</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <div style={bigNum(snap.payrollMissingCount, snap.payrollMissingCount > 0 ? URGENCY_COLOR.amber : DONE_GREEN)}>{snap.payrollMissingCount}</div>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>名</span>
                  {snap.payrollMissingCount === 0 && <span style={{ fontSize: 12, color: DONE_GREEN, fontWeight: 600 }}>✓ 今年度分は登録済み</span>}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>今年度の経過月に未登録あり（特定技能）→ 定期届出ページへ</div>
              </button>
            </>
          )}
        </div>

        {/* 支援業務レポートビューへの入口（柱1: 監査・投資家向けレポート） */}
        <button
          data-testid="entry-support-matrix"
          onClick={() => router.push('/reports/support-matrix')}
          style={{
            ...cardStyle, cursor: 'pointer', fontFamily: 'inherit', width: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            marginBottom: 28, padding: '14px 20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <ClipboardList size={20} strokeWidth={1.8} color="#6b7280" style={{ flexShrink: 0 }} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>支援業務の実施状況</div>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>義務的支援10業務の実施記録を一覧化（監査用レポート）</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
            {supportSummary && (
              <>
                {/* 常時義務実施率(マトリクスの「全体の常時義務実施率」と一致) */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.03em' }}>常時義務実施率</div>
                  <div data-testid="support-summary-rate" style={{ fontSize: 16, fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>
                    {supportSummary.rateDone}<span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>/{supportSummary.rateTotal}</span>
                  </div>
                </div>
                {/* 要対応(⚠️)件数: >0 は橙、0 は緑 */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.03em' }}>要対応</div>
                  <div data-testid="support-summary-due" style={{
                    fontSize: 16, fontWeight: 700, lineHeight: 1.2,
                    color: supportSummary.dueCount > 0 ? semantic.orange.text : DONE_GREEN,
                  }}>
                    {supportSummary.dueCount > 0 ? `${supportSummary.dueCount}件` : '0件'}
                  </div>
                </div>
              </>
            )}
            <span style={{ fontSize: 13, fontWeight: 600, color: '#2563eb', flexShrink: 0 }}>開く →</span>
          </div>
        </button>

        {/* 全体ヘルスビュー */}
        <section>
          <div style={{ marginBottom: 12 }}><SectionTitle>全体の状況</SectionTitle></div>
          {loading || !snap ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              {[0, 1, 2, 3].map(i => <div key={i} style={cardStyle}><Skeleton height={110} /></div>)}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              {/* 在職者数 */}
              <div style={cardStyle}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.05em', marginBottom: 10 }}>在職者数</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <div style={bigNum(snap.headcount, '#111827')}>{snap.headcount}</div>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>名</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12, fontSize: 12, color: '#374151' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>特定技能1号</span><span style={{ fontWeight: 600 }}>{snap.tokutei1}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>特定技能2号</span><span style={{ fontWeight: 600 }}>{snap.tokutei2}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>その他の在留資格</span><span style={{ fontWeight: 600 }}>{snap.headcount - snap.tokutei1 - snap.tokutei2}</span></div>
                </div>
              </div>

              <CompositionCard title="国籍構成" dist={snap.nationalityDist} />
              <CompositionCard title="在留資格構成" dist={snap.statusTypeDist} />

              {/* 期限ステータス分布 */}
              <div style={cardStyle}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.05em', marginBottom: 12 }}>在留期限ステータス分布</div>
                {snap.headcount === 0 ? (
                  <div style={{ fontSize: 13, color: '#9ca3af', padding: '24px 0', textAlign: 'center' }}>データがありません</div>
                ) : (
                  <>
                    <div style={{ display: 'flex', height: 10, borderRadius: 9999, overflow: 'hidden', background: '#f3f4f6', marginBottom: 12 }}>
                      {snap.expiryDist.filter(b => b.count > 0).map(b => (
                        <div key={b.label} style={{ flexGrow: b.count, background: b.color }} />
                      ))}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {snap.expiryDist.map(b => (
                        <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: b.color, flexShrink: 0 }} />
                          <span style={{ color: '#374151', flex: 1 }}>{b.label}</span>
                          <span style={{ color: '#111827', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{b.count}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
