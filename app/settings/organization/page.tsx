'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppHeader from '@/components/AppHeader'

const ORG_ID = '11111111-1111-1111-1111-111111111111'

type OrgBasic = {
  name: string
  name_kana: string
  address: string
  phone: string
  representative_title: string
  representative_name: string
  corporate_number: string
  industry: string
  support_office_address: string
  support_office_phone: string
  support_supervisor_name: string
  support_supervisor_kana: string
  support_supervisor_title: string
  support_staff_name: string
  support_staff_kana: string
  support_staff_title: string
}

type OrgDefaults = {
  work_start_time: string
  work_end_time: string
  break_minutes: number
  has_36_agreement: boolean
  has_flex_time: boolean
  social_insurance_enrolled: boolean
}

type ShienTemplate = {
  shien_jizen_guidance: string
  shien_housing: string
  shien_life_support: string
  shien_japanese: string
  shien_consultation: string
  shien_japanese_contact: string
  shien_job_change: string
  shien_regular_meeting: string
  shien_jizen_guidance_plan: boolean
  shien_housing_plan: boolean
  shien_life_support_plan: boolean
  shien_japanese_plan: boolean
  shien_consultation_plan: boolean
  shien_japanese_contact_plan: boolean
  shien_job_change_plan: boolean
  shien_regular_meeting_plan: boolean
  shien_outsource: boolean
  shien_staff_address: string
}

const EMPTY_BASIC: OrgBasic = {
  name: '',
  name_kana: '',
  address: '',
  phone: '',
  representative_title: '',
  representative_name: '',
  corporate_number: '',
  industry: '',
  support_office_address: '',
  support_office_phone: '',
  support_supervisor_name: '',
  support_supervisor_kana: '',
  support_supervisor_title: '',
  support_staff_name: '',
  support_staff_kana: '',
  support_staff_title: '',
}

const EMPTY_DEFAULTS: OrgDefaults = {
  work_start_time: '09:00',
  work_end_time: '18:00',
  break_minutes: 60,
  has_36_agreement: false,
  has_flex_time: false,
  social_insurance_enrolled: true,
}

const EMPTY_SHIEN: ShienTemplate = {
  shien_jizen_guidance: '',
  shien_housing: '',
  shien_life_support: '',
  shien_japanese: '',
  shien_consultation: '',
  shien_japanese_contact: '',
  shien_job_change: '',
  shien_regular_meeting: '',
  shien_jizen_guidance_plan: true,
  shien_housing_plan: true,
  shien_life_support_plan: true,
  shien_japanese_plan: true,
  shien_consultation_plan: true,
  shien_japanese_contact_plan: true,
  shien_job_change_plan: true,
  shien_regular_meeting_plan: true,
  shien_outsource: false,
  shien_staff_address: '',
}

export default function OrganizationSettings() {
  const [tab, setTab] = useState<'basic' | 'defaults' | 'shien'>('basic')
  const [basic, setBasic] = useState<OrgBasic>(EMPTY_BASIC)
  const [defaults, setDefaults] = useState<OrgDefaults>(EMPTY_DEFAULTS)
  const [shien, setShien] = useState<ShienTemplate>(EMPTY_SHIEN)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const fetchAll = async () => {
      const [orgRes, defRes] = await Promise.all([
        supabase.from('organizations').select('name,name_kana,address,phone,representative_title,representative_name,corporate_number,industry,support_office_address,support_office_phone,support_supervisor_name,support_supervisor_kana,support_supervisor_title,support_staff_name,support_staff_kana,support_staff_title,shien_jizen_guidance,shien_housing,shien_life_support,shien_japanese,shien_consultation,shien_japanese_contact,shien_job_change,shien_regular_meeting,shien_jizen_guidance_plan,shien_housing_plan,shien_life_support_plan,shien_japanese_plan,shien_consultation_plan,shien_japanese_contact_plan,shien_job_change_plan,shien_regular_meeting_plan,shien_outsource,shien_staff_address').eq('id', ORG_ID).single(),
        supabase.from('organization_defaults').select('*').eq('organization_id', ORG_ID).maybeSingle(),
      ])
      if (orgRes.data) {
        setBasic({
          name: orgRes.data.name ?? '',
          name_kana: orgRes.data.name_kana ?? '',
          address: orgRes.data.address ?? '',
          phone: orgRes.data.phone ?? '',
          representative_title: orgRes.data.representative_title ?? '',
          representative_name: orgRes.data.representative_name ?? '',
          corporate_number: orgRes.data.corporate_number ?? '',
          industry: orgRes.data.industry ?? '',
          support_office_address: orgRes.data.support_office_address ?? '',
          support_office_phone: orgRes.data.support_office_phone ?? '',
          support_supervisor_name: orgRes.data.support_supervisor_name ?? '',
          support_supervisor_kana: orgRes.data.support_supervisor_kana ?? '',
          support_supervisor_title: orgRes.data.support_supervisor_title ?? '',
          support_staff_name: orgRes.data.support_staff_name ?? '',
          support_staff_kana: orgRes.data.support_staff_kana ?? '',
          support_staff_title: orgRes.data.support_staff_title ?? '',
        })
        setShien({
          shien_jizen_guidance: orgRes.data.shien_jizen_guidance ?? '',
          shien_housing: orgRes.data.shien_housing ?? '',
          shien_life_support: orgRes.data.shien_life_support ?? '',
          shien_japanese: orgRes.data.shien_japanese ?? '',
          shien_consultation: orgRes.data.shien_consultation ?? '',
          shien_japanese_contact: orgRes.data.shien_japanese_contact ?? '',
          shien_job_change: orgRes.data.shien_job_change ?? '',
          shien_regular_meeting: orgRes.data.shien_regular_meeting ?? '',
          shien_jizen_guidance_plan: orgRes.data.shien_jizen_guidance_plan ?? true,
          shien_housing_plan: orgRes.data.shien_housing_plan ?? true,
          shien_life_support_plan: orgRes.data.shien_life_support_plan ?? true,
          shien_japanese_plan: orgRes.data.shien_japanese_plan ?? true,
          shien_consultation_plan: orgRes.data.shien_consultation_plan ?? true,
          shien_japanese_contact_plan: orgRes.data.shien_japanese_contact_plan ?? true,
          shien_job_change_plan: orgRes.data.shien_job_change_plan ?? true,
          shien_regular_meeting_plan: orgRes.data.shien_regular_meeting_plan ?? true,
          shien_outsource: orgRes.data.shien_outsource ?? false,
          shien_staff_address: orgRes.data.shien_staff_address ?? '',
        })
      }
      if (defRes.data) {
        setDefaults({
          work_start_time: defRes.data.work_start_time ?? '09:00',
          work_end_time: defRes.data.work_end_time ?? '18:00',
          break_minutes: defRes.data.break_minutes ?? 60,
          has_36_agreement: defRes.data.has_36_agreement ?? false,
          has_flex_time: defRes.data.has_flex_time ?? false,
          social_insurance_enrolled: defRes.data.social_insurance_enrolled ?? true,
        })
      }
      setLoading(false)
    }
    fetchAll()
  }, [])

  const saveBasic = async () => {
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase
      .from('organizations')
      .update({
        name: basic.name,
        name_kana: basic.name_kana || null,
        address: basic.address,
        phone: basic.phone,
        representative_title: basic.representative_title,
        representative_name: basic.representative_name,
        corporate_number: basic.corporate_number || null,
        industry: basic.industry || null,
        support_office_address: basic.support_office_address || null,
        support_office_phone: basic.support_office_phone || null,
        support_supervisor_name: basic.support_supervisor_name || null,
        support_supervisor_kana: basic.support_supervisor_kana || null,
        support_supervisor_title: basic.support_supervisor_title || null,
        support_staff_name: basic.support_staff_name || null,
        support_staff_kana: basic.support_staff_kana || null,
        support_staff_title: basic.support_staff_title || null,
      })
      .eq('id', ORG_ID)
    if (err) {
      console.error('saveBasic error:', err)
      setError(err.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
    setSaving(false)
  }

  const saveDefaults = async () => {
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase
      .from('organization_defaults')
      .upsert({
        organization_id: ORG_ID,
        work_start_time: defaults.work_start_time,
        work_end_time: defaults.work_end_time,
        break_minutes: defaults.break_minutes,
        has_36_agreement: defaults.has_36_agreement,
        has_flex_time: defaults.has_flex_time,
        social_insurance_enrolled: defaults.social_insurance_enrolled,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id' })
    if (err) {
      setError(err.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
    setSaving(false)
  }

  const saveShien = async () => {
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase
      .from('organizations')
      .update({
        shien_jizen_guidance: shien.shien_jizen_guidance || null,
        shien_housing: shien.shien_housing || null,
        shien_life_support: shien.shien_life_support || null,
        shien_japanese: shien.shien_japanese || null,
        shien_consultation: shien.shien_consultation || null,
        shien_japanese_contact: shien.shien_japanese_contact || null,
        shien_job_change: shien.shien_job_change || null,
        shien_regular_meeting: shien.shien_regular_meeting || null,
        shien_jizen_guidance_plan: shien.shien_jizen_guidance_plan,
        shien_housing_plan: shien.shien_housing_plan,
        shien_life_support_plan: shien.shien_life_support_plan,
        shien_japanese_plan: shien.shien_japanese_plan,
        shien_consultation_plan: shien.shien_consultation_plan,
        shien_japanese_contact_plan: shien.shien_japanese_contact_plan,
        shien_job_change_plan: shien.shien_job_change_plan,
        shien_regular_meeting_plan: shien.shien_regular_meeting_plan,
        shien_outsource: shien.shien_outsource,
        shien_staff_address: shien.shien_staff_address || null,
      })
      .eq('id', ORG_ID)
    if (err) {
      console.error('saveShien error:', err)
      setError(err.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
    setSaving(false)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    border: '1px solid #d0d0d0',
    borderRadius: 6,
    padding: '9px 12px',
    fontSize: 14,
    color: '#111',
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: '#555',
    marginBottom: 4,
    display: 'block',
  }

  const fieldStyle: React.CSSProperties = {
    marginBottom: 18,
  }

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    position: 'relative',
    display: 'inline-block',
    width: 44,
    height: 24,
    background: active ? '#0066cc' : '#ccc',
    borderRadius: 12,
    cursor: 'pointer',
    transition: 'background 0.2s',
    flexShrink: 0,
  })

  const toggleKnobStyle = (active: boolean): React.CSSProperties => ({
    position: 'absolute',
    top: 3,
    left: active ? 23 : 3,
    width: 18,
    height: 18,
    background: '#fff',
    borderRadius: '50%',
    transition: 'left 0.2s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
  })

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui,sans-serif' }}>
      {/* Header */}
      <AppHeader currentPage="settings" />

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
        {/* Page title */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#000' }}>設定</h1>
          <p style={{ margin: 0, fontSize: 14, color: '#666' }}>会社情報・新規登録時の初期値・支援計画テンプレートを管理します</p>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e0e0e0', marginBottom: 24 }}>
          {(['basic', 'defaults', 'shien'] as const).map(t => {
            const labels = { basic: '会社情報', defaults: '新規登録時の初期値', shien: '支援計画テンプレート（特定技能）' }
            const active = tab === t
            return (
              <button
                key={t}
                onClick={() => { setTab(t); setError(null); setSaved(false) }}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: active ? '2px solid #0066cc' : '2px solid transparent',
                  padding: '10px 20px',
                  fontSize: 14,
                  fontWeight: active ? 700 : 400,
                  color: active ? '#0066cc' : '#555',
                  cursor: 'pointer',
                  marginBottom: -1,
                }}
              >
                {labels[t]}
              </button>
            )
          })}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#666' }}>読み込み中...</div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 12, padding: '28px 32px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>

            {/* ── Tab A: 基本情報 ── */}
            {tab === 'basic' && (
              <>
                <p style={{ margin: '0 0 24px', fontSize: 13, color: '#888' }}>
                  雇用条件書や各種届出など、生成する書類に記載される会社の基本情報と支援担当者を登録します。
                </p>

                <div style={fieldStyle}>
                  <label style={labelStyle}>会社名 *</label>
                  <input style={inputStyle} value={basic.name} onChange={e => setBasic(p => ({ ...p, name: e.target.value }))} placeholder="例：株式会社TrustLayer" />
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>会社名（フリガナ）</label>
                  <input style={inputStyle} value={basic.name_kana} onChange={e => setBasic(p => ({ ...p, name_kana: e.target.value }))} placeholder="例：カブシキガイシャトラストレイヤー" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>代表者役職</label>
                    <input style={inputStyle} value={basic.representative_title} onChange={e => setBasic(p => ({ ...p, representative_title: e.target.value }))} placeholder="例：代表取締役" />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>代表者氏名</label>
                    <input style={inputStyle} value={basic.representative_name} onChange={e => setBasic(p => ({ ...p, representative_name: e.target.value }))} placeholder="例：田中 太郎" />
                  </div>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>本店所在地</label>
                  <input style={inputStyle} value={basic.address} onChange={e => setBasic(p => ({ ...p, address: e.target.value }))} placeholder="例：東京都千代田区丸の内1-1-1" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>TEL</label>
                    <input style={inputStyle} value={basic.phone} onChange={e => setBasic(p => ({ ...p, phone: e.target.value }))} placeholder="例：03-1234-5678" />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>法人番号</label>
                    <input style={inputStyle} value={basic.corporate_number} onChange={e => setBasic(p => ({ ...p, corporate_number: e.target.value }))} placeholder="例：1234567890123" maxLength={13} />
                  </div>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>業種</label>
                  <input style={inputStyle} value={basic.industry} onChange={e => setBasic(p => ({ ...p, industry: e.target.value }))} placeholder="例：製造業、建設業、飲食業など" />
                </div>

                {/* 支援担当情報 */}
                <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 8, paddingTop: 24, marginBottom: 8 }}>
                  <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#111' }}>支援担当情報</h3>
                  <p style={{ margin: '0 0 20px', fontSize: 12, color: '#888' }}>支援計画書（参考様式第1-17号）に記載します</p>

                  <div style={fieldStyle}>
                    <label style={labelStyle}>支援担当事務所の住所</label>
                    <input style={inputStyle} value={basic.support_office_address} onChange={e => setBasic(p => ({ ...p, support_office_address: e.target.value }))} placeholder="例：東京都千代田区丸の内1-1-1" />
                  </div>

                  <div style={fieldStyle}>
                    <label style={labelStyle}>支援担当事務所の電話番号</label>
                    <input style={inputStyle} value={basic.support_office_phone} onChange={e => setBasic(p => ({ ...p, support_office_phone: e.target.value }))} placeholder="例：03-1234-5678" />
                  </div>

                  <div style={{ borderLeft: '3px solid #e0e0e0', paddingLeft: 16, marginBottom: 20 }}>
                    <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 600, color: '#555' }}>支援責任者</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <div style={fieldStyle}>
                        <label style={labelStyle}>氏名</label>
                        <input style={inputStyle} value={basic.support_supervisor_name} onChange={e => setBasic(p => ({ ...p, support_supervisor_name: e.target.value }))} placeholder="例：田中 太郎" />
                      </div>
                      <div style={fieldStyle}>
                        <label style={labelStyle}>氏名（フリガナ）</label>
                        <input style={inputStyle} value={basic.support_supervisor_kana} onChange={e => setBasic(p => ({ ...p, support_supervisor_kana: e.target.value }))} placeholder="例：タナカ タロウ" />
                      </div>
                      <div style={fieldStyle}>
                        <label style={labelStyle}>役職</label>
                        <input style={inputStyle} value={basic.support_supervisor_title} onChange={e => setBasic(p => ({ ...p, support_supervisor_title: e.target.value }))} placeholder="例：支援部長" />
                      </div>
                    </div>
                  </div>

                  <div style={{ borderLeft: '3px solid #e0e0e0', paddingLeft: 16, marginBottom: 20 }}>
                    <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 600, color: '#555' }}>支援担当者</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <div style={fieldStyle}>
                        <label style={labelStyle}>氏名</label>
                        <input style={inputStyle} value={basic.support_staff_name} onChange={e => setBasic(p => ({ ...p, support_staff_name: e.target.value }))} placeholder="例：鈴木 花子" />
                      </div>
                      <div style={fieldStyle}>
                        <label style={labelStyle}>氏名（フリガナ）</label>
                        <input style={inputStyle} value={basic.support_staff_kana} onChange={e => setBasic(p => ({ ...p, support_staff_kana: e.target.value }))} placeholder="例：スズキ ハナコ" />
                      </div>
                      <div style={fieldStyle}>
                        <label style={labelStyle}>役職</label>
                        <input style={inputStyle} value={basic.support_staff_title} onChange={e => setBasic(p => ({ ...p, support_staff_title: e.target.value }))} placeholder="例：支援担当" />
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    onClick={saveBasic}
                    disabled={saving}
                    style={{ background: '#0066cc', border: 'none', borderRadius: 6, padding: '10px 28px', color: '#fff', fontWeight: 600, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
                  >
                    {saving ? '保存中...' : '保存'}
                  </button>
                  {saved && <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>✓ 保存しました</span>}
                  {error && <span style={{ fontSize: 13, color: '#dc2626' }}>{error}</span>}
                </div>
              </>
            )}

            {/* ── Tab B: デフォルト設定 ── */}
            {tab === 'defaults' && (
              <>
                <p style={{ margin: '0 0 24px', fontSize: 13, color: '#888' }}>
                  従業員の雇用条件を新しく登録するとき、自動で入力される初期値です。従業員ごとにあとから変更できます。
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>標準始業時刻</label>
                    <input type="time" style={inputStyle} value={defaults.work_start_time} onChange={e => setDefaults(p => ({ ...p, work_start_time: e.target.value }))} />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>標準終業時刻</label>
                    <input type="time" style={inputStyle} value={defaults.work_end_time} onChange={e => setDefaults(p => ({ ...p, work_end_time: e.target.value }))} />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>休憩時間（分）</label>
                    <input type="number" style={inputStyle} value={defaults.break_minutes} min={0} max={180} onChange={e => setDefaults(p => ({ ...p, break_minutes: Number(e.target.value) }))} />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
                  {([
                    { key: 'has_36_agreement', label: '36協定あり', sub: '時間外・休日労働に関する協定' },
                    { key: 'has_flex_time', label: '変形労働時間制あり', sub: '1ヶ月単位・1年単位など' },
                    { key: 'social_insurance_enrolled', label: '社会保険加入', sub: '健康保険・厚生年金' },
                  ] as { key: keyof OrgDefaults; label: string; sub: string }[]).map(({ key, label, sub }) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: '#f9f9f9', borderRadius: 8, border: '1px solid #ececec' }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{label}</div>
                        <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{sub}</div>
                      </div>
                      <div
                        style={toggleStyle(defaults[key] as boolean)}
                        onClick={() => setDefaults(p => ({ ...p, [key]: !p[key] }))}
                      >
                        <div style={toggleKnobStyle(defaults[key] as boolean)} />
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 20, marginTop: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    onClick={saveDefaults}
                    disabled={saving}
                    style={{ background: '#0066cc', border: 'none', borderRadius: 6, padding: '10px 28px', color: '#fff', fontWeight: 600, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
                  >
                    {saving ? '保存中...' : '保存'}
                  </button>
                  {saved && <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>✓ 保存しました</span>}
                  {error && <span style={{ fontSize: 13, color: '#dc2626' }}>{error}</span>}
                </div>
              </>
            )}

            {/* ── Tab C: 支援計画書テンプレート ── */}
            {tab === 'shien' && (
              <>
                <p style={{ margin: '0 0 6px', fontSize: 13, color: '#888' }}>
                  特定技能1号の従業員の支援計画書（参考様式第1-17号）に自動反映される支援内容のテンプレートです。
                </p>
                <p style={{ margin: '0 0 24px', fontSize: 13, color: '#0066cc', fontWeight: 600 }}>
                  一度設定すれば全従業員の支援計画書に自動反映されます。
                </p>

                {([
                  { key: 'shien_jizen_guidance',   planKey: 'shien_jizen_guidance_plan',   label: '① 事前ガイダンス',             placeholder: '入国前・在留資格変更前に実施する生活ガイダンスの内容・実施方法を記入してください。' },
                  { key: 'shien_housing',           planKey: 'shien_housing_plan',           label: '② 住居確保・生活支援',          placeholder: '住居の確保（社宅・物件紹介など）および生活に必要な手続きの支援内容を記入してください。' },
                  { key: 'shien_life_support',      planKey: 'shien_life_support_plan',      label: '③ 生活オリエンテーション',       placeholder: '銀行口座開設・携帯電話・ライフライン等の手続き支援の内容・実施方法を記入してください。' },
                  { key: 'shien_japanese',          planKey: 'shien_japanese_plan',          label: '④ 日本語習得支援',              placeholder: '日本語教室の紹介・費用補助・学習機会の提供など、日本語習得の支援内容を記入してください。' },
                  { key: 'shien_consultation',      planKey: 'shien_consultation_plan',      label: '⑤ 相談・苦情対応',              placeholder: '相談窓口の設置方法・対応言語・対応時間・担当者などの体制を記入してください。' },
                  { key: 'shien_japanese_contact',  planKey: 'shien_japanese_contact_plan',  label: '⑥ 日本人との交流促進',          placeholder: '地域住民や日本人社員との交流機会（行事参加・交流会等）の支援内容を記入してください。' },
                  { key: 'shien_job_change',        planKey: 'shien_job_change_plan',        label: '⑦ 転職支援（人員整理等の場合）', placeholder: '雇用契約終了時に行う転職先の確保支援（求職活動の補助・情報提供等）の内容を記入してください。' },
                  { key: 'shien_regular_meeting',   planKey: 'shien_regular_meeting_plan',   label: '⑧ 定期的な面談の実施',          placeholder: '定期面談の頻度・実施方法・面談者・記録管理の方法などを記入してください。' },
                ] as { key: keyof ShienTemplate; planKey: keyof ShienTemplate; label: string; placeholder: string }[]).map(({ key, planKey, label, placeholder }) => {
                  const plan = shien[planKey] as boolean
                  return (
                    <div key={key} style={{ ...fieldStyle, border: '1px solid #ececec', borderRadius: 8, padding: '14px 16px', background: plan ? '#fff' : '#fafafa' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <label style={{ ...labelStyle, marginBottom: 0, fontSize: 13, color: plan ? '#111' : '#999' }}>{label}</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, color: '#555' }}>実施予定：</span>
                          {(['有', '無'] as const).map(opt => {
                            const isActive = opt === '有' ? plan : !plan
                            return (
                              <button
                                key={opt}
                                onClick={() => setShien(p => ({ ...p, [planKey]: opt === '有' }))}
                                style={{
                                  padding: '3px 14px', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                  border: isActive ? '1.5px solid #0066cc' : '1px solid #ccc',
                                  background: isActive ? '#e8f0fb' : '#fff',
                                  color: isActive ? '#0066cc' : '#888',
                                }}
                              >{opt}</button>
                            )
                          })}
                        </div>
                      </div>
                      <textarea
                        rows={4}
                        disabled={!plan}
                        style={{
                          width: '100%', border: '1px solid #d0d0d0', borderRadius: 6, padding: '9px 12px',
                          fontSize: 14, color: plan ? '#111' : '#bbb', background: plan ? '#fff' : '#f5f5f5',
                          outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6,
                        }}
                        value={shien[key] as string}
                        onChange={e => setShien(p => ({ ...p, [key]: e.target.value }))}
                        placeholder={plan ? placeholder : '（実施予定：無）'}
                      />
                    </div>
                  )
                })}

                {/* 委託・担当者住所 */}
                <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 8, paddingTop: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>委託の有無</div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>支援業務を外部委託している場合は「有」を選択</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {(['有', '無'] as const).map(opt => {
                        const isActive = opt === '有' ? shien.shien_outsource : !shien.shien_outsource
                        return (
                          <button key={opt} onClick={() => setShien(p => ({ ...p, shien_outsource: opt === '有' }))}
                            style={{ padding: '3px 14px', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                              border: isActive ? '1.5px solid #0066cc' : '1px solid #ccc',
                              background: isActive ? '#e8f0fb' : '#fff', color: isActive ? '#0066cc' : '#888' }}
                          >{opt}</button>
                        )
                      })}
                    </div>
                  </div>

                  <div style={fieldStyle}>
                    <label style={labelStyle}>支援担当者の住所</label>
                    <input
                      style={inputStyle}
                      value={shien.shien_staff_address}
                      onChange={e => setShien(p => ({ ...p, shien_staff_address: e.target.value }))}
                      placeholder="例：東京都千代田区丸の内1-1-1"
                    />
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    onClick={saveShien}
                    disabled={saving}
                    style={{ background: '#0066cc', border: 'none', borderRadius: 6, padding: '10px 28px', color: '#fff', fontWeight: 600, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
                  >
                    {saving ? '保存中...' : '保存'}
                  </button>
                  {saved && <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>✓ 保存しました</span>}
                  {error && <span style={{ fontSize: 13, color: '#dc2626' }}>{error}</span>}
                </div>
              </>
            )}

          </div>
        )}
      </div>
    </div>
  )
}
