'use client'
import { useRouter, useParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getDocumentsForStatus, type DocumentDef } from '@/lib/documents/statusDocumentMap'
import AppHeader from '@/components/AppHeader'
import TrustScoreCard from '@/components/TrustScoreCard'
import InterviewTaskModal, { type OrgPrefill } from '@/components/InterviewTaskModal'
import { calculateTrustScore, getOrCreateMonthlySnapshot, BRANCH_META, type TrustScoreResult, type SnapshotRow } from '@/lib/trustScore'
import { getFlag } from '@/lib/countries'
import { INTERVIEW_TASK_TYPES, interviewVariantOf, interviewDocumentIdOf, type SupportTask } from '@/lib/supportTasks'
import { computeServiceMatrix, completionRate, STATUS_STYLE, STATUS_LABEL, type ServiceStatus, type SupportServiceDef } from '@/lib/supportServices'

type Worker = {
  id: string
  org_id: string
  name_kanji: string
  name_romaji: string
  nationality: string
  date_of_birth: string
  passport_number: string
  residence_card_number: string
  preferred_language: string
  gender: string | null
  status: string
  residence_statuses: {
    id: string
    status_type: string
    expiry_date: string
    issued_date: string
    card_number: string
    is_active: boolean
    source: string | null
    created_at: string
  }[]
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

function ScoreRing({ score, max }: { score: number; max: number }) {
  const pct = score / max
  const color = pct >= 0.8 ? '#16a34a' : pct >= 0.5 ? '#d97706' : '#dc2626'
  const r = 26
  const circ = 2 * Math.PI * r
  const dash = circ * pct
  return (
    <div style={{ position: 'relative', width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={72} height={72} style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
        <circle cx={36} cy={36} r={r} fill="none" stroke="#f0f0f0" strokeWidth={6} />
        <circle cx={36} cy={36} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 9, color: '#999', lineHeight: 1 }}>/100</div>
      </div>
    </div>
  )
}

export default function EmployeeDetail() {
  const router = useRouter()
  const params = useParams()
  const [worker, setWorker] = useState<Worker | null>(null)
  const [trust, setTrust] = useState<TrustScoreResult | null>(null)
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([])
  const [loading, setLoading] = useState(true)
  const [docGenerating, setDocGenerating] = useState<string | null>(null)
  const [editStatusModal, setEditStatusModal] = useState<{
    open: boolean
    status_type: string
    expiry_date: string
    issued_date: string
    card_number: string
    saving: boolean
  }>({ open: false, status_type: '', expiry_date: '', issued_date: '', card_number: '', saving: false })

  const [editWorkerModal, setEditWorkerModal] = useState<{
    open: boolean
    name_kanji: string
    name_romaji: string
    date_of_birth: string
    nationality: string
    passport_number: string
    gender: string
    saving: boolean
  }>({ open: false, name_kanji: '', name_romaji: '', date_of_birth: '', nationality: '', passport_number: '', gender: '', saving: false })

  const [keiyakuModal, setKeiyakuModal] = useState<{
    open: boolean
    hasTermination: boolean
    terminationDate: string
    terminationType: 'expiry' | 'resignation' | 'dismissal' | 'other'
    terminationReason: string
    hasNewContract: boolean
    newContractDate: string
  }>({
    open: false,
    hasTermination: true,
    terminationDate: '',
    terminationType: 'expiry',
    terminationReason: '',
    hasNewContract: false,
    newContractDate: '',
  })
  const [contract, setContract] = useState<{ termination_date: string | null } | null>(null)

  const [retireModal, setRetireModal] = useState<{ open: boolean; retireDate: string; saving: boolean }>({
    open: false, retireDate: '', saving: false,
  })
  const [retireDone, setRetireDone] = useState(false)

  const [cardUpdate, setCardUpdate] = useState<{ open: boolean; extracting: boolean; extracted: CardExtracted | null; saving: boolean }>({
    open: false, extracting: false, extracted: null, saving: false,
  })
  const cardFileRef = useRef<HTMLInputElement>(null)

  // 四半期面談タスク（本人+監督者・未完了分）とモーダル
  const [interviewTasks, setInterviewTasks] = useState<SupportTask[]>([])
  const [openTask, setOpenTask] = useState<SupportTask | null>(null)
  // プリフィル用の前回記録（variant ごとに保持）
  const [prevNotesByType, setPrevNotesByType] = useState<{
    worker: Record<string, unknown> | null
    supervisor: Record<string, unknown> | null
  }>({ worker: null, supervisor: null })
  const [interviewRecords, setInterviewRecords] = useState<{ id: string; type: string; quarter: string | null; completed_date: string | null }[]>([])
  const [serviceMatrix, setServiceMatrix] = useState<{ def: SupportServiceDef; status: ServiceStatus }[]>([])
  const [orgPrefill, setOrgPrefill] = useState<OrgPrefill>(null)
  const [trustRefresh, setTrustRefresh] = useState(0)
  const supabase = createClient()

  useEffect(() => {
    const fetchWorker = async () => {
      const { data, error } = await supabase
        .from('foreign_workers')
        .select(`*, residence_statuses(*)`)
        .eq('id', params.id)
        .single()
      if (!error && data) setWorker(data)
      setLoading(false)
    }
    fetchWorker()
  }, [params.id])

  useEffect(() => {
    if (!params.id) return
    const fetchContract = async () => {
      const { data } = await supabase
        .from('worker_contracts')
        .select('termination_date')
        .eq('worker_id', params.id)
        .maybeSingle()
      if (data) setContract(data)
    }
    fetchContract()
  }, [params.id])

  // 信頼スコア算出 + 当月スナップショットのレイジー作成（面談保存後は trustRefresh で再算出）
  useEffect(() => {
    if (!worker) return
    const fetchTrustScore = async () => {
      try {
        const result = await calculateTrustScore(worker.id)
        setTrust(result)
        setSnapshots(await getOrCreateMonthlySnapshot(worker.id, worker.org_id, result))
      } catch (e) {
        console.warn('[trustScore] 算出に失敗:', e)
      }
    }
    fetchTrustScore()
  }, [worker, trustRefresh])

  // 四半期面談タスク（本人+監督者・未完了分）+ 実施済み面談記録（プリフィル・再ダウンロード用）
  const fetchInterviewTasks = async (autoOpenTaskId?: string | null) => {
    if (!params.id) return
    const [tasksRes, recsRes, allRecsRes] = await Promise.all([
      supabase.from('support_tasks')
        .select('*')
        .eq('worker_id', params.id)
        .in('task_type', [...INTERVIEW_TASK_TYPES])
        .eq('status', 'pending')
        .order('due_date'),
      supabase.from('support_records')
        .select('id, type, quarter, completed_date, notes')
        .eq('worker_id', params.id)
        .in('type', ['interview_worker', 'interview_supervisor'])
        .eq('completed', true)
        .order('completed_date', { ascending: false }),
      // 10支援業務マトリクス用: 全 type の実施記録（証拠層の集約表示）
      supabase.from('support_records')
        .select('type, completed, quarter')
        .eq('worker_id', params.id),
    ])
    const tasks = (tasksRes.data ?? []) as SupportTask[]
    const recs = recsRes.data ?? []
    setInterviewTasks(tasks)
    setInterviewRecords(recs.map(r => ({ id: r.id, type: r.type, quarter: r.quarter, completed_date: r.completed_date })))
    setPrevNotesByType({
      worker: (recs.find(r => r.type === 'interview_worker')?.notes as Record<string, unknown> | undefined) ?? null,
      supervisor: (recs.find(r => r.type === 'interview_supervisor')?.notes as Record<string, unknown> | undefined) ?? null,
    })
    setServiceMatrix(computeServiceMatrix(allRecsRes.data ?? [], tasks))
    if (autoOpenTaskId) {
      const t = tasks.find(t => t.id === autoOpenTaskId)
      if (t) setOpenTask(t)
    }
  }

  // 面談対応者のプリフィル用（原則1: 支援計画書の支援担当者情報を再利用）
  useEffect(() => {
    if (!worker?.org_id) return
    supabase.from('organizations')
      .select('support_staff_name, support_staff_title')
      .eq('id', worker.org_id)
      .maybeSingle()
      .then(({ data }) => setOrgPrefill(data ?? null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worker?.org_id])

  // 定期面談報告書（5-5号/5-6号）の再ダウンロード
  const downloadInterviewReport = async (rec: { id: string; type: string; completed_date: string | null }) => {
    if (!worker) return
    const isSupervisor = rec.type === 'interview_supervisor'
    setDocGenerating(`mendan-${rec.id}`)
    try {
      const res = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: isSupervisor ? 'mendan_kiroku_supervisor' : 'mendan_kiroku',
          workerId: worker.id,
          supportRecordId: rec.id,
        }),
      })
      if (!res.ok) {
        alert('帳票の生成に失敗しました。')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `定期面談報告書${isSupervisor ? '_監督者用' : ''}_${worker.name_kanji || worker.name_romaji}_${rec.completed_date ?? ''}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('[downloadInterviewReport] error:', e)
      alert('通信エラーが発生しました。')
    } finally {
      setDocGenerating(null)
    }
  }

  useEffect(() => {
    // ダッシュボードの「面談を記録」からの遷移（?task=<id>）はモーダルを自動で開く
    const taskParam = new URLSearchParams(window.location.search).get('task')
    fetchInterviewTasks(taskParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  // TODO: 在留資格更新許可申請書の自動生成（正式様式対応）が実装されたら復元する
  // const generateRenewalDoc = async () => {
  //   if (!worker) return
  //   setGenerating(true)
  //   setGeneratedDoc(null)
  //   const activeStatus = worker.residence_statuses?.find(s => s.is_active)
  //   const prompt = `以下の外国人労働者の情報をもとに、在留資格更新許可申請書の下書きを日本語で作成してください。
  // 【申請者情報】
  // 氏名（漢字）: ${worker.name_kanji}
  // ...
  // 申請書の形式で、申請理由・就労状況・今後の活動予定を含む文書を作成してください。`
  //   try {
  //     const res = await fetch('/api/generate', {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({ prompt })
  //     })
  //     const data = await res.json()
  //     setGeneratedDoc(data.text || 'エラーが発生しました')
  //   } catch (e) {
  //     console.error('[generate] error:', e)
  //     setGeneratedDoc('通信エラーが発生しました。もう一度お試しください。')
  //   } finally {
  //     setGenerating(false)
  //   }
  // }

  const generateKeiyakuDoc = async () => {
    if (!worker) return
    const km = keiyakuModal
    if (!km.hasTermination && !km.hasNewContract) {
      alert('契約終了または新規締結のいずれかを選択してください。')
      return
    }
    if (km.hasTermination && !km.terminationDate) {
      alert('契約終了日を入力してください。')
      return
    }
    if (km.hasNewContract && !km.newContractDate) {
      alert('新契約締結日を入力してください。')
      return
    }
    setDocGenerating('todoke_keiyaku_shuryo')
    try {
      const res = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: 'todoke_keiyaku_shuryo',
          workerId: worker.id,
          termination: km.hasTermination ? {
            date: km.terminationDate,
            type: km.terminationType,
            reason: km.terminationReason || null,
          } : null,
          newContract: km.hasNewContract ? { date: km.newContractDate } : null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(`生成エラー: ${err.error || '不明なエラー'}`)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `随時届出_契約終了_${worker.name_romaji}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      setKeiyakuModal(prev => ({ ...prev, open: false }))
    } catch (e) {
      console.error('[generateKeiyakuDoc] error:', e)
      alert('通信エラーが発生しました。')
    } finally {
      setDocGenerating(null)
    }
  }

  const generateWordDoc = async (doc: DocumentDef) => {
    if (!worker) return
    if (doc.id === 'todoke_keiyaku_shuryo') {
      setKeiyakuModal(prev => ({ ...prev, open: true }))
      return
    }
    setDocGenerating(doc.id)
    try {
      const res = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id, workerId: worker.id }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(`生成エラー: ${err.error || '不明なエラー'}`)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const ext = doc.outputFormat === 'excel' ? 'xlsx' : 'docx'
      a.download = `${doc.shortLabel}_${worker.name_romaji}.${ext}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('[generateWordDoc] error:', e)
      alert('通信エラーが発生しました。')
    } finally {
      setDocGenerating(null)
    }
  }

  const NATIONALITIES = ['ベトナム', 'フィリピン', '中国', 'バングラデシュ', '韓国', 'インドネシア', 'ミャンマー', 'タイ', 'インド', 'その他']

  const handleOpenEditWorker = () => {
    if (!worker) return
    setEditWorkerModal({
      open: true,
      name_kanji: worker.name_kanji ?? '',
      name_romaji: worker.name_romaji ?? '',
      date_of_birth: worker.date_of_birth ?? '',
      nationality: worker.nationality ?? '',
      passport_number: worker.passport_number ?? '',
      gender: worker.gender ?? '',
      saving: false,
    })
  }

  const handleSaveWorker = async () => {
    if (!worker) return
    setEditWorkerModal(prev => ({ ...prev, saving: true }))
    try {
      const { error } = await supabase.from('foreign_workers').update({
        name_kanji: editWorkerModal.name_kanji || null,
        name_romaji: editWorkerModal.name_romaji || null,
        date_of_birth: editWorkerModal.date_of_birth || null,
        nationality: editWorkerModal.nationality || null,
        passport_number: editWorkerModal.passport_number || null,
        gender: editWorkerModal.gender || null,
      }).eq('id', worker.id)
      if (error) throw error
      const { data } = await supabase.from('foreign_workers').select('*, residence_statuses(*)').eq('id', params.id).single()
      if (data) setWorker(data)
      setEditWorkerModal(prev => ({ ...prev, open: false, saving: false }))
    } catch (err) {
      console.error('[handleSaveWorker]', err)
      setEditWorkerModal(prev => ({ ...prev, saving: false }))
    }
  }

  const VISA_TYPES = [
    '特定技能1号', '特定技能2号',
    '技術・人文知識・国際業務', '高度専門職1号', '高度専門職2号',
    '技能実習1号イ', '技能実習2号イ', '技能実習3号イ',
    '特定活動', 'その他',
  ]

  const handleOpenEditStatus = () => {
    const s = worker?.residence_statuses?.find(rs => rs.is_active)
    setEditStatusModal({
      open: true,
      status_type: s?.status_type ?? '特定技能1号',
      expiry_date: s?.expiry_date ?? '',
      issued_date: s?.issued_date ?? '',
      card_number: s?.card_number ?? '',
      saving: false,
    })
  }

  const handleSaveStatus = async () => {
    if (!worker) return
    const s = worker.residence_statuses?.find(rs => rs.is_active)
    setEditStatusModal(prev => ({ ...prev, saving: true }))
    try {
      if (s?.id) {
        const { error: updateError } = await supabase.from('residence_statuses').update({
          status_type: editStatusModal.status_type,
          expiry_date: editStatusModal.expiry_date || null,
          issued_date: editStatusModal.issued_date || null,
          card_number: editStatusModal.card_number || null,
        }).eq('id', s.id)
        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase.from('residence_statuses').insert({
          worker_id: worker.id,
          status_type: editStatusModal.status_type,
          expiry_date: editStatusModal.expiry_date || null,
          issued_date: editStatusModal.issued_date || null,
          card_number: editStatusModal.card_number || null,
          is_active: true,
        })
        if (insertError) throw insertError
      }
      const { data } = await supabase.from('foreign_workers').select('*, residence_statuses(*)').eq('id', params.id).single()
      if (data) setWorker(data)
      setEditStatusModal(prev => ({ ...prev, open: false, saving: false }))
    } catch (err) {
      console.error('[handleSaveStatus]', err)
      setEditStatusModal(prev => ({ ...prev, saving: false }))
    }
  }

  const handleRetire = async () => {
    if (!worker) return
    if (!retireModal.retireDate) {
      alert('退職日を入力してください。')
      return
    }
    setRetireModal(prev => ({ ...prev, saving: true }))
    try {
      // RLS無音失敗対策：更新行数を検証する
      const { data: updated, error: updateErr } = await supabase
        .from('foreign_workers')
        .update({ status: 'retired' })
        .eq('id', worker.id)
        .select('id')
      if (updateErr) throw updateErr
      if (!updated || updated.length !== 1) {
        throw new Error(`在職ステータスの更新に失敗しました（更新行数: ${updated?.length ?? 0}）`)
      }

      const { error: contractErr } = await supabase
        .from('worker_contracts')
        .upsert({ worker_id: worker.id, termination_date: retireModal.retireDate }, { onConflict: 'worker_id' })
      if (contractErr) throw contractErr

      setContract({ termination_date: retireModal.retireDate })
      setWorker(prev => prev ? { ...prev, status: 'retired' } : prev)
      setRetireModal({ open: false, retireDate: '', saving: false })
      setRetireDone(true)
    } catch (err) {
      console.error('[handleRetire]', err)
      alert(err instanceof Error ? err.message : '退職処理に失敗しました。')
      setRetireModal(prev => ({ ...prev, saving: false }))
    }
  }

  const handleCardUpdateFile = async (file: File) => {
    setCardUpdate({ open: false, extracting: true, extracted: null, saving: false })
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/residence-card/extract', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) {
        alert(`在留カードの読み取りエラー: ${json.error || '不明なエラー'}`)
        setCardUpdate(prev => ({ ...prev, extracting: false }))
        return
      }
      setCardUpdate({ open: true, extracting: false, extracted: json.extracted as CardExtracted, saving: false })
    } catch (e) {
      console.error('[handleCardUpdateFile]', e)
      alert('通信エラーが発生しました。')
      setCardUpdate(prev => ({ ...prev, extracting: false }))
    }
  }

  const handleConfirmCardUpdate = async () => {
    if (!worker || !cardUpdate.extracted) return
    const d = cardUpdate.extracted
    const current = worker.residence_statuses?.find(s => s.is_active)
    // 読み取れなかった項目は現在の値を引き継ぐ
    const newRow = {
      worker_id: worker.id,
      status_type: d.status_type ?? current?.status_type ?? null,
      expiry_date: d.expiry_date ?? current?.expiry_date ?? null,
      issued_date: d.issued_date ?? current?.issued_date ?? null,
      card_number: d.residence_card_number ?? current?.card_number ?? null,
      is_active: true,
      source: 'card_update',
    }
    if (!newRow.status_type || !newRow.expiry_date) {
      alert('在留資格または在留期限が読み取れませんでした。カード画像を確認してください。')
      return
    }
    setCardUpdate(prev => ({ ...prev, saving: true }))
    try {
      const { data: inserted, error: insertErr } = await supabase
        .from('residence_statuses')
        .insert(newRow)
        .select('id')
        .single()
      if (insertErr || !inserted) throw insertErr ?? new Error('新しい在留資格行の登録に失敗しました')

      // 旧アクティブ行を無効化（RLS無音失敗対策：更新行数を検証、失敗時は新行を削除して巻き戻す）
      const oldIds = (worker.residence_statuses ?? []).filter(s => s.is_active).map(s => s.id)
      if (oldIds.length > 0) {
        const { data: deactivated, error: deactivateErr } = await supabase
          .from('residence_statuses')
          .update({ is_active: false })
          .in('id', oldIds)
          .select('id')
        if (deactivateErr || !deactivated || deactivated.length !== oldIds.length) {
          await supabase.from('residence_statuses').delete().eq('id', inserted.id)
          throw deactivateErr ?? new Error(
            `既存の在留資格行の無効化に失敗しました（期待 ${oldIds.length} 行 / 実際 ${deactivated?.length ?? 0} 行）。変更を取り消しました。`
          )
        }
      }

      const { data } = await supabase.from('foreign_workers').select('*, residence_statuses(*)').eq('id', params.id).single()
      if (data) setWorker(data)
      setCardUpdate({ open: false, extracting: false, extracted: null, saving: false })
    } catch (err) {
      console.error('[handleConfirmCardUpdate]', err)
      alert(err instanceof Error ? err.message : '在留カード情報の更新に失敗しました。')
      setCardUpdate(prev => ({ ...prev, saving: false }))
    }
  }

  const getDaysUntil = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - new Date().getTime()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }

  if (loading) return <div style={{padding:40,textAlign:"center",color:"#666"}}>読み込み中...</div>
  if (!worker) return <div style={{padding:40,textAlign:"center",color:"#666"}}>データが見つかりません</div>

  const activeStatus = worker.residence_statuses?.find(s => s.is_active)
  // 3-1-2号（特定技能雇用契約の終了）は特定技能専属の随時届出。他の在留資格には案内しない
  const isTokuteiGinou = activeStatus?.status_type === '特定技能1号' || activeStatus?.status_type === '特定技能2号'
  const retired = worker.status === 'retired'
  const days = activeStatus ? getDaysUntil(activeStatus.expiry_date) : 999
  const urgent = !retired && days <= 30
  const statusHistory = [...(worker.residence_statuses ?? [])]
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  const trustVerified = trust !== null && trust.branch === 'verified'

  const applicableDocs = getDocumentsForStatus(activeStatus?.status_type ?? '')
  const availableDocs = applicableDocs.filter(d => d.available)
  const comingSoonDocs = applicableDocs.filter(d => !d.available)

  const km = keiyakuModal
  const setKm = (patch: Partial<typeof keiyakuModal>) => setKeiyakuModal(prev => ({ ...prev, ...patch }))

  return (
    <div style={{minHeight:"100vh",background:"#f9fafb",fontFamily:"system-ui,sans-serif"}}>

      {/* 基本情報編集モーダル */}
      {editWorkerModal.open && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#fff',borderRadius:12,padding:'28px 32px',width:440,maxWidth:'90vw',boxShadow:'0 8px 32px rgba(0,0,0,0.18)'}}>
            <h3 style={{margin:'0 0 20px',fontSize:16,fontWeight:700,color:'#111'}}>基本情報を編集</h3>

            {([
              {key:'name_kanji',  label:'氏名（漢字）',     type:'text',   placeholder:'山田 太郎'},
              {key:'name_romaji', label:'氏名（ローマ字）', type:'text',   placeholder:'YAMADA TARO'},
              {key:'date_of_birth',label:'生年月日',        type:'date',   placeholder:''},
              {key:'passport_number',label:'パスポート番号',type:'text',   placeholder:'TK1234567'},
            ] as {key: keyof typeof editWorkerModal; label: string; type: string; placeholder: string}[]).map(f => (
              <div key={f.key} style={{marginBottom:16}}>
                <label style={{display:'block',fontSize:13,fontWeight:600,color:'#333',marginBottom:6}}>{f.label}</label>
                <input type={f.type} value={editWorkerModal[f.key] as string} placeholder={f.placeholder}
                  onChange={e => setEditWorkerModal(prev => ({ ...prev, [f.key]: e.target.value }))}
                  style={{width:'100%',boxSizing:'border-box',border:'1px solid #d1d5db',borderRadius:6,padding:'9px 12px',fontSize:14,color:'#111',background:'#fff'}} />
              </div>
            ))}

            <div style={{marginBottom:16}}>
              <label style={{display:'block',fontSize:13,fontWeight:600,color:'#333',marginBottom:6}}>国籍</label>
              <select value={editWorkerModal.nationality}
                onChange={e => setEditWorkerModal(prev => ({ ...prev, nationality: e.target.value }))}
                style={{width:'100%',boxSizing:'border-box',border:'1px solid #d1d5db',borderRadius:6,padding:'9px 12px',fontSize:14,color:'#111',background:'#fff'}}>
                <option value="">選択してください</option>
                {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <div style={{marginBottom:24}}>
              <label style={{display:'block',fontSize:13,fontWeight:600,color:'#333',marginBottom:6}}>性別</label>
              <select value={editWorkerModal.gender}
                onChange={e => setEditWorkerModal(prev => ({ ...prev, gender: e.target.value }))}
                style={{width:'100%',boxSizing:'border-box',border:'1px solid #d1d5db',borderRadius:6,padding:'9px 12px',fontSize:14,color:'#111',background:'#fff'}}>
                <option value="">未設定</option>
                <option value="male">男性</option>
                <option value="female">女性</option>
              </select>
            </div>

            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={() => setEditWorkerModal(prev => ({ ...prev, open: false }))}
                style={{padding:'8px 20px',borderRadius:6,border:'1px solid #ccc',background:'#fff',fontSize:14,cursor:'pointer'}}>
                キャンセル
              </button>
              <button onClick={handleSaveWorker} disabled={editWorkerModal.saving}
                style={{padding:'8px 20px',borderRadius:6,border:'none',
                  background: editWorkerModal.saving ? '#e5e7eb' : '#0066cc',
                  color: editWorkerModal.saving ? '#9ca3af' : '#fff',
                  fontSize:14,fontWeight:600,cursor: editWorkerModal.saving ? 'not-allowed' : 'pointer'}}>
                {editWorkerModal.saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 在留情報編集モーダル */}
      {editStatusModal.open && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#fff',borderRadius:12,padding:'28px 32px',width:440,maxWidth:'90vw',boxShadow:'0 8px 32px rgba(0,0,0,0.18)'}}>
            <h3 style={{margin:'0 0 20px',fontSize:16,fontWeight:700,color:'#111'}}>在留情報を編集</h3>

            <div style={{marginBottom:16}}>
              <label style={{display:'block',fontSize:13,fontWeight:600,color:'#333',marginBottom:6}}>在留資格 <span style={{color:'#dc2626'}}>*</span></label>
              <select value={editStatusModal.status_type}
                onChange={e => setEditStatusModal(prev => ({ ...prev, status_type: e.target.value }))}
                style={{width:'100%',boxSizing:'border-box',border:'1px solid #d1d5db',borderRadius:6,padding:'9px 12px',fontSize:14,color:'#111',background:'#fff'}}>
                {VISA_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            <div style={{marginBottom:16}}>
              <label style={{display:'block',fontSize:13,fontWeight:600,color:'#333',marginBottom:6}}>在留期限</label>
              <input type="date" value={editStatusModal.expiry_date}
                onChange={e => setEditStatusModal(prev => ({ ...prev, expiry_date: e.target.value }))}
                style={{width:'100%',boxSizing:'border-box',border:'1px solid #d1d5db',borderRadius:6,padding:'9px 12px',fontSize:14,color:'#111',background:'#fff'}} />
            </div>

            <div style={{marginBottom:16}}>
              <label style={{display:'block',fontSize:13,fontWeight:600,color:'#333',marginBottom:6}}>交付日</label>
              <input type="date" value={editStatusModal.issued_date}
                onChange={e => setEditStatusModal(prev => ({ ...prev, issued_date: e.target.value }))}
                style={{width:'100%',boxSizing:'border-box',border:'1px solid #d1d5db',borderRadius:6,padding:'9px 12px',fontSize:14,color:'#111',background:'#fff'}} />
            </div>

            <div style={{marginBottom:24}}>
              <label style={{display:'block',fontSize:13,fontWeight:600,color:'#333',marginBottom:6}}>在留カード番号</label>
              <input type="text" value={editStatusModal.card_number}
                onChange={e => setEditStatusModal(prev => ({ ...prev, card_number: e.target.value }))}
                placeholder="例: AB12345678CD"
                style={{width:'100%',boxSizing:'border-box',border:'1px solid #d1d5db',borderRadius:6,padding:'9px 12px',fontSize:14,color:'#111',background:'#fff'}} />
            </div>

            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={() => setEditStatusModal(prev => ({ ...prev, open: false }))}
                style={{padding:'8px 20px',borderRadius:6,border:'1px solid #ccc',background:'#fff',fontSize:14,cursor:'pointer'}}>
                キャンセル
              </button>
              <button onClick={handleSaveStatus} disabled={editStatusModal.saving}
                style={{padding:'8px 20px',borderRadius:6,border:'none',
                  background: editStatusModal.saving ? '#e5e7eb' : '#0066cc',
                  color: editStatusModal.saving ? '#9ca3af' : '#fff',
                  fontSize:14,fontWeight:600,cursor: editStatusModal.saving ? 'not-allowed' : 'pointer'}}>
                {editStatusModal.saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 退職処理モーダル */}
      {retireModal.open && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#fff',borderRadius:12,padding:'28px 32px',width:440,maxWidth:'90vw',boxShadow:'0 8px 32px rgba(0,0,0,0.18)'}}>
            <h3 style={{margin:'0 0 12px',fontSize:16,fontWeight:700,color:'#111'}}>退職処理</h3>
            <p style={{margin:'0 0 16px',fontSize:13,color:'#555',lineHeight:1.7}}>
              {worker.name_kanji || worker.name_romaji} さんの在職ステータスを「退職」に変更します。<br />
              データは削除されず、詳細ページ・過去の文書・履歴は引き続き参照できます。
            </p>
            <div style={{marginBottom:16}}>
              <label style={{display:'block',fontSize:13,fontWeight:600,color:'#333',marginBottom:6}}>退職日 <span style={{color:'#dc2626'}}>*</span></label>
              <input type="date" value={retireModal.retireDate}
                onChange={e => setRetireModal(prev => ({ ...prev, retireDate: e.target.value }))}
                style={{width:'100%',boxSizing:'border-box',border:'1px solid #d1d5db',borderRadius:6,padding:'9px 12px',fontSize:14,color:'#111',background:'#fff'}} />
            </div>
            <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:6,padding:'10px 12px',marginBottom:20,fontSize:12,color:'#92400e',lineHeight:1.6}}>
              {isTokuteiGinou
                ? '確定後、参考様式第3-1-2号（特定技能雇用契約の終了）の届出が必要です。確定すると作成への案内を表示します。'
                : '退職時の届出義務は在留資格により異なります。ハローワークへの外国人雇用状況届出（離職時）が必要です。'}
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={() => setRetireModal({ open: false, retireDate: '', saving: false })}
                style={{padding:'8px 20px',borderRadius:6,border:'1px solid #ccc',background:'#fff',fontSize:14,cursor:'pointer'}}>
                キャンセル
              </button>
              <button onClick={handleRetire} disabled={retireModal.saving}
                style={{padding:'8px 20px',borderRadius:6,border:'none',
                  background: retireModal.saving ? '#e5e7eb' : '#dc2626',
                  color: retireModal.saving ? '#9ca3af' : '#fff',
                  fontSize:14,fontWeight:600,cursor: retireModal.saving ? 'not-allowed' : 'pointer'}}>
                {retireModal.saving ? '処理中...' : '退職処理を確定'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 在留カード更新 確認モーダル（現在の値との差分比較） */}
      {cardUpdate.open && cardUpdate.extracted && (() => {
        const d = cardUpdate.extracted
        const rows = [
          { label: '在留資格', current: activeStatus?.status_type ?? null, next: d.status_type ?? activeStatus?.status_type ?? null },
          { label: '在留期限', current: activeStatus?.expiry_date ?? null, next: d.expiry_date ?? activeStatus?.expiry_date ?? null },
          { label: '交付日', current: activeStatus?.issued_date ?? null, next: d.issued_date ?? activeStatus?.issued_date ?? null },
          { label: '在留カード番号', current: activeStatus?.card_number ?? null, next: d.residence_card_number ?? activeStatus?.card_number ?? null },
        ]
        return (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div style={{background:'#fff',borderRadius:12,padding:'28px 32px',width:560,maxWidth:'90vw',boxShadow:'0 8px 32px rgba(0,0,0,0.18)'}}>
              <h3 style={{margin:'0 0 8px',fontSize:16,fontWeight:700,color:'#111'}}>在留カード読み取り結果の確認</h3>
              <p style={{margin:'0 0 18px',fontSize:13,color:'#555',lineHeight:1.7}}>
                確定すると新しい在留資格情報が登録され、現在の情報は履歴として保持されます。
              </p>

              <div style={{border:'1px solid #e5e7eb',borderRadius:8,overflow:'hidden',marginBottom:20}}>
                <div style={{display:'grid',gridTemplateColumns:'120px 1fr 1fr',background:'#f8fafc',borderBottom:'1px solid #e5e7eb',fontSize:12,fontWeight:600,color:'#64748b'}}>
                  <div style={{padding:'8px 12px'}}>項目</div>
                  <div style={{padding:'8px 12px'}}>現在</div>
                  <div style={{padding:'8px 12px'}}>新しいカード</div>
                </div>
                {rows.map((r, i) => {
                  const changed = (r.current ?? '') !== (r.next ?? '')
                  return (
                    <div key={r.label} style={{display:'grid',gridTemplateColumns:'120px 1fr 1fr',borderBottom:i<rows.length-1?'1px solid #f1f5f9':'none',fontSize:13}}>
                      <div style={{padding:'10px 12px',color:'#666'}}>{r.label}</div>
                      <div style={{padding:'10px 12px',color:'#334155'}}>{r.current ?? '-'}</div>
                      <div style={{padding:'10px 12px',fontWeight:changed?700:400,color:changed?'#0066cc':'#94a3b8',background:changed?'#eff6ff':'transparent'}}>
                        {r.next ?? '-'}{changed && ' ←変更'}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button onClick={() => setCardUpdate({ open: false, extracting: false, extracted: null, saving: false })}
                  style={{padding:'8px 20px',borderRadius:6,border:'1px solid #ccc',background:'#fff',fontSize:14,cursor:'pointer'}}>
                  キャンセル
                </button>
                <button onClick={handleConfirmCardUpdate} disabled={cardUpdate.saving}
                  style={{padding:'8px 20px',borderRadius:6,border:'none',
                    background: cardUpdate.saving ? '#e5e7eb' : '#0066cc',
                    color: cardUpdate.saving ? '#9ca3af' : '#fff',
                    fontSize:14,fontWeight:600,cursor: cardUpdate.saving ? 'not-allowed' : 'pointer'}}>
                  {cardUpdate.saving ? '更新中...' : 'この内容で更新'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* 契約終了・新契約届出モーダル */}
      {km.open && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#fff',borderRadius:12,padding:'28px 32px',width:480,maxWidth:'90vw',boxShadow:'0 8px 32px rgba(0,0,0,0.18)'}}>
            <h3 style={{margin:'0 0 20px',fontSize:16,fontWeight:700,color:'#111'}}>契約終了・新契約締結 届出情報</h3>

            {/* A 契約終了 */}
            <div style={{border:'1px solid #e5e7eb',borderRadius:8,padding:'16px',marginBottom:16}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:km.hasTermination ? 14 : 0}}>
                <input type="checkbox" id="hasTermination" checked={km.hasTermination}
                  onChange={e => setKm({ hasTermination: e.target.checked })}
                  style={{width:16,height:16,cursor:'pointer'}} />
                <label htmlFor="hasTermination" style={{fontWeight:600,fontSize:14,cursor:'pointer'}}>A. 特定技能雇用契約の終了</label>
              </div>
              {km.hasTermination && (
                <div style={{display:'flex',flexDirection:'column',gap:12}}>
                  <div>
                    <label style={{fontSize:12,color:'#555',display:'block',marginBottom:4}}>契約終了年月日</label>
                    <input type="date" value={km.terminationDate} onChange={e => setKm({ terminationDate: e.target.value })}
                      style={{border:'1px solid #d0d0d0',borderRadius:6,padding:'7px 10px',fontSize:14,width:'100%',boxSizing:'border-box'}} />
                  </div>
                  <div>
                    <label style={{fontSize:12,color:'#555',display:'block',marginBottom:4}}>終了区分</label>
                    <select value={km.terminationType} onChange={e => setKm({ terminationType: e.target.value as typeof km.terminationType })}
                      style={{border:'1px solid #d0d0d0',borderRadius:6,padding:'7px 10px',fontSize:14,width:'100%',boxSizing:'border-box'}}>
                      <option value="expiry">01. 雇用契約の期間満了</option>
                      <option value="dismissal">02. 特定技能所属機関の都合による終了（経営上の都合）</option>
                      <option value="resignation">10. 外国人の都合による終了（自己都合退職）</option>
                      <option value="other">11. その他</option>
                    </select>
                  </div>
                  {km.terminationType === 'other' && (
                    <div>
                      <label style={{fontSize:12,color:'#555',display:'block',marginBottom:4}}>終了理由（その他の場合）</label>
                      <input type="text" value={km.terminationReason} onChange={e => setKm({ terminationReason: e.target.value })}
                        placeholder="理由を記入してください"
                        style={{border:'1px solid #d0d0d0',borderRadius:6,padding:'7px 10px',fontSize:14,width:'100%',boxSizing:'border-box'}} />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* B 新規締結 */}
            <div style={{border:'1px solid #e5e7eb',borderRadius:8,padding:'16px',marginBottom:24}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:km.hasNewContract ? 14 : 0}}>
                <input type="checkbox" id="hasNewContract" checked={km.hasNewContract}
                  onChange={e => setKm({ hasNewContract: e.target.checked })}
                  style={{width:16,height:16,cursor:'pointer'}} />
                <label htmlFor="hasNewContract" style={{fontWeight:600,fontSize:14,cursor:'pointer'}}>B. 新たな特定技能雇用契約の締結</label>
              </div>
              {km.hasNewContract && (
                <div>
                  <label style={{fontSize:12,color:'#555',display:'block',marginBottom:4}}>契約締結年月日</label>
                  <input type="date" value={km.newContractDate} onChange={e => setKm({ newContractDate: e.target.value })}
                    style={{border:'1px solid #d0d0d0',borderRadius:6,padding:'7px 10px',fontSize:14,width:'100%',boxSizing:'border-box'}} />
                </div>
              )}
            </div>

            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={() => setKm({ open: false })}
                style={{padding:'8px 20px',borderRadius:6,border:'1px solid #ccc',background:'#fff',fontSize:14,cursor:'pointer'}}>
                キャンセル
              </button>
              <button onClick={generateKeiyakuDoc} disabled={docGenerating === 'todoke_keiyaku_shuryo'}
                style={{padding:'8px 20px',borderRadius:6,border:'none',
                  background: docGenerating === 'todoke_keiyaku_shuryo' ? '#e5e7eb' : '#0066cc',
                  color: docGenerating === 'todoke_keiyaku_shuryo' ? '#9ca3af' : '#fff',
                  fontSize:14,fontWeight:600,cursor:docGenerating === 'todoke_keiyaku_shuryo' ? 'not-allowed' : 'pointer'}}>
                {docGenerating === 'todoke_keiyaku_shuryo' ? '⏳ 生成中...' : '📄 Excel生成・ダウンロード'}
              </button>
            </div>
          </div>
        </div>
      )}
      <AppHeader currentPage="employees" />

      <div style={{maxWidth:900,margin:"0 auto",padding:"32px 24px"}}>
        <button onClick={()=>router.push('/employees')} style={{background:"none",border:"none",color:"#0066cc",fontSize:13,cursor:"pointer",marginBottom:20,padding:0}}>← 一覧に戻る</button>

        {/* 退職処理完了 → 届出案内（3-1-2号は特定技能のみ） */}
        {retireDone && (
          <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:10,padding:'14px 18px',marginBottom:16,display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
            <div style={{flex:1,minWidth:260}}>
              <div style={{fontSize:14,fontWeight:700,color:'#92400e',marginBottom:2}}>✓ 退職処理が完了しました</div>
              <div style={{fontSize:13,color:'#92400e'}}>
                {isTokuteiGinou
                  ? '参考様式第3-1-2号（特定技能雇用契約の終了）の届出が必要です。'
                  : '退職時の届出義務は在留資格により異なります。ハローワークへの外国人雇用状況届出（離職時）が必要です。'}
              </div>
            </div>
            {isTokuteiGinou && (
              <button
                onClick={() => setKeiyakuModal(prev => ({ ...prev, open: true, hasTermination: true, terminationDate: contract?.termination_date ?? prev.terminationDate }))}
                style={{background:'#d97706',border:'none',borderRadius:6,padding:'9px 18px',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',flexShrink:0}}>
                3-1-2号届出を作成 →
              </button>
            )}
          </div>
        )}

        {/* Profile header */}
        <div style={{background:"#fff",border:"1px solid #e0e0e0",borderRadius:12,padding:"24px",marginBottom:16,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",display:"flex",alignItems:"center",gap:20}}>
          <div style={{fontSize:56}}>{getFlag(worker.nationality)}</div>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
              <h1 style={{margin:0,fontSize:22,fontWeight:700,color:"#000"}}>{worker.name_kanji || worker.name_romaji}</h1>
              {urgent && <span style={{background:"#fee2e2",color:"#dc2626",fontSize:11,padding:"2px 10px",borderRadius:4,fontWeight:600}}>期限間近</span>}
              {retired ? (
                <span style={{background:"#475569",color:"#fff",fontSize:11,padding:"2px 10px",borderRadius:4,fontWeight:600}}>
                  退職{contract?.termination_date ? `（${contract.termination_date}）` : ''}
                </span>
              ) : (
                <span style={{background:"#f0f0f0",color:"#666",fontSize:11,padding:"2px 10px",borderRadius:4}}>{worker.status === 'active' ? '在籍中' : worker.status}</span>
              )}
              {worker.status === 'active' && (
                <button onClick={() => setRetireModal({ open: true, retireDate: '', saving: false })}
                  style={{marginLeft:'auto',background:'#fff',border:'1px solid #dc2626',borderRadius:6,padding:'5px 14px',color:'#dc2626',fontSize:12,fontWeight:600,cursor:'pointer',flexShrink:0}}>
                  退職処理
                </button>
              )}
            </div>
            <div style={{fontSize:13,color:"#666"}}>{worker.nationality} ／ {activeStatus?.status_type || '未登録'}</div>
          </div>
          <div style={{textAlign:"center"}}>
            {trust && trustVerified ? (
              <ScoreRing score={Math.round(trust.total)} max={100} />
            ) : (
              <div style={{width:72,height:72,borderRadius:'50%',border:`6px solid ${trust ? BRANCH_META[trust.branch].border : '#f0f0f0'}`,display:'flex',alignItems:'center',justifyContent:'center',boxSizing:'border-box'}}>
                <span style={{fontSize:10,color: trust ? BRANCH_META[trust.branch].color : '#999'}}>{trust ? BRANCH_META[trust.branch].label : '...'}</span>
              </div>
            )}
            <div style={{fontSize:11,color:"#999",marginTop:4}}>信頼スコア</div>
            {trust && !trustVerified && (
              <div style={{fontSize:10,fontWeight:600,color:BRANCH_META[trust.branch].color,marginTop:2}}>{BRANCH_META[trust.branch].label}</div>
            )}
          </div>
        </div>

        {/* 四半期面談タスク（未完了分） */}
        {interviewTasks.length > 0 && (
          <div data-testid="interview-task-section" style={{background:"#fff",border:"1px solid #bfdbfe",borderRadius:12,padding:"16px 20px",marginBottom:16,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
            <div style={{fontSize:15,fontWeight:600,color:"#000",marginBottom:10}}>面談タスク</div>
            {interviewTasks.map((t, i) => (
              <div key={t.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:"9px 0",borderTop:i>0?"1px solid #f0f0f0":"none",flexWrap:"wrap"}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:"#111"}}>
                    {interviewVariantOf(t.task_type) === 'supervisor' ? '監督者面談' : '四半期面談（本人）'}（{t.period_key}）
                  </div>
                  <div style={{fontSize:12,color:new Date(t.due_date) < new Date() ? "#dc2626" : "#6b7280"}}>期限 {t.due_date}</div>
                </div>
                <button data-testid={`open-interview-${t.id}`} onClick={() => setOpenTask(t)}
                  style={{background:"#0066cc",border:"none",borderRadius:6,padding:"8px 16px",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",flexShrink:0}}>
                  面談を記録
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 実施済み面談記録（定期面談報告書 5-5号 の再ダウンロード） */}
        {interviewRecords.length > 0 && (
          <div data-testid="interview-records-section" style={{background:"#fff",border:"1px solid #e0e0e0",borderRadius:12,padding:"16px 20px",marginBottom:16,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
            <div style={{fontSize:15,fontWeight:600,color:"#000",marginBottom:10}}>面談記録（定期面談報告書 参考様式第5-5号／5-6号）</div>
            {interviewRecords.map((r, i) => (
              <div key={r.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:"9px 0",borderTop:i>0?"1px solid #f0f0f0":"none",flexWrap:"wrap"}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:"#111"}}>
                    {r.type === 'interview_supervisor' ? '監督者面談（5-6号）' : '本人面談（5-5号）'}（{r.quarter ?? '-'}）
                  </div>
                  <div style={{fontSize:12,color:"#6b7280"}}>実施日 {r.completed_date ?? '-'}</div>
                </div>
                <button data-testid={`download-report-${r.id}`} onClick={() => downloadInterviewReport(r)}
                  disabled={docGenerating === `mendan-${r.id}`}
                  style={{background:"#fff",border:"1px solid #d0d0d0",borderRadius:6,padding:"8px 16px",color:docGenerating === `mendan-${r.id}` ? "#9ca3af" : "#374151",fontSize:13,fontWeight:600,cursor:docGenerating === `mendan-${r.id}` ? "not-allowed" : "pointer",flexShrink:0}}>
                  {docGenerating === `mendan-${r.id}` ? '⏳ 生成中...' : '📄 報告書をダウンロード'}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 10支援業務の実施状況（レポートビュー・特定技能1号のみ） */}
        {activeStatus?.status_type === '特定技能1号' && serviceMatrix.length > 0 && (() => {
          const rate = completionRate(serviceMatrix)
          return (
            <div data-testid="service-matrix-card" style={{background:"#fff",border:"1px solid #e0e0e0",borderRadius:12,padding:"16px 20px",marginBottom:16,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
              <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:10}}>
                <div style={{fontSize:15,fontWeight:600,color:"#000"}}>支援業務の実施状況</div>
                <div style={{fontSize:12,color:"#6b7280"}}>
                  常時義務の実施率 <span data-testid="matrix-rate" style={{fontWeight:700,color:"#111"}}>{rate.done}/{rate.total}</span>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column"}}>
                {serviceMatrix.map(({ def, status }, i) => {
                  const s = STATUS_STYLE[status]
                  return (
                    <div key={def.key} data-testid={`matrix-row-${def.key}`}
                      style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderTop:i>0?"1px solid #f3f4f6":"none"}}>
                      <span style={{width:22,fontSize:12,color:"#9ca3af",fontVariantNumeric:"tabular-nums",flexShrink:0}}>{def.no}</span>
                      <span style={{flex:1,minWidth:0,fontSize:13,color:"#374151"}}>{def.label}</span>
                      <span data-testid={`matrix-status-${def.key}`}
                        style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:12,fontWeight:600,color:s.color,background:s.bg,borderRadius:9999,padding:"3px 10px",flexShrink:0}}>
                        {s.icon} {STATUS_LABEL[status]}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div style={{fontSize:11,color:"#9ca3af",marginTop:10}}>
                監査・記録の一覧表示です。「該当なし」は事由発生時のみ必要な業務、実施記録がある業務は「実施済」になります。
              </div>
            </div>
          )
        })()}

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
          {/* 在留情報 */}
          <div style={{background:"#fff",border:urgent?"1px solid #fecaca":"1px solid #e0e0e0",borderRadius:12,padding:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <h2 style={{margin:0,fontSize:15,fontWeight:600,color:"#000"}}>在留情報</h2>
              <button onClick={handleOpenEditStatus}
                style={{background:"none",border:"1px solid #d0d0d0",borderRadius:6,padding:"4px 12px",fontSize:12,cursor:"pointer",color:"#555"}}>
                ✏️ 編集
              </button>
            </div>
            {[
              {label:"在留資格", value:activeStatus?.status_type || '-'},
              {label:"在留期限", value:activeStatus?.expiry_date || '-'},
              {label:"残り日数", value:<span style={{color:urgent?"#dc2626":"#16a34a",fontWeight:700}}>{days}日</span>},
              {label:"在留カード番号", value:activeStatus?.card_number || '-'},
            ].map((item,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:i<3?"1px solid #f0f0f0":"none"}}>
                <span style={{fontSize:13,color:"#666"}}>{item.label}</span>
                <span style={{fontSize:13,color:"#000",fontWeight:500}}>{item.value}</span>
              </div>
            ))}
            <input
              ref={cardFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              style={{display:'none'}}
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) handleCardUpdateFile(file)
                e.target.value = ''
              }}
            />
            <button
              onClick={() => cardFileRef.current?.click()}
              disabled={cardUpdate.extracting}
              style={{marginTop:16,background:cardUpdate.extracting?"#e5e7eb":"#0066cc",border:"none",borderRadius:6,padding:"10px 16px",color:cardUpdate.extracting?"#9ca3af":"#fff",fontSize:13,fontWeight:600,cursor:cardUpdate.extracting?"not-allowed":"pointer",width:"100%"}}
            >
              {cardUpdate.extracting ? '⏳ AI読み取り中...' : '📷 新しい在留カードを読み取って更新'}
            </button>
            <button
              onClick={() => alert('この機能は準備中です。今後、在留資格更新申請書の自動生成に対応予定です。')}
              style={{marginTop:8,background:"#f3f4f6",border:"1px solid #d1d5db",borderRadius:6,padding:"10px 16px",color:"#6b7280",fontSize:13,fontWeight:600,cursor:"pointer",width:"100%"}}
            >
              更新申請書を生成（準備中）
            </button>
          </div>

          {/* 基本情報 */}
          <div style={{background:"#fff",border:"1px solid #e0e0e0",borderRadius:12,padding:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <h2 style={{margin:0,fontSize:15,fontWeight:600,color:"#000"}}>基本情報</h2>
              <button onClick={handleOpenEditWorker}
                style={{background:"none",border:"1px solid #d0d0d0",borderRadius:6,padding:"4px 12px",fontSize:12,cursor:"pointer",color:"#555"}}>
                ✏️ 編集
              </button>
            </div>
            {[
              {label:"氏名（ローマ字）", value:worker.name_romaji},
              {label:"生年月日", value:worker.date_of_birth},
              {label:"国籍", value:worker.nationality},
              {label:"性別", value:worker.gender === 'male' ? '男性' : worker.gender === 'female' ? '女性' : '-'},
              {label:"パスポート番号", value:worker.passport_number, missingBadge:!worker.passport_number},
              {label:"在留カード番号", value:activeStatus?.card_number || '-'},
            ].map((item,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:i<5?"1px solid #f0f0f0":"none"}}>
                <span style={{fontSize:13,color:"#666"}}>{item.label}</span>
                {item.missingBadge ? (
                  <span style={{fontSize:11,fontWeight:600,color:"#92400e",background:"#fef3c7",border:"1px solid #fde68a",borderRadius:9999,padding:"2px 10px"}}>⚠️ 未入力</span>
                ) : (
                  <span style={{fontSize:13,color:"#000",fontWeight:500}}>{item.value}</span>
                )}
              </div>
            ))}
          </div>

          {/* 信頼スコア内訳（§6-1） */}
          <TrustScoreCard result={trust} snapshots={snapshots} />
        </div>

        {/* 雇用条件入力 */}
        <div style={{background:"#fff",border:"1px solid #e0e0e0",borderRadius:12,padding:"20px",marginBottom:16,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:15,fontWeight:600,color:"#000",marginBottom:2}}>雇用条件書</div>
            <div style={{fontSize:13,color:"#888"}}>契約期間・労働時間・賃金などを入力します</div>
          </div>
          <button
            onClick={() => router.push(`/employees/${worker.id}/employment-conditions`)}
            style={{background:"#0066cc",border:"none",borderRadius:6,padding:"9px 18px",color:"#fff",fontWeight:600,fontSize:13,cursor:"pointer",flexShrink:0}}
          >
            ✏️ 雇用条件を入力
          </button>
        </div>

        {/* 賃金台帳 */}
        <div style={{background:"#fff",border:"1px solid #e0e0e0",borderRadius:12,padding:"20px",marginBottom:16,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:15,fontWeight:600,color:"#000",marginBottom:2}}>賃金台帳</div>
            <div style={{fontSize:13,color:"#888"}}>給与明細をAIで読み取り、月別に記録します</div>
          </div>
          <button
            onClick={() => router.push(`/employees/${worker.id}/payroll`)}
            style={{background:"#7c3aed",border:"none",borderRadius:6,padding:"9px 18px",color:"#fff",fontWeight:600,fontSize:13,cursor:"pointer",flexShrink:0}}
          >
            ✨ 賃金台帳を開く
          </button>
        </div>

        {/* 書類生成セクション — 在留資格に応じて動的に表示 */}
        {applicableDocs.length > 0 && (
          <div style={{background:"#fff",border:"1px solid #e0e0e0",borderRadius:12,padding:"20px",marginBottom:16,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
              <h2 style={{margin:0,fontSize:15,fontWeight:600,color:"#000"}}>書類生成</h2>
              <span style={{fontSize:12,color:"#888",background:"#f5f5f5",padding:"2px 8px",borderRadius:4}}>
                {activeStatus?.status_type}
              </span>
            </div>

            {availableDocs.length > 0 && (
              <div style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:comingSoonDocs.length > 0 ? 14 : 0}}>
                {availableDocs.map(doc => (
                  <button
                    key={doc.id}
                    onClick={() => generateWordDoc(doc)}
                    disabled={docGenerating === doc.id}
                    style={{
                      background: docGenerating === doc.id ? '#e5e7eb' : '#0066cc',
                      color: docGenerating === doc.id ? '#9ca3af' : '#fff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '9px 16px',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: docGenerating === doc.id ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {docGenerating === doc.id ? '⏳ 生成中...' : `📄 ${doc.shortLabel}`}
                  </button>
                ))}
              </div>
            )}

            {comingSoonDocs.length > 0 && (
              <div>
                <div style={{fontSize:11,color:"#999",marginBottom:8}}>準備中</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {comingSoonDocs.map(doc => (
                    <span
                      key={doc.id}
                      style={{
                        background:"#f5f5f5",
                        color:"#aaa",
                        border:"1px solid #e5e7eb",
                        borderRadius:6,
                        padding:"6px 14px",
                        fontSize:12,
                      }}
                    >
                      {doc.shortLabel}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 在留資格履歴（時系列） */}
        {statusHistory.length > 0 && (
          <div style={{background:"#fff",border:"1px solid #e0e0e0",borderRadius:12,padding:"20px",marginBottom:16,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
            <h2 style={{margin:"0 0 14px",fontSize:15,fontWeight:600,color:"#000"}}>在留資格履歴</h2>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {statusHistory.map(s => (
                <div key={s.id} style={{display:'flex',alignItems:'center',gap:12,border:s.is_active?'1px solid #bfdbfe':'1px solid #f0f0f0',background:s.is_active?'#eff6ff':'#fafafa',borderRadius:8,padding:'10px 14px'}}>
                  <span style={{fontSize:11,fontWeight:600,padding:'2px 10px',borderRadius:9999,flexShrink:0,
                    background:s.is_active?'#0066cc':'#e5e7eb',color:s.is_active?'#fff':'#6b7280'}}>
                    {s.is_active ? '現在' : '過去'}
                  </span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:'#111'}}>{s.status_type || '-'}</div>
                    <div style={{fontSize:12,color:'#888'}}>
                      期限：{s.expiry_date || '-'}　交付日：{s.issued_date || '-'}　カード番号：{s.card_number || '-'}
                    </div>
                  </div>
                  <div style={{fontSize:11,color:'#aaa',flexShrink:0}}>
                    登録日 {s.created_at ? s.created_at.slice(0, 10) : '-'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* 四半期面談モーダル（三段式） */}
      {openTask && worker && (
        <InterviewTaskModal
          task={openTask}
          workerName={worker.name_kanji || worker.name_romaji}
          // 担当者・言語等は variant 横断で引き継ぐ（原則1）。同 variant の前回が
          // あれば優先し、無ければもう一方の面談の前回記録にフォールバック
          prevNotes={
            prevNotesByType[interviewVariantOf(openTask.task_type)]
              ?? prevNotesByType[interviewVariantOf(openTask.task_type) === 'worker' ? 'supervisor' : 'worker']
          }
          orgPrefill={orgPrefill}
          onClose={() => setOpenTask(null)}
          onSaved={() => {
            setOpenTask(null)
            fetchInterviewTasks()          // タスク一覧から消えることを反映
            setTrustRefresh(n => n + 1)    // 信頼スコアを再算出
          }}
        />
      )}
    </div>
  )
}
