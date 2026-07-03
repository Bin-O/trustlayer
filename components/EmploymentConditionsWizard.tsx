'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const ORG_ID = '11111111-1111-1111-1111-111111111111'
const STEPS = ['基本情報', '就業時間', '休憩・休日', '賃金・手当', '控除', '保険確認']

type N = number | null
export type Form = {
  contract_start_date: string; contract_end_date: string
  planned_entry_date: string; contract_renewable: boolean
  workplace_type: string; workplace_name: string
  workplace_address: string; workplace_phone: string
  industry_field: string; job_category: string
  work_start_time: string; work_end_time: string
  daily_scheduled_hours: N; daily_scheduled_minutes: N
  weekly_scheduled_hours: N; weekly_scheduled_minutes: N; weekly_scheduled_days: N
  monthly_scheduled_hours: N; annual_scheduled_hours: N
  monthly_scheduled_days: N; annual_scheduled_days: N
  overtime_exists: boolean
  henkou_roudou_jikan: boolean; henkou_roudou_jikan_unit: string; kotai_sei: boolean
  shift1_start_time: string; shift1_end_time: string; shift1_days: string; shift1_daily_hours: N; shift1_daily_minutes: N
  shift2_start_time: string; shift2_end_time: string; shift2_days: string; shift2_daily_hours: N; shift2_daily_minutes: N
  shift3_start_time: string; shift3_end_time: string; shift3_days: string; shift3_daily_hours: N; shift3_daily_minutes: N
  break_minutes: N; regular_holiday_days: string; annual_holiday_days: N
  irregular_holiday_info: string; annual_paid_leave_days: N
  other_paid_leave: string; other_unpaid_leave: string
  wage_type: string; basic_wage: N
  allowance_1_name: string; allowance_1_amount: N; allowance_1_calc_method: string
  allowance_2_name: string; allowance_2_amount: N; allowance_2_calc_method: string
  allowance_3_name: string; allowance_3_amount: N; allowance_3_calc_method: string
  allowance_4_name: string; allowance_4_amount: N; allowance_4_calc_method: string
  overtime_rate_under60: N; overtime_rate_over60: N; overtime_rate_prescribed: N
  holiday_rate_statutory: N; holiday_rate_non_statutory: N; late_night_rate: N
  wage_cutoff_day: N; wage_payment_day: N; wage_payment_method: string; wage_deduction_agreement: boolean
  salary_increase_exists: boolean; salary_increase_details: string
  bonus_exists: boolean; bonus_details: string
  severance_pay_exists: boolean; severance_pay_details: string
  work_injury_allowance_exists: boolean; work_injury_allowance_rate: string
  deduction_tax: N; deduction_social_insurance: N; deduction_employment_insurance: N
  deduction_food: N; deduction_housing: N; deduction_utilities: N
  deduction_other_1_name: string; deduction_other_1_amount: N
  deduction_other_2_name: string; deduction_other_2_amount: N
  insurance_kosei_nenkin: boolean; insurance_kenko: boolean
  insurance_koyo: boolean; insurance_rousai: boolean
  insurance_kokumin_nenkin: boolean; insurance_kokumin_kenko: boolean
  health_checkup_on_hire: string; health_checkup_first: string; health_checkup_interval: string
  change_reason: string
  effective_date: string
}

const INIT: Form = {
  contract_start_date: '', contract_end_date: '', planned_entry_date: '', contract_renewable: true,
  workplace_type: 'direct', workplace_name: '', workplace_address: '', workplace_phone: '',
  industry_field: '', job_category: '',
  work_start_time: '09:00', work_end_time: '18:00',
  daily_scheduled_hours: 8, daily_scheduled_minutes: 0,
  weekly_scheduled_hours: 40, weekly_scheduled_minutes: 0, weekly_scheduled_days: 5,
  monthly_scheduled_hours: null, annual_scheduled_hours: null,
  monthly_scheduled_days: null, annual_scheduled_days: 245, overtime_exists: false,
  henkou_roudou_jikan: false, henkou_roudou_jikan_unit: '', kotai_sei: false,
  shift1_start_time: '', shift1_end_time: '', shift1_days: '', shift1_daily_hours: 8, shift1_daily_minutes: 0,
  shift2_start_time: '', shift2_end_time: '', shift2_days: '', shift2_daily_hours: 8, shift2_daily_minutes: 0,
  shift3_start_time: '', shift3_end_time: '', shift3_days: '', shift3_daily_hours: 8, shift3_daily_minutes: 0,
  break_minutes: 60, regular_holiday_days: '', annual_holiday_days: 120,
  irregular_holiday_info: '', annual_paid_leave_days: 10, other_paid_leave: '', other_unpaid_leave: '',
  wage_type: 'monthly', basic_wage: null,
  allowance_1_name: '', allowance_1_amount: null, allowance_1_calc_method: '',
  allowance_2_name: '', allowance_2_amount: null, allowance_2_calc_method: '',
  allowance_3_name: '', allowance_3_amount: null, allowance_3_calc_method: '',
  allowance_4_name: '', allowance_4_amount: null, allowance_4_calc_method: '',
  overtime_rate_under60: 25, overtime_rate_over60: 50, overtime_rate_prescribed: 0,
  holiday_rate_statutory: 35, holiday_rate_non_statutory: 25, late_night_rate: 25,
  wage_cutoff_day: 25, wage_payment_day: 25, wage_payment_method: 'bank',
  wage_deduction_agreement: false, salary_increase_exists: false, salary_increase_details: '',
  bonus_exists: false, bonus_details: '', severance_pay_exists: false, severance_pay_details: '',
  work_injury_allowance_exists: false, work_injury_allowance_rate: '',
  deduction_tax: null, deduction_social_insurance: null, deduction_employment_insurance: null,
  deduction_food: null, deduction_housing: null, deduction_utilities: null,
  deduction_other_1_name: '', deduction_other_1_amount: null,
  deduction_other_2_name: '', deduction_other_2_amount: null,
  insurance_kosei_nenkin: true, insurance_kenko: true, insurance_koyo: true,
  insurance_rousai: true, insurance_kokumin_nenkin: false, insurance_kokumin_kenko: false,
  health_checkup_on_hire: '', health_checkup_first: '', health_checkup_interval: '1年ごと',
  change_reason: '',
  effective_date: '',
}

function validate(step: number, f: Form): string[] {
  if (step === 1) {
    const e: string[] = []
    if (!f.contract_start_date) e.push('契約開始日は必須です')
    if (!f.workplace_name.trim()) e.push('就業場所名称は必須です')
    if (!f.industry_field.trim()) e.push('業務の種類・分野は必須です')
    if (!f.job_category.trim()) e.push('従事すべき業務の内容は必須です')
    return e
  }
  if (step === 2) {
    if (!f.work_start_time) return ['始業時刻は必須です']
    if (!f.work_end_time) return ['終業時刻は必須です']
  }
  if (step === 3) {
    if (f.break_minutes === null || f.break_minutes === undefined) return ['休憩時間は必須です']
    if (!f.regular_holiday_days.trim()) return ['所定休日は必須です']
  }
  if (step === 4) {
    if (!f.basic_wage || f.basic_wage <= 0) return ['基本給（基本賃金）は必須です']
  }
  return []
}

const hhmm = (t: string | null | undefined) => (t ?? '').slice(0, 5)

type ChangedSection = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI' | 'VII' | 'VIII' | 'IX'
type DiffItem = { label: string; before: string; after: string }

const DIFF_FIELDS: { key: keyof Form; label: string; section: ChangedSection; format?: (v: unknown) => string }[] = [
  { key: 'industry_field', label: '業務の種類・分野', section: 'I' },
  { key: 'job_category', label: '従事すべき業務の内容', section: 'I' },
  { key: 'workplace_type', label: '派遣形態', section: 'II', format: v => ({ direct: '直接雇用', dispatch: '派遣' }[v as string] ?? String(v ?? '')) },
  { key: 'workplace_name', label: '就業場所名称', section: 'II' },
  { key: 'workplace_address', label: '就業場所住所', section: 'II' },
  { key: 'work_start_time', label: '始業時刻', section: 'III' },
  { key: 'work_end_time', label: '終業時刻', section: 'III' },
  { key: 'daily_scheduled_hours', label: '1日の所定時間（時）', section: 'III' },
  { key: 'weekly_scheduled_hours', label: '週所定時間（時）', section: 'III' },
  { key: 'weekly_scheduled_days', label: '週所定日数', section: 'III' },
  { key: 'overtime_exists', label: '時間外労働（36協定）', section: 'IV', format: v => v ? 'あり' : 'なし' },
  { key: 'break_minutes', label: '休憩時間（分）', section: 'III' },
  { key: 'regular_holiday_days', label: '所定休日', section: 'V' },
  { key: 'annual_holiday_days', label: '年間休日日数', section: 'V' },
  { key: 'annual_paid_leave_days', label: '年次有給休暇日数', section: 'VI' },
  { key: 'wage_type', label: '賃金形態', section: 'VII', format: v => ({ monthly: '月給', daily: '日給', hourly: '時間給' }[v as string] ?? String(v ?? '')) },
  { key: 'basic_wage', label: '基本給（円）', section: 'VII', format: v => v != null ? `${Number(v).toLocaleString('ja-JP')} 円` : '—' },
  { key: 'allowance_1_name', label: '手当A名称', section: 'VII' },
  { key: 'allowance_1_amount', label: '手当A金額', section: 'VII', format: v => v != null ? `${Number(v).toLocaleString('ja-JP')} 円` : '—' },
  { key: 'allowance_2_name', label: '手当B名称', section: 'VII' },
  { key: 'allowance_2_amount', label: '手当B金額', section: 'VII', format: v => v != null ? `${Number(v).toLocaleString('ja-JP')} 円` : '—' },
  { key: 'deduction_food', label: '食費控除（円）', section: 'VII', format: v => v != null ? `${Number(v).toLocaleString('ja-JP')} 円` : '—' },
  { key: 'deduction_housing', label: '住居費控除（円）', section: 'VII', format: v => v != null ? `${Number(v).toLocaleString('ja-JP')} 円` : '—' },
  { key: 'insurance_kosei_nenkin', label: '厚生年金保険', section: 'VIII', format: v => v ? '加入' : '未加入' },
  { key: 'insurance_kenko', label: '健康保険', section: 'VIII', format: v => v ? '加入' : '未加入' },
  { key: 'insurance_koyo', label: '雇用保険', section: 'VIII', format: v => v ? '加入' : '未加入' },
]

function normForCmp(v: unknown): string {
  if (v === null || v === undefined || v === '') return ''
  const s = String(v)
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 5)
  return s
}

function fmtDiffVal(v: unknown, format?: (v: unknown) => string): string {
  if (format) return format(v)
  if (v === null || v === undefined || v === '') return '—'
  return String(v)
}

function computeDiff(prev: Record<string, unknown>, next: Form): { item: DiffItem; section: ChangedSection }[] {
  const results: { item: DiffItem; section: ChangedSection }[] = []
  for (const { key, label, section, format } of DIFF_FIELDS) {
    const pv = prev[key as string]
    const nv = next[key]
    if (normForCmp(pv) !== normForCmp(nv)) {
      results.push({ item: { label, before: fmtDiffVal(pv, format), after: fmtDiffVal(nv, format) }, section })
    }
  }
  return results
}

// モジュールスコープ定義でレンダリング毎の再生成を防ぐ
const inp: React.CSSProperties = {
  width: '100%', border: '1px solid #d0d0d0', borderRadius: 6,
  padding: '9px 12px', fontSize: 14, color: '#111', outline: 'none', boxSizing: 'border-box',
}
const sel: React.CSSProperties = { ...inp, background: '#fff' }

const F = ({ label, req, half, children }: { label: string; req?: boolean; half?: boolean; children: React.ReactNode }) => (
  <div style={{ marginBottom: 14, gridColumn: half ? 'span 1' : undefined }}>
    <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>
      {label}{req && <span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>}
    </label>
    {children}
  </div>
)
const Toggle = ({ val, onChange, label, sub }: { val: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', background: '#f9f9f9', border: '1px solid #ececec', borderRadius: 8, marginBottom: 10 }}>
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{sub}</div>}
    </div>
    <div onClick={() => onChange(!val)} style={{ position: 'relative', width: 44, height: 24, background: val ? '#0066cc' : '#ccc', borderRadius: 12, cursor: 'pointer', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: val ? 23 : 3, width: 18, height: 18, background: '#fff', borderRadius: '50%', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </div>
  </div>
)
const G2 = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>{children}</div>
)
const G3 = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>{children}</div>
)
const Divider = ({ label }: { label: string }) => (
  <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #ececec', paddingBottom: 6, marginBottom: 14, marginTop: 20 }}>{label}</div>
)

type Props = {
  workerIds: string[]
  onSaved: (count: number) => void
  onCancel: () => void
  showTodokeNotify?: boolean
}

export default function EmploymentConditionsWizard({ workerIds, onSaved, onCancel, showTodokeNotify = false }: Props) {
  const isBulk = workerIds.length > 1
  const primaryId = workerIds[0]

  const [step, setStep] = useState(1)
  const [form, setForm] = useState<Form>(() => ({ ...INIT, effective_date: new Date().toISOString().slice(0, 10) }))
  const [workerName, setWorkerName] = useState('')
  const [workerStatusType, setWorkerStatusType] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [saved, setSaved] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [notifyModal, setNotifyModal] = useState<{ diffItems: { item: DiffItem; section: ChangedSection }[]; changedSections: ChangedSection[] } | null>(null)
  const [generatingDoc, setGeneratingDoc] = useState(false)

  const s = <K extends keyof Form>(k: K, v: Form[K]) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    const key = workerIds.join(',')
    setStep(1)
    setErrors([])
    setSaved(false)
    setIsEditing(false)
    setForm({ ...INIT, effective_date: new Date().toISOString().slice(0, 10) })
    setLoading(true)

    const supabase = createClient()
    ;(async () => {
      if (!isBulk) {
        // 単独: 既存データ・在留資格・会社デフォルトを読み込む
        const [wRes, cRes, ctRes, dRes] = await Promise.all([
          supabase.from('foreign_workers').select('name_kanji, residence_statuses(status_type, is_active)').eq('id', primaryId).single(),
          supabase.from('employment_conditions').select('*').eq('worker_id', primaryId).maybeSingle(),
          supabase.from('worker_contracts').select('*').eq('worker_id', primaryId).maybeSingle(),
          supabase.from('organization_defaults').select('*').eq('organization_id', ORG_ID).maybeSingle(),
        ])
        if (wRes.data) {
          setWorkerName(wRes.data.name_kanji)
          const statuses = (wRes.data as { residence_statuses?: { status_type: string; is_active: boolean }[] }).residence_statuses ?? []
          const active = statuses.find(s => s.is_active)
          setWorkerStatusType(active?.status_type ?? null)
        }
        if (cRes.data || ctRes.data) {
          setIsEditing(true)
          const c = cRes.data ?? {}; const ct = ctRes.data ?? {}
          setForm(prev => ({
            ...prev,
            ...Object.fromEntries(Object.entries(c).filter(([k]) => !['id', 'created_at', 'worker_id'].includes(k))),
            contract_start_date: ct.contract_start_date ?? '',
            contract_end_date: ct.contract_end_date ?? '',
            planned_entry_date: ct.planned_entry_date ?? '',
            contract_renewable: ct.contract_renewable ?? true,
            workplace_name: c.workplace_name ?? '', workplace_address: c.workplace_address ?? '',
            workplace_phone: c.workplace_phone ?? '', industry_field: c.industry_field ?? '',
            job_category: c.job_category ?? '', henkou_roudou_jikan_unit: c.henkou_roudou_jikan_unit ?? '',
            regular_holiday_days: c.regular_holiday_days ?? '', irregular_holiday_info: c.irregular_holiday_info ?? '',
            other_paid_leave: c.other_paid_leave ?? '', other_unpaid_leave: c.other_unpaid_leave ?? '',
            shift1_start_time: c.shift1_start_time ?? '', shift1_end_time: c.shift1_end_time ?? '', shift1_days: c.shift1_days ?? '',
            shift2_start_time: c.shift2_start_time ?? '', shift2_end_time: c.shift2_end_time ?? '', shift2_days: c.shift2_days ?? '',
            shift3_start_time: c.shift3_start_time ?? '', shift3_end_time: c.shift3_end_time ?? '', shift3_days: c.shift3_days ?? '',
            allowance_1_name: c.allowance_1_name ?? '', allowance_1_calc_method: c.allowance_1_calc_method ?? '',
            allowance_2_name: c.allowance_2_name ?? '', allowance_2_calc_method: c.allowance_2_calc_method ?? '',
            allowance_3_name: c.allowance_3_name ?? '', allowance_3_calc_method: c.allowance_3_calc_method ?? '',
            allowance_4_name: c.allowance_4_name ?? '', allowance_4_calc_method: c.allowance_4_calc_method ?? '',
            salary_increase_details: c.salary_increase_details ?? '', bonus_details: c.bonus_details ?? '',
            severance_pay_details: c.severance_pay_details ?? '', work_injury_allowance_rate: c.work_injury_allowance_rate ?? '',
            deduction_other_1_name: c.deduction_other_1_name ?? '', deduction_other_2_name: c.deduction_other_2_name ?? '',
            health_checkup_on_hire: c.health_checkup_on_hire ?? '', health_checkup_first: c.health_checkup_first ?? '',
            health_checkup_interval: c.health_checkup_interval ?? '1年ごと',
          }))
        } else if (dRes.data) {
          const d = dRes.data
          setForm(prev => ({
            ...prev,
            work_start_time: hhmm(d.work_start_time),
            work_end_time: hhmm(d.work_end_time),
            break_minutes: d.break_minutes ?? 60,
            henkou_roudou_jikan: d.has_flex_time ?? false,
            overtime_exists: d.has_36_agreement ?? false,
            insurance_kosei_nenkin: d.social_insurance_enrolled ?? true,
            insurance_kenko: d.social_insurance_enrolled ?? true,
            insurance_koyo: d.social_insurance_enrolled ?? true,
            insurance_rousai: d.social_insurance_enrolled ?? true,
          }))
        }
      } else {
        // 一括: 会社デフォルトのみ
        const { data: d } = await supabase.from('organization_defaults').select('*').eq('organization_id', ORG_ID).maybeSingle()
        if (d) {
          setForm(prev => ({
            ...prev,
            work_start_time: hhmm(d.work_start_time),
            work_end_time: hhmm(d.work_end_time),
            break_minutes: d.break_minutes ?? 60,
            henkou_roudou_jikan: d.has_flex_time ?? false,
            overtime_exists: d.has_36_agreement ?? false,
            insurance_kosei_nenkin: d.social_insurance_enrolled ?? true,
            insurance_kenko: d.social_insurance_enrolled ?? true,
            insurance_koyo: d.social_insurance_enrolled ?? true,
            insurance_rousai: d.social_insurance_enrolled ?? true,
          }))
        }
      }
      setLoading(false)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerIds.join(',')])

  const goNext = () => {
    const e = validate(step, form)
    if (e.length) { setErrors(e); return }
    setErrors([]); setStep(n => n + 1); window.scrollTo(0, 0)
  }
  const goBack = () => { setErrors([]); setStep(n => n - 1); window.scrollTo(0, 0) }

  const handleSave = async () => {
    const e = validate(step, form)
    if (e.length) { setErrors(e); return }
    setSaving(true)
    const supabase = createClient()

    let prevSnapshot: Record<string, unknown> | null = null

    // 単独編集時のみスナップショット保存
    if (!isBulk && isEditing) {
      const [prevCond, prevContract] = await Promise.all([
        supabase.from('employment_conditions').select('*').eq('worker_id', primaryId).maybeSingle(),
        supabase.from('worker_contracts').select('*').eq('worker_id', primaryId).maybeSingle(),
      ])
      if (prevCond.data) {
        prevSnapshot = prevCond.data as Record<string, unknown>
        await supabase.from('employment_condition_history').insert({
          worker_id: primaryId,
          change_reason: form.change_reason || null,
          snapshot_data: prevCond.data,
          contract_snapshot: prevContract.data ?? null,
          ...(form.effective_date ? { changed_at: form.effective_date } : {}),
        })
      }
    }

    // worker_id なしのベースオブジェクト
    const baseCond = {
      workplace_type: form.workplace_type || null, workplace_name: form.workplace_name || null,
      workplace_address: form.workplace_address || null, workplace_phone: form.workplace_phone || null,
      industry_field: form.industry_field || null, job_category: form.job_category || null,
      work_start_time: form.work_start_time || null, work_end_time: form.work_end_time || null,
      daily_scheduled_hours: form.daily_scheduled_hours, daily_scheduled_minutes: form.daily_scheduled_minutes,
      weekly_scheduled_hours: form.weekly_scheduled_hours, weekly_scheduled_minutes: form.weekly_scheduled_minutes,
      weekly_scheduled_days: form.weekly_scheduled_days, monthly_scheduled_hours: form.monthly_scheduled_hours,
      annual_scheduled_hours: form.annual_scheduled_hours, monthly_scheduled_days: form.monthly_scheduled_days,
      annual_scheduled_days: form.annual_scheduled_days, overtime_exists: form.overtime_exists,
      henkou_roudou_jikan: form.henkou_roudou_jikan, henkou_roudou_jikan_unit: form.henkou_roudou_jikan_unit || null,
      kotai_sei: form.kotai_sei,
      shift1_start_time: form.shift1_start_time || null, shift1_end_time: form.shift1_end_time || null,
      shift1_days: form.shift1_days || null, shift1_daily_hours: form.shift1_daily_hours, shift1_daily_minutes: form.shift1_daily_minutes,
      shift2_start_time: form.shift2_start_time || null, shift2_end_time: form.shift2_end_time || null,
      shift2_days: form.shift2_days || null, shift2_daily_hours: form.shift2_daily_hours, shift2_daily_minutes: form.shift2_daily_minutes,
      shift3_start_time: form.shift3_start_time || null, shift3_end_time: form.shift3_end_time || null,
      shift3_days: form.shift3_days || null, shift3_daily_hours: form.shift3_daily_hours, shift3_daily_minutes: form.shift3_daily_minutes,
      break_minutes: form.break_minutes, regular_holiday_days: form.regular_holiday_days || null,
      annual_holiday_days: form.annual_holiday_days, irregular_holiday_info: form.irregular_holiday_info || null,
      annual_paid_leave_days: form.annual_paid_leave_days,
      other_paid_leave: form.other_paid_leave || null, other_unpaid_leave: form.other_unpaid_leave || null,
      wage_type: form.wage_type || null, basic_wage: form.basic_wage,
      allowance_1_name: form.allowance_1_name || null, allowance_1_amount: form.allowance_1_amount, allowance_1_calc_method: form.allowance_1_calc_method || null,
      allowance_2_name: form.allowance_2_name || null, allowance_2_amount: form.allowance_2_amount, allowance_2_calc_method: form.allowance_2_calc_method || null,
      allowance_3_name: form.allowance_3_name || null, allowance_3_amount: form.allowance_3_amount, allowance_3_calc_method: form.allowance_3_calc_method || null,
      allowance_4_name: form.allowance_4_name || null, allowance_4_amount: form.allowance_4_amount, allowance_4_calc_method: form.allowance_4_calc_method || null,
      overtime_rate_under60: form.overtime_rate_under60, overtime_rate_over60: form.overtime_rate_over60,
      overtime_rate_prescribed: form.overtime_rate_prescribed, holiday_rate_statutory: form.holiday_rate_statutory,
      holiday_rate_non_statutory: form.holiday_rate_non_statutory, late_night_rate: form.late_night_rate,
      wage_cutoff_day: form.wage_cutoff_day, wage_payment_day: form.wage_payment_day,
      wage_payment_method: form.wage_payment_method || null, wage_deduction_agreement: form.wage_deduction_agreement,
      salary_increase_exists: form.salary_increase_exists, salary_increase_details: form.salary_increase_details || null,
      bonus_exists: form.bonus_exists, bonus_details: form.bonus_details || null,
      severance_pay_exists: form.severance_pay_exists, severance_pay_details: form.severance_pay_details || null,
      work_injury_allowance_exists: form.work_injury_allowance_exists, work_injury_allowance_rate: form.work_injury_allowance_rate || null,
      deduction_tax: form.deduction_tax, deduction_social_insurance: form.deduction_social_insurance,
      deduction_employment_insurance: form.deduction_employment_insurance, deduction_food: form.deduction_food,
      deduction_housing: form.deduction_housing, deduction_utilities: form.deduction_utilities,
      deduction_other_1_name: form.deduction_other_1_name || null, deduction_other_1_amount: form.deduction_other_1_amount,
      deduction_other_2_name: form.deduction_other_2_name || null, deduction_other_2_amount: form.deduction_other_2_amount,
      insurance_kosei_nenkin: form.insurance_kosei_nenkin, insurance_kenko: form.insurance_kenko,
      insurance_koyo: form.insurance_koyo, insurance_rousai: form.insurance_rousai,
      insurance_kokumin_nenkin: form.insurance_kokumin_nenkin, insurance_kokumin_kenko: form.insurance_kokumin_kenko,
      health_checkup_on_hire: form.health_checkup_on_hire || null, health_checkup_first: form.health_checkup_first || null,
      health_checkup_interval: form.health_checkup_interval || null,
    }
    const baseContract = {
      contract_start_date: form.contract_start_date || null,
      contract_end_date: form.contract_end_date || null,
      planned_entry_date: form.planned_entry_date || null,
      contract_renewable: form.contract_renewable,
    }

    // 全 worker_id に対して並列 UPSERT
    const results = await Promise.all(
      workerIds.flatMap(wid => [
        supabase.from('employment_conditions').upsert({ ...baseCond, worker_id: wid }, { onConflict: 'worker_id' }),
        supabase.from('worker_contracts').upsert({ ...baseContract, worker_id: wid }, { onConflict: 'worker_id' }),
      ])
    )

    const firstErr = results.find(r => r.error)
    if (firstErr?.error) {
      setErrors([firstErr.error.message ?? 'エラーが発生しました'])
    } else {
      setSaved(true)
      if (!isBulk && isEditing && showTodokeNotify && workerStatusType === '特定技能1号' && prevSnapshot) {
        const diffResult = computeDiff(prevSnapshot, form)
        const sections = [...new Set(diffResult.map(d => d.section))] as ChangedSection[]
        setNotifyModal({ diffItems: diffResult, changedSections: sections })
      } else {
        setTimeout(() => onSaved(workerIds.length), 1500)
      }
    }
    setSaving(false)
  }

  const handleGenerateDoc = async () => {
    if (!notifyModal) return
    setGeneratingDoc(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const res = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: 'todoke_joken_henkou',
          workerId: primaryId,
          changeDate: form.effective_date || today,
          changedSections: notifyModal.changedSections,
        }),
      })
      if (!res.ok) {
        const { error } = await res.json()
        alert(`書類生成エラー: ${error}`)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `随時届出_条件変更_${workerName || primaryId}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      setNotifyModal(null)
      onSaved(1)
    } catch {
      alert('書類生成中にエラーが発生しました')
    } finally {
      setGeneratingDoc(false)
    }
  }

  const numInp = (k: keyof Form, min?: number, max?: number) => (
    <input type="number" style={inp} value={(form[k] as number | null) ?? ''} min={min} max={max}
      onChange={e => s(k, e.target.value === '' ? null : Number(e.target.value) as Form[typeof k])} />
  )
  const txtInp = (k: keyof Form, placeholder?: string) => (
    <input type="text" style={inp} value={(form[k] ?? '') as string} placeholder={placeholder}
      onChange={e => s(k, e.target.value as Form[typeof k])} />
  )
  const timeInp = (k: keyof Form) => (
    <input type="time" style={inp} value={(form[k] ?? '') as string}
      onChange={e => s(k, e.target.value as Form[typeof k])} />
  )

  const renderStep1 = () => (
    <>
      <Divider label="契約期間" />
      <G2>
        <F label="契約開始日" req><input type="date" style={inp} value={form.contract_start_date} onChange={e => s('contract_start_date', e.target.value)} /></F>
        <F label="契約終了日"><input type="date" style={inp} value={form.contract_end_date} onChange={e => s('contract_end_date', e.target.value)} /></F>
        <F label="入国予定日"><input type="date" style={inp} value={form.planned_entry_date} onChange={e => s('planned_entry_date', e.target.value)} /></F>
      </G2>
      <Toggle val={form.contract_renewable} onChange={v => s('contract_renewable', v)} label="契約更新あり" />
      <Divider label="就業場所" />
      <F label="派遣形態">
        <select style={sel} value={form.workplace_type} onChange={e => s('workplace_type', e.target.value)}>
          <option value="direct">直接雇用</option>
          <option value="dispatch">派遣</option>
        </select>
      </F>
      <G2>
        <F label="就業場所名称" req>{txtInp('workplace_name', 'デモ株式会社 本社工場')}</F>
        <F label="電話番号">{txtInp('workplace_phone', '03-1234-5678')}</F>
      </G2>
      <F label="就業場所住所">{txtInp('workplace_address', '東京都千代田区丸の内1-1-1')}</F>
      <Divider label="業務内容" />
      <G2>
        <F label="業務の種類・分野" req>{txtInp('industry_field', '飲食料品製造業')}</F>
        <F label="従事すべき業務の内容" req>{txtInp('job_category', '飲食料品製造業務')}</F>
      </G2>
    </>
  )

  const renderStep2 = () => (
    <>
      <Divider label="所定労働時間" />
      <G3>
        <F label="始業時刻" req>{timeInp('work_start_time')}</F>
        <F label="終業時刻" req>{timeInp('work_end_time')}</F>
        <F label="休憩時間(分)">{numInp('break_minutes', 0)}</F>
      </G3>
      <G3>
        <F label="1日の所定時間(時)"><input type="number" style={inp} value={form.daily_scheduled_hours ?? ''} min={0} max={24} onChange={e => s('daily_scheduled_hours', e.target.value === '' ? null : Number(e.target.value))} /></F>
        <F label="1日の所定時間(分)"><input type="number" style={inp} value={form.daily_scheduled_minutes ?? ''} min={0} max={59} onChange={e => s('daily_scheduled_minutes', e.target.value === '' ? null : Number(e.target.value))} /></F>
      </G3>
      <G3>
        <F label="週所定時間(時)">{numInp('weekly_scheduled_hours', 0)}</F>
        <F label="週所定時間(分)">{numInp('weekly_scheduled_minutes', 0, 59)}</F>
        <F label="週所定日数">{numInp('weekly_scheduled_days', 0, 7)}</F>
      </G3>
      <G3>
        <F label="月所定時間">{numInp('monthly_scheduled_hours', 0)}</F>
        <F label="年所定時間">{numInp('annual_scheduled_hours', 0)}</F>
        <F label="年所定日数">{numInp('annual_scheduled_days', 0)}</F>
      </G3>
      <Divider label="時間外労働・変形制" />
      <Toggle val={form.overtime_exists} onChange={v => s('overtime_exists', v)} label="時間外労働あり（36協定）" />
      <Toggle val={form.henkou_roudou_jikan} onChange={v => s('henkou_roudou_jikan', v)} label="変形労働時間制あり" />
      {form.henkou_roudou_jikan && (
        <F label="変形労働時間制の単位">
          <select style={sel} value={form.henkou_roudou_jikan_unit} onChange={e => s('henkou_roudou_jikan_unit', e.target.value)}>
            <option value="">選択してください</option>
            <option value="1month">1ヶ月単位</option>
            <option value="1year">1年単位</option>
            <option value="week">1週間単位</option>
          </select>
        </F>
      )}
      <Divider label="交代制シフト" />
      <Toggle val={form.kotai_sei} onChange={v => s('kotai_sei', v)} label="交代制勤務あり" />
      {form.kotai_sei && (
        <>
          {([1, 2, 3] as const).map(n => (
            <div key={n} style={{ background: '#f9f9f9', border: '1px solid #ececec', borderRadius: 8, padding: '12px 14px', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 10 }}>シフト {n}</div>
              <G3>
                <F label="始業">{timeInp(`shift${n}_start_time` as keyof Form)}</F>
                <F label="終業">{timeInp(`shift${n}_end_time` as keyof Form)}</F>
                <F label="対象曜日">{txtInp(`shift${n}_days` as keyof Form, '月〜金')}</F>
              </G3>
              <G2>
                <F label="1日(時)">{numInp(`shift${n}_daily_hours` as keyof Form, 0)}</F>
                <F label="1日(分)">{numInp(`shift${n}_daily_minutes` as keyof Form, 0, 59)}</F>
              </G2>
            </div>
          ))}
        </>
      )}
    </>
  )

  const renderStep3 = () => (
    <>
      <Divider label="休憩時間" />
      <F label="休憩時間（分）" req>{numInp('break_minutes', 0)}</F>
      <Divider label="休日" />
      <F label="所定休日" req>{txtInp('regular_holiday_days', '土曜日、日曜日、祝日')}</F>
      <F label="不規則・変動的な休日の詳細">{txtInp('irregular_holiday_info', '例：シフト制による')}</F>
      <G2>
        <F label="年間休日日数">{numInp('annual_holiday_days', 0, 366)}</F>
        <F label="年次有給休暇日数">{numInp('annual_paid_leave_days', 0, 40)}</F>
      </G2>
      <Divider label="その他の休暇" />
      <F label="有給の特別休暇">{txtInp('other_paid_leave', '例：慶弔休暇5日など')}</F>
      <F label="無給の特別休暇">{txtInp('other_unpaid_leave', '例：介護休業など')}</F>
    </>
  )

  const renderStep4 = () => (
    <>
      <Divider label="基本賃金" />
      <G2>
        <F label="賃金形態">
          <select style={sel} value={form.wage_type} onChange={e => s('wage_type', e.target.value)}>
            <option value="monthly">月給</option>
            <option value="daily">日給</option>
            <option value="hourly">時間給</option>
          </select>
        </F>
        <F label="基本給（円）" req>{numInp('basic_wage', 0)}</F>
      </G2>
      <Divider label="手当（a〜d）" />
      {([1, 2, 3, 4] as const).map(n => (
        <div key={n} style={{ background: '#f9f9f9', border: '1px solid #ececec', borderRadius: 8, padding: '12px 14px', marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 10 }}>手当 {String.fromCharCode(96 + n).toUpperCase()}</div>
          <G3>
            <F label="手当名">{txtInp(`allowance_${n}_name` as keyof Form, '例：通勤手当')}</F>
            <F label="金額（円）">{numInp(`allowance_${n}_amount` as keyof Form, 0)}</F>
            <F label="計算方法・支給条件">{txtInp(`allowance_${n}_calc_method` as keyof Form, '例：実費支給')}</F>
          </G3>
        </div>
      ))}
      <Divider label="割増賃金率（%）" />
      <G3>
        <F label="時間外（60時間未満）">{numInp('overtime_rate_under60', 0)}</F>
        <F label="時間外（60時間超）">{numInp('overtime_rate_over60', 0)}</F>
        <F label="所定超">{numInp('overtime_rate_prescribed', 0)}</F>
      </G3>
      <G3>
        <F label="法定休日">{numInp('holiday_rate_statutory', 0)}</F>
        <F label="法定外休日">{numInp('holiday_rate_non_statutory', 0)}</F>
        <F label="深夜">{numInp('late_night_rate', 0)}</F>
      </G3>
      <Divider label="賃金支払" />
      <G3>
        <F label="締切日">
          <select style={sel} value={form.wage_cutoff_day ?? ''} onChange={e => s('wage_cutoff_day', Number(e.target.value))}>
            {[15, 20, 25, 31].map(d => <option key={d} value={d}>{d === 31 ? '月末' : `${d}日`}</option>)}
          </select>
        </F>
        <F label="支払日">
          <select style={sel} value={form.wage_payment_day ?? ''} onChange={e => s('wage_payment_day', Number(e.target.value))}>
            {[15, 20, 25, 31].map(d => <option key={d} value={d}>{d === 31 ? '月末' : `${d}日`}</option>)}
          </select>
        </F>
        <F label="支払方法">
          <select style={sel} value={form.wage_payment_method} onChange={e => s('wage_payment_method', e.target.value)}>
            <option value="bank">銀行振込</option>
            <option value="cash">現金</option>
          </select>
        </F>
      </G3>
      <Toggle val={form.wage_deduction_agreement} onChange={v => s('wage_deduction_agreement', v)} label="賃金控除に関する協定あり" />
      <Divider label="昇給・賞与・退職金" />
      <Toggle val={form.salary_increase_exists} onChange={v => s('salary_increase_exists', v)} label="昇給あり" />
      {form.salary_increase_exists && <F label="昇給の詳細">{txtInp('salary_increase_details', '例：年1回（4月）')}</F>}
      <Toggle val={form.bonus_exists} onChange={v => s('bonus_exists', v)} label="賞与あり" />
      {form.bonus_exists && <F label="賞与の詳細">{txtInp('bonus_details', '例：年2回（7月・12月）')}</F>}
      <Toggle val={form.severance_pay_exists} onChange={v => s('severance_pay_exists', v)} label="退職金あり" />
      {form.severance_pay_exists && <F label="退職金の詳細">{txtInp('severance_pay_details')}</F>}
      <Toggle val={form.work_injury_allowance_exists} onChange={v => s('work_injury_allowance_exists', v)} label="職業病補償あり" />
      {form.work_injury_allowance_exists && <F label="補償率・詳細">{txtInp('work_injury_allowance_rate')}</F>}
    </>
  )

  const renderStep5 = () => (
    <>
      <p style={{ fontSize: 13, color: '#888', margin: '0 0 16px' }}>月額の控除予定額（概算）を入力してください。空欄は未設定扱いです。</p>
      <Divider label="法定控除" />
      <G2>
        <F label="所得税（円）">{numInp('deduction_tax', 0)}</F>
        <F label="社会保険料（円）">{numInp('deduction_social_insurance', 0)}</F>
        <F label="雇用保険料（円）">{numInp('deduction_employment_insurance', 0)}</F>
      </G2>
      <Divider label="現物控除" />
      <G3>
        <F label="食費（円）">{numInp('deduction_food', 0)}</F>
        <F label="住居費（円）">{numInp('deduction_housing', 0)}</F>
        <F label="光熱費（円）">{numInp('deduction_utilities', 0)}</F>
      </G3>
      <Divider label="その他控除" />
      <G2>
        <F label="その他①名称">{txtInp('deduction_other_1_name')}</F>
        <F label="その他①金額（円）">{numInp('deduction_other_1_amount', 0)}</F>
        <F label="その他②名称">{txtInp('deduction_other_2_name')}</F>
        <F label="その他②金額（円）">{numInp('deduction_other_2_amount', 0)}</F>
      </G2>
    </>
  )

  const renderStep6 = () => (
    <>
      {!isBulk && isEditing && (
        <>
          <Divider label="変更情報" />
          <F label="変更適用日">
            <input type="date" style={inp} value={form.effective_date} onChange={e => s('effective_date', e.target.value)} />
          </F>
          <F label="変更理由（随時届出・変更内容の記録用）">
            <input type="text" style={inp} value={form.change_reason}
              placeholder="例：昇給に伴う基本給変更、就業場所変更など"
              onChange={e => s('change_reason', e.target.value)} />
          </F>
        </>
      )}
      <Divider label="社会保険・労働保険" />
      {[
        { k: 'insurance_kosei_nenkin' as const, label: '厚生年金保険', sub: '加入' },
        { k: 'insurance_kenko' as const, label: '健康保険', sub: '加入' },
        { k: 'insurance_koyo' as const, label: '雇用保険', sub: '加入' },
        { k: 'insurance_rousai' as const, label: '労災保険', sub: '加入' },
        { k: 'insurance_kokumin_nenkin' as const, label: '国民年金', sub: '（厚生年金未加入の場合）' },
        { k: 'insurance_kokumin_kenko' as const, label: '国民健康保険', sub: '（健康保険未加入の場合）' },
      ].map(({ k, label, sub }) => (
        <Toggle key={k} val={form[k] as boolean} onChange={v => s(k, v)} label={label} sub={sub} />
      ))}
      <Divider label="健康診断" />
      <G3>
        <F label="採用時健康診断">
          <input type="month" style={inp} value={form.health_checkup_on_hire} onChange={e => s('health_checkup_on_hire', e.target.value)} />
        </F>
        <F label="初回定期健康診断">
          <input type="month" style={inp} value={form.health_checkup_first} onChange={e => s('health_checkup_first', e.target.value)} />
        </F>
        <F label="実施間隔">
          <select style={sel} value={form.health_checkup_interval} onChange={e => s('health_checkup_interval', e.target.value)}>
            <option value="1年ごと">1年ごと</option>
            <option value="6ヶ月ごと">6ヶ月ごと</option>
            <option value="3ヶ月ごと">3ヶ月ごと</option>
          </select>
        </F>
      </G3>
    </>
  )

  const stepContent = [renderStep1, renderStep2, renderStep3, renderStep4, renderStep5, renderStep6]

  return (
    <>
      {/* タイトル */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: '#000' }}>
          {isBulk ? `${workerIds.length}名に雇用条件を一括適用` : '雇用条件入力'}
        </h1>
        {!isBulk && workerName && <p style={{ margin: 0, fontSize: 14, color: '#666' }}>{workerName}</p>}
        {isBulk && <p style={{ margin: 0, fontSize: 13, color: '#888' }}>選択した{workerIds.length}名全員に同じ雇用条件を適用します</p>}
      </div>

      {/* プログレスバー */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 12, padding: '20px 24px', marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {STEPS.map((label, i) => {
            const n = i + 1
            const done = step > n; const active = step === n
            return (
              <div key={n} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                {i > 0 && (
                  <div style={{ position: 'absolute', top: 14, right: '50%', width: '100%', height: 2, background: done ? '#0066cc' : '#e0e0e0', zIndex: 0 }} />
                )}
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: done ? '#0066cc' : active ? '#0066cc' : '#e0e0e0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, zIndex: 1, position: 'relative' }}>
                  {done ? '✓' : n}
                </div>
                <div style={{ fontSize: 11, color: active ? '#0066cc' : done ? '#0066cc' : '#999', fontWeight: active ? 700 : 400, marginTop: 4, textAlign: 'center', whiteSpace: 'nowrap' }}>
                  {label}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* フォームカード */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#666' }}>読み込み中...</div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 12, padding: '28px 32px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <h2 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#000' }}>
            Step {step}：{STEPS[step - 1]}
          </h2>

          {stepContent[step - 1]()}

          {errors.length > 0 && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 16px', marginTop: 20 }}>
              {errors.map((e, i) => (
                <div key={i} style={{ fontSize: 13, color: '#dc2626', fontWeight: 600 }}>⚠ {e}</div>
              ))}
            </div>
          )}

          <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 20, marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={step === 1 ? onCancel : goBack}
              style={{ background: 'none', border: '1px solid #d0d0d0', borderRadius: 6, padding: '10px 24px', fontSize: 14, color: '#333', cursor: 'pointer' }}>
              {step === 1 ? 'キャンセル' : '← 前へ'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {saved && <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>✓ 保存しました</span>}
              {step < STEPS.length ? (
                <button onClick={goNext} style={{ background: '#0066cc', border: 'none', borderRadius: 6, padding: '10px 28px', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                  次へ →
                </button>
              ) : (
                <button onClick={handleSave} disabled={saving} style={{ background: saving ? '#e0e0e0' : '#16a34a', border: 'none', borderRadius: 6, padding: '10px 28px', color: saving ? '#999' : '#fff', fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? '保存中...' : (isBulk ? `✓ ${workerIds.length}名に保存する` : '✓ 保存する')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 随時届出ポップアップ（単独編集・特定技能1号のみ） */}
      {notifyModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '28px 32px', width: 620, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
              <div style={{ fontSize: 30, lineHeight: 1 }}>⚠️</div>
              <div>
                <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: '#b45309' }}>随時届出が必要です</h3>
                <p style={{ margin: 0, fontSize: 13, color: '#555', lineHeight: 1.7 }}>
                  雇用条件を変更しました。<br />
                  <strong>14日以内に随時届出（参考様式第3-1-1号）</strong>の提出が必要です。
                </p>
              </div>
            </div>
            {notifyModal.diffItems.length > 0 ? (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '14px 16px', marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 10 }}>変更内容</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #fde68a' }}>
                      <th style={{ textAlign: 'left', padding: '4px 8px', color: '#555', fontWeight: 600, width: '36%' }}>項目</th>
                      <th style={{ textAlign: 'left', padding: '4px 8px', color: '#dc2626', fontWeight: 600, width: '30%' }}>変更前</th>
                      <th style={{ textAlign: 'left', padding: '4px 8px', color: '#16a34a', fontWeight: 600, width: '34%' }}>変更後</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notifyModal.diffItems.map(({ item }, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #fef3c7' }}>
                        <td style={{ padding: '6px 8px', color: '#374151', fontWeight: 500 }}>{item.label}</td>
                        <td style={{ padding: '6px 8px', color: '#dc2626' }}>{item.before}</td>
                        <td style={{ padding: '6px 8px', color: '#16a34a', fontWeight: 600 }}>{item.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', marginBottom: 24, fontSize: 13, color: '#666' }}>
                変更内容を自動検出できませんでした。届出書で内容を確認してください。
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => { setNotifyModal(null); onSaved(1) }}
                style={{ padding: '10px 22px', borderRadius: 8, border: '1px solid #d0d0d0', background: '#fff', color: '#555', fontSize: 14, cursor: 'pointer', fontWeight: 500 }}>
                後で作成
              </button>
              <button onClick={handleGenerateDoc} disabled={generatingDoc}
                style={{ padding: '10px 22px', borderRadius: 8, border: 'none', background: generatingDoc ? '#e5e7eb' : '#0066cc', color: generatingDoc ? '#9ca3af' : '#fff', fontSize: 14, cursor: generatingDoc ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                {generatingDoc ? '⏳ 生成中...' : '📄 今すぐ届出書を作成'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
