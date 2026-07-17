'use client'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppHeader from '@/components/AppHeader'
import { CheckCircle2, FileText, Sparkles, Plus } from 'lucide-react'

type PayrollRecord = {
  id: string
  target_year: number
  target_month: number
  working_days: number | null
  scheduled_hours: number | null
  overtime_hours: number | null
  bonus_pay: number | null
  basic_salary: number | null
  overtime_pay: number | null
  late_night_pay: number | null
  commuting_allowance: number | null
  other_allowance: number | null
  gross_pay: number | null
  health_insurance: number | null
  pension: number | null
  employment_insurance: number | null
  income_tax: number | null
  resident_tax: number | null
  other_deduction: number | null
  total_deduction: number | null
  net_pay: number | null
}

type ExtractedData = Omit<PayrollRecord, 'id'> & { raw?: string }

const MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12]
const MONTH_LABELS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']

const FIELDS: { key: keyof ExtractedData; label: string; section: 'labor' | 'pay' | 'ded'; unit?: string; decimal?: boolean }[] = [
  { key: 'working_days',         label: '実労働日数',           section: 'labor', unit: '日' },
  { key: 'scheduled_hours',      label: '所定内実労働時間',     section: 'labor', unit: '時間', decimal: true },
  { key: 'overtime_hours',       label: '超過実労働時間',       section: 'labor', unit: '時間', decimal: true },
  { key: 'bonus_pay',            label: '賞与等特別給与額',     section: 'labor', unit: '円' },
  { key: 'basic_salary',         label: '基本給',               section: 'pay',   unit: '円' },
  { key: 'overtime_pay',         label: '時間外手当',           section: 'pay',   unit: '円' },
  { key: 'late_night_pay',       label: '深夜手当',             section: 'pay',   unit: '円' },
  { key: 'commuting_allowance',  label: '通勤手当',             section: 'pay',   unit: '円' },
  { key: 'other_allowance',      label: 'その他手当',           section: 'pay',   unit: '円' },
  { key: 'gross_pay',            label: '支給合計',             section: 'pay',   unit: '円' },
  { key: 'health_insurance',     label: '健康保険',             section: 'ded',   unit: '円' },
  { key: 'pension',              label: '厚生年金',             section: 'ded',   unit: '円' },
  { key: 'employment_insurance', label: '雇用保険',             section: 'ded',   unit: '円' },
  { key: 'income_tax',           label: '所得税',               section: 'ded',   unit: '円' },
  { key: 'resident_tax',         label: '住民税',               section: 'ded',   unit: '円' },
  { key: 'other_deduction',      label: 'その他控除',           section: 'ded',   unit: '円' },
  { key: 'total_deduction',      label: '控除合計',             section: 'ded',   unit: '円' },
  { key: 'net_pay',              label: '差引支給額',           section: 'pay',   unit: '円' },
]

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString('ja-JP') + ' 円'
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function PayrollPage() {
  const params = useParams()
  const router = useRouter()
  const rawId = params?.id
  const workerId = Array.isArray(rawId) ? rawId[0] : (rawId as string ?? '')
  const supabase = createClient()

  // デバッグ: paramsとworkerIdをコンソールに出力
  console.log('[payroll] params:', params, 'workerId:', workerId)

  const [workerName, setWorkerName] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [records, setRecords] = useState<PayrollRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [uuidError, setUuidError] = useState(false)

  // モーダル状態
  const [modal, setModal] = useState<{ open: boolean; month: number } | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extracted, setExtracted] = useState<ExtractedData | null>(null)
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!UUID_RE.test(workerId)) {
      console.error('[payroll] invalid workerId:', workerId)
      setUuidError(true)
      setLoading(false)
      return
    }
    const load = async () => {
      const [{ data: worker }, { data: recs }] = await Promise.all([
        supabase.from('foreign_workers').select('name_kanji, name_romaji').eq('id', workerId).single(),
        supabase.from('payroll_records').select('*').eq('worker_id', workerId).eq('target_year', year),
      ])
      if (worker) setWorkerName(worker.name_kanji || worker.name_romaji)
      setRecords(recs ?? [])
      setLoading(false)
    }
    load()
  }, [workerId, year])

  const recordFor = (month: number) => records.find(r => r.target_month === month)

  const openModal = (month: number) => {
    setModal({ open: true, month })
    setFile(null)
    setExtracted(null)
  }

  const closeModal = () => {
    setModal(null)
    setFile(null)
    setExtracted(null)
  }

  const handleFile = (f: File) => {
    setFile(f)
    setExtracted(null)
  }

  const handleExtract = async () => {
    if (!file || !modal) return
    setExtracting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/payroll/extract', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) {
        alert(`読み取りエラー: ${json.error}`)
        return
      }
      const data = json.extracted as ExtractedData
      // 対象年月をモーダルの月で上書き（テンプレートから読めない場合のフォールバック）
      data.target_year = data.target_year ?? year
      data.target_month = data.target_month ?? modal.month
      setExtracted(data)
    } catch (e) {
      alert('通信エラーが発生しました。')
    } finally {
      setExtracting(false)
    }
  }

  const handleSave = async () => {
    if (!extracted || !modal) return
    if (!UUID_RE.test(workerId)) {
      alert('従業員IDが無効です。従業員詳細ページから再度開いてください。')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('payroll_records').upsert(
        {
          worker_id: workerId,
          target_year: year,
          target_month: modal.month,
          working_days: extracted.working_days,
          scheduled_hours: extracted.scheduled_hours,
          overtime_hours: extracted.overtime_hours,
          bonus_pay: extracted.bonus_pay,
          basic_salary: extracted.basic_salary,
          overtime_pay: extracted.overtime_pay,
          late_night_pay: extracted.late_night_pay,
          commuting_allowance: extracted.commuting_allowance,
          other_allowance: extracted.other_allowance,
          gross_pay: extracted.gross_pay,
          health_insurance: extracted.health_insurance,
          pension: extracted.pension,
          employment_insurance: extracted.employment_insurance,
          income_tax: extracted.income_tax,
          resident_tax: extracted.resident_tax,
          other_deduction: extracted.other_deduction,
          total_deduction: extracted.total_deduction,
          net_pay: extracted.net_pay,
        },
        { onConflict: 'worker_id,target_year,target_month' }
      )
      if (error) throw error

      // 一覧を更新
      const { data: recs } = await supabase
        .from('payroll_records').select('*')
        .eq('worker_id', workerId).eq('target_year', year)
      setRecords(recs ?? [])
      closeModal()
    } catch (e) {
      console.error('[payroll save error]', e)
      alert(`保存中にエラーが発生しました。\n${e instanceof Error ? e.message : JSON.stringify(e)}`)
    } finally {
      setSaving(false)
    }
  }

  const setField = (key: keyof ExtractedData, val: string, decimal = false) => {
    if (!extracted) return
    if (val === '') { setExtracted(prev => prev ? { ...prev, [key]: null } : prev); return }
    const num = decimal ? parseFloat(val) : parseInt(val.replace(/[^0-9]/g, ''), 10)
    setExtracted(prev => prev ? { ...prev, [key]: isNaN(num) ? null : num } : prev)
  }

  const inputStyle: React.CSSProperties = {
    border: '1px solid #d0d0d0', borderRadius: 6, padding: '6px 10px',
    fontSize: 14, width: '100%', boxSizing: 'border-box', textAlign: 'right',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui,sans-serif' }}>
      <AppHeader currentPage="employees" />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
        <button onClick={() => router.push(`/employees/${workerId}`)}
          style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 13, cursor: 'pointer', marginBottom: 20, padding: 0 }}>
          ← 従業員詳細に戻る
        </button>

        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '24px', marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>賃金台帳</h1>
              {workerName && <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{workerName}</div>}
            </div>

            {/* 年切替 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => setYear(y => y - 1)}
                style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 14px', background: '#fff', cursor: 'pointer', fontSize: 14 }}>
                ← {year - 1}
              </button>
              <span style={{ fontWeight: 700, fontSize: 18, minWidth: 60, textAlign: 'center' }}>{year}年</span>
              <button onClick={() => setYear(y => y + 1)}
                style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 14px', background: '#fff', cursor: 'pointer', fontSize: 14 }}>
                {year + 1} →
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', color: '#6b7280', padding: 40 }}>読み込み中...</div>
          ) : uuidError ? (
            <div style={{ textAlign: 'center', color: '#dc2626', padding: 40 }}>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>URLエラー</div>
              <div style={{ fontSize: 14 }}>従業員IDが無効です。<br />従業員一覧から対象の従業員を選んで再度アクセスしてください。</div>
              <button onClick={() => router.push('/employees')}
                style={{ marginTop: 20, padding: '8px 20px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}>
                従業員一覧へ
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {MONTHS.map(m => {
                const rec = recordFor(m)
                return (
                  <div key={m}
                    onClick={() => openModal(m)}
                    style={{
                      borderRadius: 10, padding: '16px 14px', cursor: 'pointer',
                      border: rec ? '1px solid #bbf7d0' : '1px solid #e5e7eb',
                      background: rec ? '#f0fdf4' : '#fafafa',
                      transition: 'box-shadow 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)')}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: rec ? '#16a34a' : '#9ca3af', marginBottom: 6 }}>
                      {MONTH_LABELS[m - 1]}
                    </div>
                    {rec ? (
                      <>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
                          {fmt(rec.net_pay)}
                        </div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                          支給 {fmt(rec.gross_pay)}
                        </div>
                      </>
                    ) : (
                      <div style={{ textAlign: 'center', marginTop: 4 }}><Plus size={24} strokeWidth={2} color="#d1d5db" /></div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 年間サマリー */}
        {records.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>{year}年 年間集計</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { label: '支給合計（年）', val: records.reduce((s, r) => s + (r.gross_pay ?? 0), 0) },
                { label: '控除合計（年）', val: records.reduce((s, r) => s + (r.total_deduction ?? 0), 0) },
                { label: '手取り合計（年）', val: records.reduce((s, r) => s + (r.net_pay ?? 0), 0) },
              ].map(({ label, val }) => (
                <div key={label} style={{ background: '#f9fafb', borderRadius: 8, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>
                    {val.toLocaleString('ja-JP')} 円
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* アップロード・確認モーダル */}
      {modal?.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '28px 32px', width: 560, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
                {year}年{modal.month}月 賃金台帳
              </h3>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280', lineHeight: 1 }}>×</button>
            </div>

            {/* ① ファイルアップロードエリア */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
              style={{
                border: `2px dashed ${dragOver ? '#2563eb' : '#d1d5db'}`,
                borderRadius: 10, padding: '28px 20px', textAlign: 'center', cursor: 'pointer',
                background: dragOver ? '#eff6ff' : '#fafafa', marginBottom: 16, transition: 'all 0.15s',
              }}
            >
              <div style={{ marginBottom: 8 }}><FileText size={32} strokeWidth={1.5} color="#9ca3af" /></div>
              {file ? (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{file.name}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    {(file.size / 1024).toFixed(1)} KB — クリックで変更
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 14, color: '#374151' }}>クリックまたはドラッグ＆ドロップ</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>PDF・画像（PNG/JPG）対応</div>
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept=".pdf,image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

            {/* ② AIで読み取るボタン */}
            <button
              onClick={handleExtract}
              disabled={!file || extracting}
              style={{
                width: '100%', padding: '11px', borderRadius: 8, border: 'none', marginBottom: 20,
                background: !file || extracting ? '#e5e7eb' : '#2563eb',
                color: !file || extracting ? '#9ca3af' : '#fff',
                fontSize: 15, fontWeight: 700, cursor: !file || extracting ? 'not-allowed' : 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {extracting ? 'AI読み取り中...' : <><Sparkles size={16} strokeWidth={2} />AIで読み取る</>}
            </button>

            {/* ③ 読取結果の確認・編集フォーム */}
            {extracted && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#16a34a', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={15} strokeWidth={2.2} />読み取り完了 — 内容を確認・編集してください
                </div>

                {(['labor', 'pay', 'ded'] as const).map(section => {
                  const sectionFields = FIELDS.filter(f => f.section === section && f.key !== 'net_pay')
                  const title = section === 'labor' ? '【勤怠・賞与】' : section === 'pay' ? '【支給】' : '【控除】'
                  return (
                    <div key={section} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8, paddingBottom: 4, borderBottom: '2px solid #e5e7eb' }}>
                        {title}
                        {section === 'labor' && <span style={{ fontSize: 11, fontWeight: 400, color: '#6b7280', marginLeft: 8 }}>定期届出（第3-6号）の集計に使用</span>}
                      </div>
                      {sectionFields.map(({ key, label, unit, decimal }) => (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                          <label style={{ fontSize: 13, color: '#374151', width: 130, flexShrink: 0 }}>{label}</label>
                          <input
                            type="number"
                            step={decimal ? '0.5' : '1'}
                            value={extracted[key] != null ? String(extracted[key]) : ''}
                            onChange={e => setField(key, e.target.value, decimal)}
                            placeholder="未取得"
                            style={inputStyle}
                          />
                          <span style={{ fontSize: 12, color: '#6b7280', flexShrink: 0 }}>{unit}</span>
                        </div>
                      ))}
                    </div>
                  )
                })}

                {/* 差引支給額 */}
                <div style={{ background: '#eff6ff', borderRadius: 8, padding: '12px 14px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label style={{ fontSize: 14, fontWeight: 700, color: '#2563eb', width: 120, flexShrink: 0 }}>差引支給額</label>
                  <input
                    type="text"
                    value={extracted.net_pay != null ? String(extracted.net_pay) : ''}
                    onChange={e => setField('net_pay', e.target.value)}
                    placeholder="未取得"
                    style={{ ...inputStyle, fontWeight: 700, fontSize: 16, color: '#2563eb' }}
                  />
                  <span style={{ fontSize: 13, color: '#2563eb', fontWeight: 700, flexShrink: 0 }}>円</span>
                </div>

                {/* ④ 保存ボタン */}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 8, border: 'none',
                    background: saving ? '#e5e7eb' : '#2563eb',
                    color: saving ? '#9ca3af' : '#fff',
                    fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? '保存中...' : '保存する'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
