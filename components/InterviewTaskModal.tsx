'use client'
/**
 * 四半期面談タスクの三段式モーダル（これは何? / どうやる? / 記録する）
 * variant は task.task_type から導出:
 *   worker     = 本人面談（参考様式第5-5号、評価は支援担当者）
 *   supervisor = 監督者面談（参考様式第5-6号、評価は現場責任者）
 * 保存で lib/supportTasks.ts の completeInterviewTask（4連書込）が走り、
 * 続けて該当様式の定期面談報告書を自動生成・ダウンロードする。
 * サブコンポーネントは必ずモジュールスコープで定義（フォーカス喪失バグ対策）。
 */
import { useState } from 'react'
import {
  completeInterviewTask, INTERVIEW_ITEMS, interviewVariantOf, interviewDocumentIdOf, itemLabelOf,
  type SupportTask, type InterviewForm, type EvaluatorRatings,
  type InterviewItemKey, type ItemCheck, type StaffRole, type SupervisorTarget,
} from '@/lib/supportTasks'

const ITEM_GROUPS = ['業務内容', '待遇', '保護', '生活', 'その他'] as const

const RATING_QUESTIONS: { key: keyof EvaluatorRatings; label: string }[] = [
  { key: 'performance', label: '業務遂行' },
  { key: 'attendance', label: '勤怠・時間' },
  { key: 'compliance', label: '安全衛生・規範遵守' },
]

const emptyItems = (): Record<InterviewItemKey, ItemCheck> =>
  Object.fromEntries(INTERVIEW_ITEMS.map(i => [i.key, { hasIssue: false, detail: '' }])) as Record<InterviewItemKey, ItemCheck>
const emptyRatings = (): EvaluatorRatings => ({ performance: 0, attendance: 0, compliance: 0 })

// ── モジュールスコープのUI部品 ──────────────────────────────

function StepBadge({ n, title }: { n: number; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</span>
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
  staff_role?: StaffRole
  staff_role_title?: string
  supervisor_target?: SupervisorTarget | null
  language?: string
  has_interpreter?: boolean
  interpreter_name?: string
} | null

export type OrgPrefill = {
  support_staff_name?: string | null
  support_staff_title?: string | null
} | null

export default function InterviewTaskModal({ task, workerName, prevNotes, orgPrefill, onClose, onSaved }: {
  task: SupportTask
  workerName: string
  prevNotes: PrevNotes
  orgPrefill: OrgPrefill
  onClose: () => void
  onSaved: () => void
}) {
  const variant = interviewVariantOf(task.task_type)
  const isSupervisor = variant === 'supervisor'
  const taskLabel = isSupervisor ? '監督者面談' : '四半期面談'

  const [form, setForm] = useState<InterviewForm>({
    interviewDate: '',
    method: 'in_person',
    onlineConsent: false,
    recordingUrl: '',
    // 原則1: 前回面談 → 組織設定（支援計画書の支援担当者）の順でプリフィル
    staffName: prevNotes?.staff_name ?? orgPrefill?.support_staff_name ?? '',
    staffRole: prevNotes?.staff_role ?? 'support_staff',
    staffRoleTitle: prevNotes?.staff_role_title ?? orgPrefill?.support_staff_title ?? '',
    supervisorTarget: isSupervisor
      ? {
          name: prevNotes?.supervisor_target?.name ?? '',
          title: prevNotes?.supervisor_target?.title ?? '',
          department: prevNotes?.supervisor_target?.department ?? '',
        }
      : null,
    otherParticipants: '',
    language: prevNotes?.language ?? '日本語',
    hasInterpreter: prevNotes?.has_interpreter ?? false,
    interpreterName: prevNotes?.interpreter_name ?? '',
    items: emptyItems(),
    violation: { has: false, date: '', detail: '' },
    freeNote: '',
    ratings: emptyRatings(),
  })
  const [allOkConfirmed, setAllOkConfirmed] = useState(false)
  const [itemsExpanded, setItemsExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof InterviewForm>(key: K, value: InterviewForm[K]) =>
    setForm(f => ({ ...f, [key]: value }))
  const setItem = (key: InterviewItemKey, patch: Partial<ItemCheck>) => {
    setForm(f => ({ ...f, items: { ...f.items, [key]: { ...f.items[key], ...patch } } }))
    if (patch.hasIssue) setAllOkConfirmed(false)
  }
  const setSupervisorTarget = (patch: Partial<SupervisorTarget>) =>
    setForm(f => ({ ...f, supervisorTarget: { ...(f.supervisorTarget ?? { name: '', title: '', department: '' }), ...patch } }))

  const issueCount = Object.values(form.items).filter(i => i.hasIssue).length
  // 確認項目の完了条件: 一括「すべて問題なし」を押した、または個別に問題ありを記録した
  const itemsConfirmed = allOkConfirmed || issueCount > 0

  const confirmAllOk = () => {
    setForm(f => ({ ...f, items: emptyItems() }))
    setAllOkConfirmed(true)
    setItemsExpanded(false)
  }

  const ratingsComplete = (r: EvaluatorRatings) => r.performance > 0 && r.attendance > 0 && r.compliance > 0
  // オンライン面談の本人同意要件は外国人本人との面談のみ（監督者面談には適用されない）
  const consentBlocked = !isSupervisor && form.method === 'online' && !form.onlineConsent
  const violationIncomplete = form.violation.has && (!form.violation.date || !form.violation.detail.trim())
  const supervisorTargetIncomplete = isSupervisor && !form.supervisorTarget?.name.trim()
  const canSave =
    !!form.interviewDate &&
    !!form.staffName.trim() &&
    !supervisorTargetIncomplete &&
    itemsConfirmed &&
    !violationIncomplete &&
    ratingsComplete(form.ratings) &&
    !consentBlocked &&
    !saving

  const downloadReport = async (supportRecordId: string) => {
    const res = await fetch('/api/documents/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: interviewDocumentIdOf(variant), workerId: task.worker_id, supportRecordId }),
    })
    if (!res.ok) throw new Error(`生成API ${res.status}`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `定期面談報告書${isSupervisor ? '_監督者用' : ''}_${workerName}_${form.interviewDate}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    const { error: err, supportRecordId } = await completeInterviewTask(task, form)
    if (err) { setSaving(false); setError(err); return }
    // 原則1: 保存と同時に法定文書（5-5/5-6号）を自動生成・ダウンロード。
    // 生成失敗でも記録自体は完了扱い（従業員詳細から再ダウンロード可能）
    try {
      if (supportRecordId) await downloadReport(supportRecordId)
    } catch (e) {
      console.warn('[InterviewTaskModal] 帳票の自動生成に失敗:', e)
      alert('面談記録は保存されましたが、帳票の自動生成に失敗しました。従業員詳細ページから再ダウンロードできます。')
    }
    setSaving(false)
    onSaved()
  }

  const sectionStyle: React.CSSProperties = {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 18px', marginBottom: 12,
  }

  return (
    <div data-testid="interview-modal" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '32px 16px' }}>
      <div style={{ background: '#f9fafb', borderRadius: 12, width: '100%', maxWidth: 620, padding: '22px 22px 18px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>
            {taskLabel} — {workerName}さん（{task.period_key}）
          </h2>
          <button onClick={onClose} data-testid="interview-close" style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
        </div>

        {/* ── 第1段: これは何? ── */}
        <div style={sectionStyle}>
          <StepBadge n={1} title="これは何？" />
          {isSupervisor ? (
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
              {workerName}さんの<strong>監督者（上司・現場責任者）</strong>と3ヶ月に1回以上行う法定の定期面談です。
              本人面談とは別に実施し、保存すると定期面談報告書（参考様式第5-6号）が自動生成されます。
              末尾の現場責任者評価は信頼スコア（面談時評価15点）に反映されます。
            </p>
          ) : (
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
              特定技能1号の方と<strong>3ヶ月に1回以上</strong>行う法定の定期面談です。
              保存すると定期面談報告書（参考様式第5-5号）が自動生成され、
              信頼スコア（支援実施10点・面談時評価15点）にも反映されます。
            </p>
          )}
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            対象: {isSupervisor ? `${workerName}さんの監督者` : `${workerName}さん`} ／ 対象四半期: {task.period_key} ／ 期限: {task.due_date}
          </div>
          <div style={{ fontSize: 12, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '6px 10px', marginTop: 8 }}>
            面談者（支援担当者）は中立的な立場が必要です。直属の上司・代表取締役は面談者になれません。
          </div>
        </div>

        {/* ── 第2段: どうやる? ── */}
        <div style={sectionStyle}>
          <StepBadge n={2} title="どうやる？" />
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#374151', lineHeight: 1.9, listStyle: 'decimal' }}>
            {isSupervisor ? (
              <>
                <li>対象の監督者（{workerName}さんの上司・現場責任者）と日程を調整する</li>
                <li>実施方法を決める（対面 または オンライン）</li>
                <li>面談で公式様式の確認項目（業務・待遇・保護・生活等を雇用側の視点で）を確認し、下の「記録する」に入力する</li>
                <li>末尾で現場責任者としての評価（3問・1分）を聞き取り入力する</li>
              </>
            ) : (
              <>
                <li>本人と日程を調整する（前回の面談から3ヶ月以内の実施が目安）</li>
                <li>実施方法を決める（対面 または オンライン。オンラインは本人同意が前提・初回は対面が原則）</li>
                <li>通訳の要否を確認する（十分に理解できる言語で行う）</li>
                <li>面談で公式様式の確認項目（業務・待遇・保護・生活等）を確認し、下の「記録する」に入力する</li>
              </>
            )}
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

          {/* 監督者面談: 面談対象者（監督者）の情報 */}
          {isSupervisor && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 8 }}>面談対象者（監督者）</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <FieldLabel required>監督者の氏名</FieldLabel>
                  <input type="text" data-testid="f-sup-name" value={form.supervisorTarget?.name ?? ''}
                    onChange={e => setSupervisorTarget({ name: e.target.value })} style={inputStyle} placeholder="例: 佐藤 一郎" />
                </div>
                <div>
                  <FieldLabel>監督者の役職</FieldLabel>
                  <input type="text" data-testid="f-sup-title" value={form.supervisorTarget?.title ?? ''}
                    onChange={e => setSupervisorTarget({ title: e.target.value })} style={inputStyle} placeholder="例: 製造課長" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <FieldLabel>監督者の所属部署</FieldLabel>
                  <input type="text" data-testid="f-sup-department" value={form.supervisorTarget?.department ?? ''}
                    onChange={e => setSupervisorTarget({ department: e.target.value })} style={inputStyle} placeholder="例: 製造部 第一製造課" />
                </div>
              </div>
            </div>
          )}

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

          {!isSupervisor && form.method === 'online' && (
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
              <FieldLabel required>面談対応者（氏名）</FieldLabel>
              <input type="text" data-testid="f-staff" value={form.staffName}
                onChange={e => set('staffName', e.target.value)} style={inputStyle} placeholder="例: 山田 花子" />
            </div>
            <div>
              <FieldLabel>対応者の役職</FieldLabel>
              <div style={{ display: 'flex', gap: 10, paddingTop: 6, flexWrap: 'wrap' }}>
                {([['support_staff', '支援担当者'], ['support_manager', '支援責任者']] as const).map(([v, label]) => (
                  <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                    <input type="radio" data-testid={`f-role-${v}`} checked={form.staffRole === v}
                      onChange={() => set('staffRole', v)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <FieldLabel>役職名（任意）</FieldLabel>
              <input type="text" data-testid="f-role-title" value={form.staffRoleTitle}
                onChange={e => set('staffRoleTitle', e.target.value)} style={inputStyle} placeholder="例: 総務課長" />
            </div>
            <div>
              <FieldLabel>その他の参加者</FieldLabel>
              <input type="text" value={form.otherParticipants}
                onChange={e => set('otherParticipants', e.target.value)} style={inputStyle} placeholder="任意" />
            </div>
            {!isSupervisor && (
              <>
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
              </>
            )}
          </div>

          {/* 確認項目（5-5/5-6号・18項目） */}
          <FieldLabel required>確認項目（参考様式第{isSupervisor ? '5-6' : '5-5'}号・18項目）</FieldLabel>
          <div style={{ border: itemsConfirmed ? '1px solid #bbf7d0' : '1px solid #e5e7eb', borderRadius: 8, padding: '12px 14px', marginBottom: 12, background: itemsConfirmed ? '#f0fdf4' : '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" data-testid="items-all-ok" onClick={confirmAllOk}
                style={{
                  background: allOkConfirmed ? '#16a34a' : '#fff',
                  border: '1px solid #16a34a', borderRadius: 8, padding: '9px 16px',
                  color: allOkConfirmed ? '#fff' : '#16a34a', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}>
                {allOkConfirmed ? '✓ すべて問題なし（確認済み）' : '✓ すべて問題なし'}
              </button>
              <button type="button" data-testid="items-expand" onClick={() => setItemsExpanded(v => !v)}
                style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {itemsExpanded ? '▲ 閉じる' : '▼ 個別に確認する'}
              </button>
              {issueCount > 0 && (
                <span data-testid="items-issue-count" style={{ fontSize: 12, fontWeight: 700, color: '#d97706' }}>
                  問題あり {issueCount} 件
                </span>
              )}
            </div>
            {!itemsConfirmed && (
              <div style={{ fontSize: 12, color: '#b45309', marginTop: 8 }}>
                「すべて問題なし」を押すか、問題のある項目を個別に記録してください
              </div>
            )}

            {itemsExpanded && (
              <div style={{ marginTop: 10 }}>
                {ITEM_GROUPS.map(group => (
                  <div key={group} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', padding: '6px 0 4px' }}>{group}</div>
                    {INTERVIEW_ITEMS.filter(i => i.group === group).map(item => {
                      const c = form.items[item.key]
                      return (
                        <div key={item.key} style={{ padding: '6px 8px', borderRadius: 6, background: c.hasIssue ? '#fef2f2' : 'transparent' }}>
                          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                            <input type="checkbox" data-testid={`f-item-${item.key}-issue`} checked={c.hasIssue}
                              onChange={e => setItem(item.key, { hasIssue: e.target.checked })}
                              style={{ marginTop: 3 }} />
                            <span>{itemLabelOf(item.key, variant)}<span style={{ color: c.hasIssue ? '#d97706' : '#9ca3af', fontWeight: 600, marginLeft: 6 }}>{c.hasIssue ? '問題あり' : '問題なし'}</span></span>
                          </label>
                          {c.hasIssue && (
                            <textarea data-testid={`f-item-${item.key}-detail`} value={c.detail}
                              onChange={e => setItem(item.key, { detail: e.target.value })}
                              style={{ ...inputStyle, minHeight: 44, resize: 'vertical', marginTop: 6 }}
                              placeholder="問題の内容（帳票の「問題の内容」欄に出力）" />
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 基準不適合等 */}
          <FieldLabel required>基準不適合等の有無</FieldLabel>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', marginBottom: 12, background: form.violation.has ? '#fef2f2' : '#fff' }}>
            <div style={{ display: 'flex', gap: 14 }}>
              {([[false, 'なし'], [true, '有り']] as const).map(([v, label]) => (
                <label key={String(v)} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: v ? '#d97706' : '#374151', cursor: 'pointer', fontWeight: 600 }}>
                  <input type="radio" data-testid={`f-violation-${v ? 'yes' : 'no'}`}
                    checked={form.violation.has === v}
                    onChange={() => set('violation', { ...form.violation, has: v })} />
                  {label}
                </label>
              ))}
            </div>
            {form.violation.has && (
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, marginTop: 10 }}>
                <div>
                  <FieldLabel required>発生年月日</FieldLabel>
                  <input type="date" data-testid="f-violation-date" value={form.violation.date}
                    onChange={e => set('violation', { ...form.violation, date: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <FieldLabel required>基準不適合等の内容</FieldLabel>
                  <textarea data-testid="f-violation-detail" value={form.violation.detail}
                    onChange={e => set('violation', { ...form.violation, detail: e.target.value })}
                    style={{ ...inputStyle, minHeight: 44, resize: 'vertical' }} />
                </div>
                <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#6b7280' }}>
                  対応結果（本人・所属機関・行政機関への対応）は帳票では空欄で出力されます。必要に応じて出力後に追記してください
                </div>
              </div>
            )}
          </div>

          <FieldLabel>その他特筆すべき事項</FieldLabel>
          <textarea data-testid="f-note" value={form.freeNote} onChange={e => set('freeNote', e.target.value)}
            style={{ ...inputStyle, minHeight: 56, resize: 'vertical', marginBottom: 12 }}
            placeholder="面談で話した内容・様子など（任意・帳票の⑦欄に出力）" />

          {/* 雇用主評価（分担方式: 本人面談=支援担当者 / 監督者面談=現場責任者） */}
          <FieldLabel required>雇用主評価（5段階・1分）</FieldLabel>
          <RatingBlock
            title={isSupervisor ? '現場責任者（監督者）による評価（必須）' : '支援担当者による評価（必須）'}
            ratings={form.ratings}
            onChange={r => set('ratings', r)}
            testPrefix={isSupervisor ? 'rate-supervisor' : 'rate-staff'} />
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
            {isSupervisor
              ? '現場責任者評価はこの監督者面談で入力します（本人面談では支援担当者評価を入力）'
              : '現場責任者評価は監督者面談のタスクで入力します（二重入力を防ぐ分担方式）'}
          </div>
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
            style={{ background: canSave ? '#2563eb' : '#e5e7eb', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 13, fontWeight: 700, color: canSave ? '#fff' : '#9ca3af', cursor: canSave ? 'pointer' : 'not-allowed' }}>
            {saving ? '保存中...' : '保存して面談を完了'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8, textAlign: 'right' }}>
          保存と同時に、面談記録・評価・タスク完了の登録と定期面談報告書（{isSupervisor ? '5-6' : '5-5'}号）のダウンロードが行われます
        </div>
      </div>
    </div>
  )
}
