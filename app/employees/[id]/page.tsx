'use client'
import { useRouter, useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getDocumentsForStatus, type DocumentDef } from '@/lib/documents/statusDocumentMap'
import AppHeader from '@/components/AppHeader'

type Worker = {
  id: string
  name_kanji: string
  name_romaji: string
  nationality: string
  date_of_birth: string
  passport_number: string
  residence_card_number: string
  preferred_language: string
  status: string
  residence_statuses: {
    status_type: string
    expiry_date: string
    issued_date: string
    card_number: string
    is_active: boolean
  }[]
}

type Evaluation = {
  attendance_score: number | null
  performance_score: number | null
  compliance_score: number | null
  evaluated_at: string | null
}

type ScoreBreakdown = {
  total: number
  expiry: { score: number; max: number; label: string }
  docs: { score: number; max: number; label: string }
  attendance: { score: number | null; max: number; label: string }
  performance: { score: number | null; max: number; label: string }
  compliance: { score: number | null; max: number; label: string }
  hasEvaluation: boolean
}

function calcTrustScore(worker: Worker, evaluation: Evaluation | null): ScoreBreakdown {
  const activeStatus = worker.residence_statuses?.find(s => s.is_active)
  const days = activeStatus
    ? Math.ceil((new Date(activeStatus.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : -1

  let expiryScore = 0
  if (days >= 90) expiryScore = 30
  else if (days >= 60) expiryScore = 22
  else if (days >= 30) expiryScore = 12
  else if (days >= 0) expiryScore = 5

  let docScore = 0
  if (worker.passport_number) docScore += 5
  if (worker.residence_card_number) docScore += 5
  if (activeStatus?.status_type) docScore += 5
  if (activeStatus?.expiry_date) docScore += 5

  const attendance = evaluation?.attendance_score ?? null
  const performance = evaluation?.performance_score ?? null
  const compliance = evaluation?.compliance_score ?? null
  const hasEvaluation = evaluation !== null

  const total = expiryScore + docScore + (attendance ?? 0) + (performance ?? 0) + (compliance ?? 0)

  return {
    total,
    expiry: { score: expiryScore, max: 30, label: '在留期限管理' },
    docs: { score: docScore, max: 20, label: '書類整備' },
    attendance: { score: attendance, max: 20, label: '勤怠評価' },
    performance: { score: performance, max: 20, label: '業務評価' },
    compliance: { score: compliance, max: 10, label: 'コンプライアンス' },
    hasEvaluation,
  }
}

function ScoreBar({ score, max, hasData }: { score: number | null; max: number; hasData: boolean }) {
  if (!hasData || score === null) {
    return (
      <div style={{ height: 6, borderRadius: 3, background: '#f0f0f0', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
      </div>
    )
  }
  const pct = Math.round((score / max) * 100)
  const color = pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626'
  return (
    <div style={{ height: 6, borderRadius: 3, background: '#f0f0f0', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
    </div>
  )
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
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generatedDoc, setGeneratedDoc] = useState<string | null>(null)
  const [docGenerating, setDocGenerating] = useState<string | null>(null)
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
    const fetchEvaluation = async () => {
      try {
        const { data, error } = await supabase
          .from('evaluations')
          .select('attendance_score, performance_score, compliance_score, evaluated_at')
          .eq('worker_id', params.id)
          .order('evaluated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!error && data) setEvaluation(data)
      } catch {
        // evaluations table not yet created — ignore
      }
    }
    fetchEvaluation()
  }, [params.id])

  const generateRenewalDoc = async () => {
    if (!worker) return
    setGenerating(true)
    setGeneratedDoc(null)
    const activeStatus = worker.residence_statuses?.find(s => s.is_active)

    const prompt = `以下の外国人労働者の情報をもとに、在留資格更新許可申請書の下書きを日本語で作成してください。

【申請者情報】
氏名（漢字）: ${worker.name_kanji}
氏名（ローマ字）: ${worker.name_romaji}
国籍: ${worker.nationality}
生年月日: ${worker.date_of_birth}
パスポート番号: ${worker.passport_number}
在留カード番号: ${worker.residence_card_number}
在留資格: ${activeStatus?.status_type || '不明'}
在留期限: ${activeStatus?.expiry_date || '不明'}

申請書の形式で、申請理由・就労状況・今後の活動予定を含む文書を作成してください。`

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      })
      const data = await res.json()
      setGeneratedDoc(data.text || 'エラーが発生しました')
    } catch (e) {
      console.error('[generate] error:', e)
      setGeneratedDoc('通信エラーが発生しました。もう一度お試しください。')
    } finally {
      setGenerating(false)
    }
  }

  const generateWordDoc = async (doc: DocumentDef) => {
    if (!worker) return
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

  const getDaysUntil = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - new Date().getTime()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }

  const getFlag = (nationality: string) => {
    const flags: {[key: string]: string} = {
      'ベトナム': '🇻🇳', 'フィリピン': '🇵🇭', '中国': '🇨🇳',
      'バングラデシュ': '🇧🇩', '韓国': '🇰🇷'
    }
    return flags[nationality] || '🌏'
  }

  if (loading) return <div style={{padding:40,textAlign:"center",color:"#666"}}>読み込み中...</div>
  if (!worker) return <div style={{padding:40,textAlign:"center",color:"#666"}}>データが見つかりません</div>

  const activeStatus = worker.residence_statuses?.find(s => s.is_active)
  const days = activeStatus ? getDaysUntil(activeStatus.expiry_date) : 999
  const urgent = days <= 30
  const score = calcTrustScore(worker, evaluation)
  const scoreColor = score.total >= 80 ? '#16a34a' : score.total >= 50 ? '#d97706' : '#dc2626'

  const breakdownItems = [
    score.expiry,
    score.docs,
    score.attendance,
    score.performance,
    score.compliance,
  ]

  const applicableDocs = getDocumentsForStatus(activeStatus?.status_type ?? '')
  const availableDocs = applicableDocs.filter(d => d.available)
  const comingSoonDocs = applicableDocs.filter(d => !d.available)

  return (
    <div style={{minHeight:"100vh",background:"#f3f2ef",fontFamily:"system-ui,sans-serif"}}>
      <AppHeader currentPage="employees" />

      <div style={{maxWidth:900,margin:"0 auto",padding:"32px 24px"}}>
        <button onClick={()=>router.push('/employees')} style={{background:"none",border:"none",color:"#0066cc",fontSize:13,cursor:"pointer",marginBottom:20,padding:0}}>← 一覧に戻る</button>

        {/* Profile header */}
        <div style={{background:"#fff",border:"1px solid #e0e0e0",borderRadius:12,padding:"24px",marginBottom:16,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",display:"flex",alignItems:"center",gap:20}}>
          <div style={{fontSize:56}}>{getFlag(worker.nationality)}</div>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
              <h1 style={{margin:0,fontSize:22,fontWeight:700,color:"#000"}}>{worker.name_kanji}</h1>
              {urgent && <span style={{background:"#fee2e2",color:"#dc2626",fontSize:11,padding:"2px 10px",borderRadius:4,fontWeight:600}}>期限間近</span>}
              <span style={{background:"#f0f0f0",color:"#666",fontSize:11,padding:"2px 10px",borderRadius:4}}>{worker.status === 'active' ? '在籍中' : worker.status}</span>
            </div>
            <div style={{fontSize:13,color:"#666"}}>{worker.nationality} ／ {activeStatus?.status_type || '未登録'}</div>
          </div>
          <div style={{textAlign:"center"}}>
            <ScoreRing score={score.total} max={100} />
            <div style={{fontSize:11,color:"#999",marginTop:4}}>信頼スコア</div>
            {!score.hasEvaluation && (
              <div style={{fontSize:10,color:"#d97706",marginTop:2}}>評価待ち含む</div>
            )}
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
          {/* 在留情報 */}
          <div style={{background:"#fff",border:urgent?"1px solid #fecaca":"1px solid #e0e0e0",borderRadius:12,padding:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
            <h2 style={{margin:"0 0 16px",fontSize:15,fontWeight:600,color:"#000"}}>在留情報</h2>
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
            <button
              onClick={generateRenewalDoc}
              disabled={generating}
              style={{marginTop:16,background:generating?"#999":"#dc2626",border:"none",borderRadius:6,padding:"10px 16px",color:"#fff",fontSize:13,fontWeight:600,cursor:generating?"not-allowed":"pointer",width:"100%"}}
            >
              {generating ? '⏳ AI生成中...' : '更新申請書を生成 →'}
            </button>
          </div>

          {/* 基本情報 */}
          <div style={{background:"#fff",border:"1px solid #e0e0e0",borderRadius:12,padding:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
            <h2 style={{margin:"0 0 16px",fontSize:15,fontWeight:600,color:"#000"}}>基本情報</h2>
            {[
              {label:"氏名（ローマ字）", value:worker.name_romaji},
              {label:"生年月日", value:worker.date_of_birth},
              {label:"国籍", value:worker.nationality},
              {label:"パスポート番号", value:worker.passport_number},
            ].map((item,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:i<3?"1px solid #f0f0f0":"none"}}>
                <span style={{fontSize:13,color:"#666"}}>{item.label}</span>
                <span style={{fontSize:13,color:"#000",fontWeight:500}}>{item.value}</span>
              </div>
            ))}
          </div>

          {/* 連絡先 */}
          <div style={{background:"#fff",border:"1px solid #e0e0e0",borderRadius:12,padding:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
            <h2 style={{margin:"0 0 16px",fontSize:15,fontWeight:600,color:"#000"}}>連絡先</h2>
            {[
              {label:"使用言語", value:worker.preferred_language === 'vi' ? 'ベトナム語' : worker.preferred_language === 'zh' ? '中国語' : worker.preferred_language === 'en' ? '英語' : '日本語'},
              {label:"在留カード番号", value:worker.residence_card_number},
            ].map((item,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:i<1?"1px solid #f0f0f0":"none"}}>
                <span style={{fontSize:13,color:"#666"}}>{item.label}</span>
                <span style={{fontSize:13,color:"#000",fontWeight:500}}>{item.value}</span>
              </div>
            ))}
            <button style={{marginTop:16,background:"#00b300",border:"none",borderRadius:6,padding:"10px 16px",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",width:"100%"}}>LINEで通知を送る</button>
          </div>

          {/* 信頼スコア内訳 */}
          <div style={{background:"#fff",border:"1px solid #e0e0e0",borderRadius:12,padding:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <h2 style={{margin:0,fontSize:15,fontWeight:600,color:"#000"}}>信頼スコア内訳</h2>
              <div style={{fontSize:20,fontWeight:700,color:scoreColor}}>{score.total}<span style={{fontSize:12,color:"#999",fontWeight:400}}> / 100</span></div>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {breakdownItems.map((item, i) => {
                const hasData = i < 2 || score.hasEvaluation
                const scoreVal = item.score
                const pct = hasData && scoreVal !== null ? Math.round((scoreVal / item.max) * 100) : 0
                const itemColor = pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626'

                return (
                  <div key={i}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <span style={{fontSize:12,color:"#555"}}>{item.label}</span>
                      {hasData && scoreVal !== null ? (
                        <span style={{fontSize:12,fontWeight:600,color:itemColor}}>{scoreVal} / {item.max}</span>
                      ) : (
                        <span style={{fontSize:11,color:"#bbb",background:"#f5f5f5",padding:"1px 8px",borderRadius:3}}>未入力</span>
                      )}
                    </div>
                    <ScoreBar score={scoreVal} max={item.max} hasData={hasData} />
                  </div>
                )
              })}
            </div>

            {!score.hasEvaluation && (
              <div style={{marginTop:14,padding:"8px 10px",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:6,fontSize:11,color:"#92400e"}}>
                ※ 勤怠・業務・コンプライアンスの評価データが未入力です。
              </div>
            )}
          </div>
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

        {/* AI生成結果（在留資格更新申請書） */}
        {generatedDoc && (
          <div style={{background:"#fff",border:"1px solid #0066cc",borderRadius:12,padding:"24px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h2 style={{margin:0,fontSize:15,fontWeight:600,color:"#000"}}>✨ AI生成：在留資格更新許可申請書</h2>
              <button
                onClick={()=>navigator.clipboard.writeText(generatedDoc)}
                style={{background:"#f0f0f0",border:"none",borderRadius:6,padding:"6px 12px",fontSize:12,cursor:"pointer",color:"#333"}}
              >コピー</button>
            </div>
            <pre style={{margin:0,fontSize:13,lineHeight:1.8,color:"#333",whiteSpace:"pre-wrap",fontFamily:"system-ui,sans-serif"}}>{generatedDoc}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
