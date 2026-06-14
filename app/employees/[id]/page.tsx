'use client'
import { useRouter, useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

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

export default function EmployeeDetail() {
  const router = useRouter()
  const params = useParams()
  const [worker, setWorker] = useState<Worker | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [document, setDocument] = useState<string | null>(null)
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

  const generateDocument = async () => {
    if (!worker) return
    setGenerating(true)
    setDocument(null)
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

const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    })
    const data = await res.json()
    setDocument(data.text || 'エラーが発生しました')
    setGenerating(false)  }

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

  return (
    <div style={{minHeight:"100vh",background:"#f3f2ef",fontFamily:"system-ui,sans-serif"}}>
      <div style={{background:"#fff",borderBottom:"1px solid #e0e0e0",padding:"0 24px",height:56,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:8,background:"linear-gradient(135deg,#0066cc,#004499)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🌐</div>
          <span style={{fontWeight:700,fontSize:18,color:"#000"}}>TrustLayer</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <button onClick={()=>router.push('/dashboard')} style={{background:"none",border:"none",color:"#666",fontSize:13,cursor:"pointer"}}>ダッシュボード</button>
          <button onClick={()=>router.push('/employees')} style={{background:"none",border:"none",color:"#0066cc",fontSize:13,fontWeight:600,cursor:"pointer"}}>在留管理</button>
          <div style={{width:34,height:34,borderRadius:"50%",background:"#0066cc",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,color:"#fff",fontSize:14}}>田</div>
        </div>
      </div>

      <div style={{maxWidth:900,margin:"0 auto",padding:"32px 24px"}}>
        <button onClick={()=>router.push('/employees')} style={{background:"none",border:"none",color:"#0066cc",fontSize:13,cursor:"pointer",marginBottom:20,padding:0}}>← 一覧に戻る</button>

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
            <div style={{fontSize:36,fontWeight:700,color:"#16a34a"}}>--</div>
            <div style={{fontSize:12,color:"#999"}}>信頼スコア</div>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
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
              onClick={generateDocument}
              disabled={generating}
              style={{marginTop:16,background:generating?"#999":"#dc2626",border:"none",borderRadius:6,padding:"10px 16px",color:"#fff",fontSize:13,fontWeight:600,cursor:generating?"not-allowed":"pointer",width:"100%"}}
            >
              {generating ? '⏳ AI生成中...' : '更新申請書を生成 →'}
            </button>
          </div>

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

          <div style={{background:"#fff",border:"1px solid #e0e0e0",borderRadius:12,padding:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
            <h2 style={{margin:"0 0 16px",fontSize:15,fontWeight:600,color:"#000"}}>信頼スコア内訳</h2>
            <div style={{textAlign:"center",padding:"20px",color:"#999",fontSize:13}}>
              📊 データ収集中...<br/>
              <span style={{fontSize:12}}>評価データが入力されると自動算出されます</span>
            </div>
          </div>
        </div>

        {/* AI生成結果 */}
        {document && (
          <div style={{background:"#fff",border:"1px solid #0066cc",borderRadius:12,padding:"24px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h2 style={{margin:0,fontSize:15,fontWeight:600,color:"#000"}}>✨ AI生成：在留資格更新許可申請書</h2>
              <button
                onClick={()=>navigator.clipboard.writeText(document)}
                style={{background:"#f0f0f0",border:"none",borderRadius:6,padding:"6px 12px",fontSize:12,cursor:"pointer",color:"#333"}}
              >コピー</button>
            </div>
            <pre style={{margin:0,fontSize:13,lineHeight:1.8,color:"#333",whiteSpace:"pre-wrap",fontFamily:"system-ui,sans-serif"}}>{document}</pre>
          </div>
        )}
      </div>
    </div>
  )
}