'use client'
/**
 * 四半期面談タスクの三段式モーダル（これは何? / どうやる? / 記録する）
 * 保存で lib/supportTasks.ts の completeInterviewTask（4連書込）が走る。
 * サブコンポーネントは必ずモジュールスコープで定義（フォーカス喪失バグ対策）。
 */
import { useState } from 'react'
import {
  completeInterviewTask,
  type SupportTask, type InterviewForm, type EvaluatorRatings, type CategoryCheck,
} from '@/lib/supportTasks'

const CATEGORY_LABELS: { key: keyof InterviewForm['categories']; label: string }[] = [
  { key: 'work', label: '業務' },
  { key: 'life', label: '生活' },
  { key: 'health', label: '健康' },
  { key: 'complaint', label: '苦情' },
]

const RATING_QUESTIONS: { key: keyof EvaluatorRatings; label: string }[] = [
  { key: 'performance', label: '業務遂行' },
  { key: 'attendance', label: '勤怠・時間' },
  { key: 'compliance', label: '安全衛生・規範遵守' },
]

const emptyCheck = (): CategoryCheck => ({ hasIssue: false, detail: '', response: '' })
const emptyRatings = (): EvaluatorRatings => ({ performance: 0, attendance: 0, compliance: 0 })

// ── モジュールスコープのUI部品 ──────────────────────────────

function StepBadge({ n, title }: { n: number; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#0066cc', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>{title}</span>
    </div>
  )
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
      {children}{required && <span style={{ color: '#dc2626', marginLeft: 4 }}>*</span>}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 6,
  padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#111',
}

function StarRating({ value, onChange, testId }: { value: number; onChange: (v: number) => void; testId: string }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" data-testid={`${testId}-${n}`} onClick={() => onChange(n)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 2, color: n <= value ? '#f59e0b' : '#d1d5db' }}
          aria-label={`${n}点`}>
          ★
        </button>
      ))}
    </div>
  )
}

function RatingBlock({ title, ratings, onChange, testPrefix }: {
  title: string
  ratings: EvaluatorRatings
  onChange: (r: EvaluatorRatings) => void
  testPrefix: string
}) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 14px', marginTop: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 8 }}>{title}</div>
      {RATING_QUESTIONS.map(q => (
        <div key={q.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '4px 0', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: '#374151' }}>{q.label}</span>
          <StarRating value={ratings[q.key]} onChange={v => onChange({ ...ratings, [q.key]: v })} testId={`${testPrefix}-${q.key}`} />
        </div>
      ))}
    </div>
  )
}

// ── 本体 ────────────────────────────────────────────────────

type PrevNotes = {
  staff_name?: string
  language?: string
  has_interpreter?: boolean
  interpreter_name?: string
} | null

export default function InterviewTaskModal({ task, workerName, prevNotes, onClose, onSaved }: {
  task: SupportTask
  workerName: string
  prevNotes: PrevNotes
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<InterviewForm>({
    interviewDate: '',
    method: 'in_person',
    onlineConsent: false,
    recordingUrl: '',
    // 原則1: 前回面談の入力値をプリフィルし、新規増分のみ入力させる
    staffName: prevNotes?.staff_name ?? '',
    otherParticipants: '',
    language: prevNotes?.language ?? '日本語',
    hasInterpreter: prevNotes?.has_interpreter ?? false,
    interpreterName: prevNotes?.interpreter_name ?? '',
    categories: { work: emptyCheck(), life: emptyCheck(), health: emptyCheck(), complaint: emptyCheck() },
    freeNote: '',
    staffRatings: emptyRatings(),
    supervisorRatings: null,
  })
  const [withSupervisor, setWithSupervisor] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof InterviewForm>(key: K, value: InterviewForm[K]) =>
    setForm(f => ({ ...f, [key]: value }))
  const setCategory = (key: keyof InterviewForm['categories'], patch: Partial<CategoryCheck>) =>
    setForm(f => ({ ...f, categories: { ...f.categories, [key]: { ...f.categories[key], ...patch } } }))

  const ratingsComplete = (r: EvaluatorRatings) => r.performance > 0 && r.attendance > 0 && r.compliance > 0
  const consentBlocked = form.method === 'online' && !form.onlineConsent
  const canSave =
    !!form.interviewDate &&
    !!form.staffName.trim() &&
    ratingsComplete(form.staffRatings) &&
    (!withSupervisor || (form.supervisorRatings !== null && ratingsComplete(form.supervisorRatings))) &&
    !consentBlocked &&
    !saving

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    const { error: err } = await completeInterviewTask(task, {
      ...form,
      supervisorRatings: withSupervisor ? form.supervisorRatings : null,
    })
    setSaving(false)
    if (err) { setError(err); return }
    onSaved()
  }

  const sectionStyle: React.CSSProperties = {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 18px', marginBottom: 12,
  }

  return (
    <div data-testid="interview-modal" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '32px 16px' }}>
      <div style={{ background: '#f9fafb', borderRadius: 14, width: '100%', maxWidth: 620, padding: '22px 22px 18px', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#111' }}>
            四半期面談 — {workerName}さん（{task.period_key}）
          </h2>
          <button onClick={onClose} data-testid="interview-close" style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
        </div>

        {/* ── 第1段: これは何? ── */}
        <div style={sectionStyle}>
          <StepBadge n={1} title="これは何？" />
          <p style={{ margin: '0 0 8px', fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
            特定技能1号の方と<strong>3ヶ月に1回以上</strong>行う法定の定期面談です。
            記録は監査・定期届出の根拠になり、実施すると信頼スコア
            （支援実施10点・面談時評価15点）にも反映されます。
          </p>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            対象: {workerName}さん ／ 対象四半期: {task.period_key} ／ 期限: {task.due_date}
          </div>
          <div style={{ fontSize: 12, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '6px 10px', marginTop: 8 }}>
            面談者（支援担当者）は中立的な立場が必要です。直属の上司・代表取締役は面談者になれません。
          </div>
        </div>

        {/* ── 第2段: どうやる? ── */}
        <div style={sectionStyle}>
          <StepBadge n={2} title="どうやる？" />
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#374151', lineHeight: 1.9, listStyle: 'decimal' }}>
            <li>本人と日程を調整する（前回の面談から3ヶ月以内の実施が目安）</li>
            <li>実施方法を決める（対面 または オンライン。オンラインは本人同意が前提・初回は対面が原則）</li>
            <li>通訳の要否を確認する（十分に理解できる言語で行う）</li>
            <li>面談で 業務・生活・健康・苦情 の4分類を確認し、下の「記録する」に入力する</li>
          </ol>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 10, paddingTop: 10, borderTop: '1px solid #f3f4f6' }}>
            手続きに不安がある場合の相談先:{' '}
            <a href="https://www.gyosei.or.jp/" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>
              日本行政書士会連合会（会員検索）
            </a>
          </div>
        </div>

        {/* ── 第3段: 記録する ── */}
        <div style={sectionStyle}>
          <StepBadge n={3} title="記録する" />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <FieldLabel required>面談日</FieldLabel>
              <input type="date" data-testid="f-date" value={form.interviewDate}
                onChange={e => set('interviewDate', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <FieldLabel required>実施方法</FieldLabel>
              <div style={{ display: 'flex', gap: 12, paddingTop: 6 }}>
                {([['in_person', '対面'], ['online', 'オンライン']] as const).map(([v, label]) => (
                  <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                    <input type="radio" data-testid={`f-method-${v}`} checked={form.method === v}
                      onChange={() => set('method', v)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {form.method === 'online' && (
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', cursor: 'pointer', fontWeight: 600 }}>
                <input type="checkbox" data-testid="f-consent" checked={form.onlineConsent}
                  onChange={e => set('onlineConsent', e.target.checked)} />
                本人がオンライン面談に同意している
              </label>
              {consentBlocked && (
                <div data-testid="consent-block-msg" style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>
                  本人の同意がない場合、オンライン面談は実施できません（同意チェックが必要です）
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <FieldLabel>録画ファイルURL</FieldLabel>
                <input type="text" data-testid="f-recording" value={form.recordingUrl}
                  onChange={e => set('recordingUrl', e.target.value)} style={inputStyle}
                  placeholder="録画の保存先URL" />
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                  録画は契約終了後1年以上の保管が必要です
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <FieldLabel required>支援担当者（面談者）</FieldLabel>
              <input type="text" data-testid="f-staff" value={form.staffName}
                onChange={e => set('staffName', e.target.value)} style={inputStyle} placeholder="例: 山田 花子" />
            </div>
            <div>
              <FieldLabel>その他の参加者</FieldLabel>
              <input type="text" value={form.otherParticipants}
                onChange={e => set('otherParticipants', e.target.value)} style={inputStyle} placeholder="任意" />
            </div>
            <div>
              <FieldLabel>使用言語</FieldLabel>
              <input type="text" data-testid="f-language" value={form.language}
                onChange={e => set('language', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <FieldLabel>通訳</FieldLabel>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#374151', cursor: 'pointer', flexShrink: 0 }}>
                  <input type="checkbox" checked={form.hasInterpreter}
                    onChange={e => set('hasInterpreter', e.target.checked)} />
                  同席あり
                </label>
                {form.hasInterpreter && (
                  <input type="text" value={form.interpreterName}
                    onChange={e => set('interpreterName', e.target.value)}
                    style={{ ...inputStyle, padding: '6px 8px' }} placeholder="通訳者名" />
                )}
              </div>
            </div>
          </div>

          <FieldLabel required>確認項目（参考様式第5-5号準拠）</FieldLabel>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
            {CATEGORY_LABELS.map(({ key, label }, i) => {
              const c = form.categories[key]
              return (
                <div key={key} style={{ padding: '10px 12px', borderBottom: i < CATEGORY_LABELS.length - 1 ? '1px solid #f3f4f6' : 'none', background: c.hasIssue ? '#fef2f2' : '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{label}</span>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {([[false, '問題なし'], [true, '問題あり']] as const).map(([v, l]) => (
                        <label key={String(v)} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: v ? '#dc2626' : '#374151', cursor: 'pointer' }}>
                          <input type="radio" data-testid={`f-cat-${key}-${v ? 'issue' : 'ok'}`}
                            checked={c.hasIssue === v} onChange={() => setCategory(key, { hasIssue: v })} />
                          {l}
                        </label>
                      ))}
                    </div>
                  </div>
                  {c.hasIssue && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                      <textarea value={c.detail} onChange={e => setCategory(key, { detail: e.target.value })}
                        style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} placeholder="詳細（発生日・内容）" />
                      <textarea value={c.response} onChange={e => setCategory(key, { response: e.target.value })}
                        style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} placeholder="対応" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <FieldLabel>自由記述</FieldLabel>
          <textarea data-testid="f-note" value={form.freeNote} onChange={e => set('freeNote', e.target.value)}
            style={{ ...inputStyle, minHeight: 56, resize: 'vertical', marginBottom: 12 }}
            placeholder="面談で話した内容・本人の様子など（任意）" />

          <FieldLabel required>雇用主評価（5段階・1名1分）</FieldLabel>
          <RatingBlock title="支援担当者による評価（必須）" ratings={form.staffRatings}
            onChange={r => set('staffRatings', r)} testPrefix="rate-staff" />

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', cursor: 'pointer', marginTop: 10 }}>
            <input type="checkbox" data-testid="f-with-supervisor" checked={withSupervisor}
              onChange={e => {
                setWithSupervisor(e.target.checked)
                if (e.target.checked && !form.supervisorRatings) set('supervisorRatings', emptyRatings())
              }} />
            現場責任者の評価も今入力する（後からの追記も可能）
          </label>
          {withSupervisor && form.supervisorRatings && (
            <RatingBlock title="現場責任者による評価" ratings={form.supervisorRatings}
              onChange={r => set('supervisorRatings', r)} testPrefix="rate-supervisor" />
          )}
        </div>

        {error && (
          <div style={{ fontSize: 13, color: '#dc2626', background: '#fee2e2', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}>
            キャンセル
          </button>
          <button data-testid="interview-save" onClick={handleSave} disabled={!canSave}
            style={{ background: canSave ? '#0066cc' : '#e5e7eb', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 13, fontWeight: 700, color: canSave ? '#fff' : '#9ca3af', cursor: canSave ? 'pointer' : 'not-allowed' }}>
            {saving ? '保存中...' : '保存して面談を完了'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8, textAlign: 'right' }}>
          保存と同時に、面談記録・評価・タスク完了・書類生成記録が一括登録されます
        </div>
      </div>
    </div>
  )
}
