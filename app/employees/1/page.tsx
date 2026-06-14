'use client'
import { useRouter } from 'next/navigation'

export default function EmployeeDetail() {
  const router = useRouter()
  const employee = {
    id: 1,
    name: "Nguyen Van An",
    nameRomaji: "NGUYEN VAN AN",
    country: "🇻🇳",
    nationality: "ベトナム",
    visa: "特定技能1号",
    expire: "2025-06-14",
    days: 14,
    score: 92,
    status: "在籍中",
    dob: "1998-03-15",
    passport: "B12345678",
    cardNumber: "RC-2023-001",
    language: "ベトナム語",
    lineId: "nguyen_vanan",
  }

  return (
    <div style={{minHeight:"100vh",background:"#f3f2ef",fontFamily:"system-ui,sans-serif"}}>
      {/* Header */}
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
        {/* Back button */}
        <button onClick={()=>router.push('/employees')} style={{background:"none",border:"none",color:"#0066cc",fontSize:13,cursor:"pointer",marginBottom:20,padding:0}}>← 一覧に戻る</button>

        {/* Profile header */}
        <div style={{background:"#fff",border:"1px solid #e0e0e0",borderRadius:12,padding:"24px",marginBottom:16,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",display:"flex",alignItems:"center",gap:20}}>
          <div style={{fontSize:56}}>{employee.country}</div>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
              <h1 style={{margin:0,fontSize:22,fontWeight:700,color:"#000"}}>{employee.name}</h1>
              <span style={{background:"#fee2e2",color:"#dc2626",fontSize:11,padding:"2px 10px",borderRadius:4,fontWeight:600}}>期限間近</span>
              <span style={{background:"#f0f0f0",color:"#666",fontSize:11,padding:"2px 10px",borderRadius:4}}>{employee.status}</span>
            </div>
            <div style={{fontSize:13,color:"#666"}}>{employee.nationality} ／ {employee.visa}</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:36,fontWeight:700,color:"#16a34a"}}>{employee.score}</div>
            <div style={{fontSize:12,color:"#999"}}>信頼スコア</div>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          {/* 在留情報 */}
          <div style={{background:"#fff",border:"1px solid #fecaca",borderRadius:12,padding:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
            <h2 style={{margin:"0 0 16px",fontSize:15,fontWeight:600,color:"#000"}}>在留情報</h2>
            {[
              {label:"在留資格", value:employee.visa},
              {label:"在留期限", value:employee.expire},
              {label:"残り日数", value:<span style={{color:"#dc2626",fontWeight:700}}>{employee.days}日</span>},
              {label:"在留カード番号", value:employee.cardNumber},
            ].map((item,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:i<3?"1px solid #f0f0f0":"none"}}>
                <span style={{fontSize:13,color:"#666"}}>{item.label}</span>
                <span style={{fontSize:13,color:"#000",fontWeight:500}}>{item.value}</span>
              </div>
            ))}
            <button style={{marginTop:16,background:"#dc2626",border:"none",borderRadius:6,padding:"10px 16px",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",width:"100%"}}>更新申請書を生成 →</button>
          </div>

          {/* 基本情報 */}
          <div style={{background:"#fff",border:"1px solid #e0e0e0",borderRadius:12,padding:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
            <h2 style={{margin:"0 0 16px",fontSize:15,fontWeight:600,color:"#000"}}>基本情報</h2>
            {[
              {label:"氏名（ローマ字）", value:employee.nameRomaji},
              {label:"生年月日", value:employee.dob},
              {label:"国籍", value:employee.nationality},
              {label:"パスポート番号", value:employee.passport},
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
              {label:"使用言語", value:employee.language},
              {label:"LINE ID", value:employee.lineId},
            ].map((item,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:i<1?"1px solid #f0f0f0":"none"}}>
                <span style={{fontSize:13,color:"#666"}}>{item.label}</span>
                <span style={{fontSize:13,color:"#000",fontWeight:500}}>{item.value}</span>
              </div>
            ))}
            <button style={{marginTop:16,background:"#00b300",border:"none",borderRadius:6,padding:"10px 16px",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",width:"100%"}}>LINEで通知を送る</button>
          </div>

          {/* 信頼スコア */}
          <div style={{background:"#fff",border:"1px solid #e0e0e0",borderRadius:12,padding:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
            <h2 style={{margin:"0 0 16px",fontSize:15,fontWeight:600,color:"#000"}}>信頼スコア内訳</h2>
            {[
              {label:"書類検証", value:90, max:100},
              {label:"職務実績", value:85, max:100},
              {label:"適合性評価", value:95, max:100},
              {label:"コンプライアンス", value:92, max:100},
            ].map((item,i)=>(
              <div key={i} style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:12,color:"#666"}}>{item.label}</span>
                  <span style={{fontSize:12,fontWeight:600,color:"#000"}}>{item.value}</span>
                </div>
                <div style={{background:"#f0f0f0",borderRadius:4,height:6}}>
                  <div style={{background:"#16a34a",borderRadius:4,height:6,width:`${item.value}%`}}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}