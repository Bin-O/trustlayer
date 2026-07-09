'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppHeader from '@/components/AppHeader'
import { getActiveAnnouncements } from '@/lib/announcements'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { Megaphone } from 'lucide-react'

const TOKUTEI_TYPES = ['特定技能1号', '特定技能2号']

type ResidenceStatus = {
  status_type: string | null
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

type TimelineKind = 'expiry' | 'todoke' | 'mendan'
type TlFilter = 'all' | TimelineKind

type TimelineItem = {
  key: string
  kind: TimelineKind
  due: string
  urgency: 'red' | 'amber' | 'green'
  title: string
  detail: string
  actionLabel: string
  href: string
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

const URGENCY_COLOR = { red: '#dc2626', amber: '#d97706', green: '#16a34a' } as const
const KIND_LABEL: Record<TimelineKind, string> = { expiry: '在留期限', todoke: '届出', mendan: '支援計画' }

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

function monthsBetween(startStr: string, now: Date): number {
  const s = new Date(startStr)
  return (now.getFullYear() - s.getFullYear()) * 12 + (now.getMonth() - s.getMonth())
}

function buildSnapshot(
  actives: WorkerRow[],
  retired: WorkerRow[],
  contracts: ContractRow[],
  gens: GenRow[],
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
      timeline.push({
        key: `expiry-${w.id}`,
        kind: 'expiry',
        due: st.expiry_date,
        urgency: d <= 30 ? 'red' : d <= 60 ? 'amber' : 'green',
        title: `${nameOf(w)}さんの在留期限`,
        detail: d < 0 ? `期限を${-d}日超過しています（${st.expiry_date}）` : `残り${d}日（${st.expiry_date}）`,
        actionLabel: '従業員詳細へ',
        href: `/employees/${w.id}`,
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
      urgency: d <= 7 ? 'red' : 'amber',
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
        urgency: d <= 14 ? 'red' : 'amber',
        title: `定期届出（${prevFy}年度分・参考様式第3-6号）`,
        detail: d < 0 ? `提出期限を${-d}日超過（期限 ${due}）` : `提出期限 ${due}`,
        actionLabel: '定期届出ページへ',
        href: '/reports/annual',
      })
    }
  }

  // ── 支援計画：定期面談の目安（特定技能1号・契約開始から3ヶ月周期） ──
  let mendanCount = 0
  const monthEnd = fmtDate(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  for (const w of actives) {
    if (activeStatusOf(w)?.status_type !== '特定技能1号') continue
    const start = contractOf.get(w.id)?.contract_start_date
    if (!start) continue
    const diff = monthsBetween(start, now)
    if (diff <= 0 || diff % 3 !== 0) continue
    mendanCount++
    timeline.push({
      key: `mendan-${w.id}`,
      kind: 'mendan',
      due: monthEnd,
      urgency: 'green',
      title: `${nameOf(w)}さんの定期面談（目安）`,
      detail: `契約開始から${diff}ヶ月・今月中の実施が目安です`,
      actionLabel: '従業員詳細へ',
      href: `/employees/${w.id}`,
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
  const rank = { red: 0, amber: 1, green: 2 }
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
      { label: '61〜90日', count: expiry90, color: '#3b82f6' },
      { label: '91日以上', count: expiryOver90, color: URGENCY_COLOR.green },
      { label: '期限未登録', count: expiryUnknown, color: '#e2e8f0' },
    ],
  }
}

// ── UI部品 ──────────────────────────────────────────────

function Skeleton({ height, width }: { height: number; width?: number | string }) {
  return <div style={{ height, width: width ?? '100%', borderRadius: 8, background: '#e9ecef', animation: 'dashPulse 1.4s ease-in-out infinite' }} />
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
                <span style={{ color: '#111', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{d.value}</span>
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
  const [tlFilter, setTlFilter] = useState<TlFilter>('all')
  const announcements = getActiveAnnouncements()

  useEffect(() => {
    const supabase = createClient()
    const now = new Date()
    const fy = currentFiscalYear(now)
    const fetchAll = async () => {
      const [activesRes, retiredRes, contractsRes, gensRes, payrollRes] = await Promise.all([
        supabase.from('foreign_workers')
          .select('id, name_kanji, name_romaji, nationality, residence_statuses(status_type, expiry_date, is_active)')
          .eq('status', 'active'),
        supabase.from('foreign_workers')
          .select('id, name_kanji, name_romaji, nationality, residence_statuses(status_type, expiry_date, is_active)')
          .eq('status', 'retired'),
        supabase.from('worker_contracts').select('worker_id, contract_start_date, termination_date'),
        supabase.from('document_generations').select('worker_id, document_id, generated_at'),
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
        payrollKeys,
        now,
      ))
      setLoading(false)
    }
    fetchAll()
  }, [])

  const focusTimeline = (f: TlFilter) => {
    setTlFilter(f)
    requestAnimationFrame(() => document.getElementById('action-timeline')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const filteredTimeline = (snap?.timeline ?? []).filter(t => tlFilter === 'all' || t.kind === tlFilter)
  const today = new Date()
  const todayStr = fmtDate(today)
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

  const bigNum = (n: number, color: string): React.CSSProperties => ({
    fontSize: 30,
    fontWeight: 700,
    lineHeight: 1.1,
    color,
    fontVariantNumeric: 'tabular-nums',
  })

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui,sans-serif' }}>
      <style>{`
        @keyframes dashPulse { 0%,100% { opacity: .5 } 50% { opacity: 1 } }
        .tl-action {
          border: 1px solid #e5e7eb; border-radius: 6px; padding: 7px 14px;
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
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '11px 16px' }}>
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
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, color: '#111', letterSpacing: '-0.01em' }}>コンプライアンス ダッシュボード</h1>
          <span style={{ fontSize: 13, color: '#9ca3af' }}>{todayLabel} 時点</span>
        </div>

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
                  <div style={bigNum(snap.todokeCount, snap.todokeCount > 0 ? URGENCY_COLOR.red : URGENCY_COLOR.green)}>{snap.todokeCount}</div>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>件</span>
                  {snap.todokeCount === 0 && <span style={{ fontSize: 12, color: URGENCY_COLOR.green, fontWeight: 600 }}>✓ すべて対応済み</span>}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>契約終了（3-1-2号）・定期届出（3-6号）</div>
              </button>

              {/* 支援計画の実施予定 */}
              <button data-testid="card-mendan" onClick={() => focusTimeline('mendan')} style={alertCardBtn}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.05em' }}>支援計画の実施予定（今月）</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <div style={bigNum(snap.mendanCount, snap.mendanCount > 0 ? '#2563eb' : '#d1d5db')}>{snap.mendanCount}</div>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>名</span>
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>定期面談の目安対象（特定技能1号・3ヶ月周期）</div>
              </button>

              {/* 賃金台帳 */}
              <button data-testid="card-payroll" onClick={() => router.push('/reports/annual')} style={alertCardBtn}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.05em' }}>賃金台帳の未登録</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <div style={bigNum(snap.payrollMissingCount, snap.payrollMissingCount > 0 ? URGENCY_COLOR.amber : URGENCY_COLOR.green)}>{snap.payrollMissingCount}</div>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>名</span>
                  {snap.payrollMissingCount === 0 && <span style={{ fontSize: 12, color: URGENCY_COLOR.green, fontWeight: 600 }}>✓ 今年度分は登録済み</span>}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>今年度の経過月に未登録あり（特定技能）→ 定期届出ページへ</div>
              </button>
            </>
          )}
        </div>

        {/* 要対応タイムライン */}
        <section id="action-timeline" style={{ marginBottom: 28, scrollMarginTop: 72 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <SectionTitle>要対応タイムライン</SectionTitle>
            <div style={{ display: 'flex', gap: 6 }}>
              {([['all', 'すべて'], ['expiry', '在留期限'], ['todoke', '届出'], ['mendan', '支援計画']] as [TlFilter, string][]).map(([f, label]) => (
                <button key={f} onClick={() => setTlFilter(f)}
                  style={{
                    border: tlFilter === f ? '1px solid #2563eb' : '1px solid #e5e7eb',
                    background: tlFilter === f ? '#eff6ff' : '#fff',
                    color: tlFilter === f ? '#2563eb' : '#6b7280',
                    borderRadius: 9999, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loading || !snap ? (
            <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Skeleton height={40} /><Skeleton height={40} /><Skeleton height={40} />
            </div>
          ) : filteredTimeline.length === 0 ? (
            <div style={{ ...cardStyle, padding: '32px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>✅</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: URGENCY_COLOR.green }}>現在、緊急の対応事項はありません</div>
            </div>
          ) : (
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
              {filteredTimeline.map((t, i) => (
                <div key={t.key} data-testid={`tl-${t.kind}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', borderBottom: i < filteredTimeline.length - 1 ? '1px solid #f3f4f6' : 'none', flexWrap: 'wrap' }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: URGENCY_COLOR[t.urgency], flexShrink: 0 }} />
                  {t.due < todayStr && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', background: '#fee2e2', borderRadius: 4, padding: '2px 6px', flexShrink: 0, letterSpacing: '0.05em' }}>超過</span>
                  )}
                  <div style={{ width: 76, flexShrink: 0 }}>
                    <div style={{ fontSize: t.due.slice(0, 4) === String(today.getFullYear()) ? 13 : 12, fontWeight: 700, color: '#111', fontVariantNumeric: 'tabular-nums' }}>
                      {t.due.slice(0, 4) === String(today.getFullYear())
                        ? t.due.slice(5).replace('-', '/')
                        : t.due.replace(/-/g, '/')}
                    </div>
                    <div style={{ fontSize: 10, color: '#9ca3af' }}>{KIND_LABEL[t.kind]}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{t.title}</div>
                    <div style={{ fontSize: 12, color: t.urgency === 'red' ? URGENCY_COLOR.red : '#6b7280', marginTop: 1 }}>{t.detail}</div>
                  </div>
                  <button className="tl-action" onClick={() => router.push(t.href)}>
                    {t.actionLabel} →
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

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
                  <div style={bigNum(snap.headcount, '#111')}>{snap.headcount}</div>
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
                    <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: '#f3f4f6', marginBottom: 12 }}>
                      {snap.expiryDist.filter(b => b.count > 0).map(b => (
                        <div key={b.label} style={{ flexGrow: b.count, background: b.color }} />
                      ))}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {snap.expiryDist.map(b => (
                        <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: b.color, flexShrink: 0 }} />
                          <span style={{ color: '#374151', flex: 1 }}>{b.label}</span>
                          <span style={{ color: '#111', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{b.count}</span>
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
