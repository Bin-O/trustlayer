'use client'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import AppHeader from '@/components/AppHeader'
import { COUNTRIES, NATIONALITY_TO_LANGUAGE, normalizeNationality } from '@/lib/countries'

const LANGUAGES = [
  { value: 'vi', label: 'ベトナム語' },
  { value: 'en', label: '英語' },
  { value: 'zh', label: '中国語' },
  { value: 'ja', label: '日本語' },
  { value: 'tl', label: 'タガログ語' },
  { value: 'id', label: 'インドネシア語' },
  { value: 'my', label: 'ミャンマー語' },
  { value: 'ne', label: 'ネパール語' },
  { value: 'th', label: 'タイ語' },
  { value: 'km', label: 'クメール語' },
]
const VISA_TYPES = [
  '特定技能1号', '特定技能2号',
  '技術・人文知識・国際業務', '高度専門職1号', '高度専門職2号',
  '技能実習1号イ', '技能実習1号ロ', '技能実習2号イ', '技能実習2号ロ',
  '技能実習3号イ', '技能実習3号ロ',
  '永住者', '永住者の配偶者等', '日本人の配偶者等', '定住者',
  '特定活動', '留学', '家族滞在', 'その他',
]

type Form = {
  name_kanji: string
  name_kana: string
  name_romaji: string
  nationality: string
  date_of_birth: string
  passport_number: string
  residence_card_number: string
  preferred_language: string
  status_type: string
  issued_date: string
  expiry_date: string
  gender: string
}

const EMPTY: Form = {
  name_kanji: '', name_kana: '', name_romaji: '', nationality: 'ベトナム',
  date_of_birth: '', passport_number: '', residence_card_number: '',
  preferred_language: 'vi', status_type: '特定技能1号',
  issued_date: '', expiry_date: '', gender: '',
}

type CardExtracted = {
  name_romaji: string | null
  name_kanji: string | null
  name_kana: string | null
  date_of_birth: string | null
  gender: string | null
  nationality: string | null
  status_type: string | null
  expiry_date: string | null
  residence_card_number: string | null
  issued_date: string | null
  work_restriction: string | null
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 6 }}>
        {label}{required && <span style={{ color: '#dc2626', marginLeft: 4 }}>*</span>}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db',
  borderRadius: 6, padding: '9px 12px', fontSize: 14, color: '#111',
  outline: 'none', background: '#fff',
}

export default function NewEmployee() {
  const router = useRouter()
  const [form, setForm] = useState<Form>(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractNote, setExtractNote] = useState<{ workRestriction: string | null } | null>(null)
  const [kanaFromAI, setKanaFromAI] = useState(false)
  const [langTouched, setLangTouched] = useState(false)
  const cardInputRef = useRef<HTMLInputElement>(null)

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  // 国籍変更時、使用言語が手動変更されていなければ初期値を自動設定
  const setNationality = (value: string) =>
    setForm(f => {
      const lang = NATIONALITY_TO_LANGUAGE[value]
      return { ...f, nationality: value, preferred_language: !langTouched && lang ? lang : f.preferred_language }
    })

  const handleCardFile = async (file: File) => {
    setExtracting(true)
    setError(null)
    setExtractNote(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/residence-card/extract', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) {
        setError(`在留カードの読み取りエラー: ${json.error}`)
        return
      }
      const d = json.extracted as CardExtracted
      setForm(f => {
        const nationality = d.nationality ? (normalizeNationality(d.nationality) ?? 'その他') : f.nationality
        const lang = NATIONALITY_TO_LANGUAGE[nationality]
        return {
          ...f,
          name_romaji: d.name_romaji ?? f.name_romaji,
          name_kanji: d.name_kanji ?? f.name_kanji,
          name_kana: d.name_kana ?? f.name_kana,
          date_of_birth: d.date_of_birth ?? f.date_of_birth,
          gender: d.gender === 'male' || d.gender === 'female' ? d.gender : f.gender,
          nationality,
          preferred_language: !langTouched && lang ? lang : f.preferred_language,
          status_type: d.status_type ? (VISA_TYPES.includes(d.status_type) ? d.status_type : 'その他') : f.status_type,
          expiry_date: d.expiry_date ?? f.expiry_date,
          residence_card_number: d.residence_card_number ?? f.residence_card_number,
          issued_date: d.issued_date ?? f.issued_date,
        }
      })
      if (d.name_kana) setKanaFromAI(true)
      setExtractNote({ workRestriction: d.work_restriction })
    } catch {
      setError('在留カードの読み取り中に通信エラーが発生しました。')
    } finally {
      setExtracting(false)
      if (cardInputRef.current) cardInputRef.current.value = ''
    }
  }

  const validate = () => {
    const required: (keyof Form)[] = ['name_romaji', 'nationality', 'date_of_birth', 'residence_card_number', 'status_type', 'expiry_date']
    for (const k of required) {
      if (!form[k].trim()) return `${k} は必須です`
    }
    if (form.issued_date && new Date(form.expiry_date) <= new Date(form.issued_date)) return '在留期限は発行日より後の日付を入力してください'
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validErr = validate()
    if (validErr) { setError(validErr); return }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 任意項目の空文字はnullに変換して送る（date型カラムは''を受け付けない）
        body: JSON.stringify({
          ...form,
          name_kanji: form.name_kanji.trim() || null,
          passport_number: form.passport_number.trim() || null,
          issued_date: form.issued_date || null,
          name_kana: form.name_kana.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '登録に失敗しました')
      router.push(`/employees/${data.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '登録に失敗しました')
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui,sans-serif' }}>
      {/* Header */}
      <AppHeader currentPage="employees" />

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
        <button onClick={() => router.push('/employees')} style={{ background: 'none', border: 'none', color: '#0066cc', fontSize: 13, cursor: 'pointer', marginBottom: 20, padding: 0 }}>← 一覧に戻る</button>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#000' }}>新規外国人登録</h1>
          <p style={{ margin: 0, fontSize: 14, color: '#666' }}>基本情報と在留資格を入力してください</p>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#dc2626', fontSize: 13 }}>
            ⚠️ {error}
          </div>
        )}

        {/* 在留カードAIリーダー */}
        <div style={{ background: '#fff', border: '1px dashed #93c5fd', borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: '#000' }}>📷 在留カードをアップロードして自動入力</h2>
              <p style={{ margin: 0, fontSize: 12, color: '#666' }}>在留カード表面の画像（またはPDF）をAIが読み取り、下のフォームに自動反映します。反映後、内容を確認・修正してから登録してください。</p>
            </div>
            <button
              type="button"
              disabled={extracting}
              onClick={() => cardInputRef.current?.click()}
              style={{ background: extracting ? '#9ca3af' : '#0066cc', border: 'none', borderRadius: 6, padding: '10px 20px', fontSize: 14, color: '#fff', cursor: extracting ? 'not-allowed' : 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
            >
              {extracting ? 'AI読み取り中...' : '画像を選択'}
            </button>
            <input ref={cardInputRef} type="file" accept=".pdf,image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleCardFile(f) }} />
          </div>
          {extractNote && (
            <div style={{ marginTop: 12, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#1d4ed8' }}>
              ✅ 読み取り結果をフォームに反映しました。内容を確認・修正してください。
              {extractNote.workRestriction && (
                <span style={{ display: 'block', marginTop: 4, color: '#374151' }}>
                  就労制限の有無：{extractNote.workRestriction}（参考表示のみ・保存されません）
                </span>
              )}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          {/* 基本情報 */}
          <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 12, padding: 24, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 600, color: '#000' }}>基本情報</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
              <Field label="氏名（漢字）">
                <input style={inputStyle} value={form.name_kanji} onChange={set('name_kanji')} placeholder="漢字併記がある場合のみ（例: 阮 文 安）" />
              </Field>
              <Field label="氏名（ローマ字）" required>
                <input style={inputStyle} value={form.name_romaji} onChange={set('name_romaji')} placeholder="NGUYEN VAN AN" />
              </Field>
              <Field label="氏名（カタカナ）">
                <input style={inputStyle} value={form.name_kana} onChange={e => { setKanaFromAI(false); set('name_kana')(e) }} placeholder="グエン・ヴァン・アン" />
                {kanaFromAI && (
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#d97706' }}>⚠️ AI推定です。必ず確認してください</p>
                )}
              </Field>
              <Field label="国籍" required>
                <input style={inputStyle} list="nationality-options" value={form.nationality}
                  onChange={e => setNationality(e.target.value)} placeholder="入力して検索（例: ベトナム）" />
                <datalist id="nationality-options">
                  {COUNTRIES.map(n => <option key={n} value={n} />)}
                </datalist>
              </Field>
              <Field label="生年月日" required>
                <input style={inputStyle} type="date" value={form.date_of_birth} onChange={set('date_of_birth')} />
              </Field>
              <Field label="パスポート番号">
                <input style={inputStyle} value={form.passport_number} onChange={set('passport_number')} placeholder="B12345678" />
              </Field>
              <Field label="在留カード番号" required>
                <input style={inputStyle} value={form.residence_card_number} onChange={set('residence_card_number')} placeholder="RC-2024-001" />
              </Field>
              <Field label="性別">
                <select style={inputStyle} value={form.gender} onChange={set('gender')}>
                  <option value="">選択してください</option>
                  <option value="male">男性</option>
                  <option value="female">女性</option>
                </select>
              </Field>
              <Field label="使用言語" required>
                <select style={inputStyle} value={form.preferred_language} onChange={e => { setLangTouched(true); set('preferred_language')(e) }}>
                  {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </Field>
            </div>
          </div>

          {/* 在留資格情報 */}
          <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 600, color: '#000' }}>在留資格情報</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
              <Field label="在留資格" required>
                <select style={inputStyle} value={form.status_type} onChange={set('status_type')}>
                  {VISA_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </Field>
              <div /> {/* spacer */}
              <Field label="在留カード発行日（交付年月日）">
                <input style={inputStyle} type="date" value={form.issued_date} onChange={set('issued_date')} />
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>新様式のカードには記載がないため任意です</p>
              </Field>
              <Field label="在留期限" required>
                <input style={inputStyle} type="date" value={form.expiry_date} onChange={set('expiry_date')} />
              </Field>
            </div>

            {form.expiry_date && (() => {
              const days = Math.ceil((new Date(form.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
              const color = days < 0 ? '#dc2626' : days <= 30 ? '#d97706' : '#16a34a'
              const label = days < 0 ? `期限切れ（${Math.abs(days)}日超過）` : `残り ${days} 日`
              return <p style={{ margin: '-8px 0 0', fontSize: 12, color }}>{label}</p>
            })()}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => router.push('/employees')}
              style={{ background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, padding: '10px 24px', fontSize: 14, color: '#333', cursor: 'pointer', fontWeight: 500 }}
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{ background: submitting ? '#9ca3af' : '#0066cc', border: 'none', borderRadius: 6, padding: '10px 32px', fontSize: 14, color: '#fff', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 600 }}
            >
              {submitting ? '登録中...' : '登録する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
