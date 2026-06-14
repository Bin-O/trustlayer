'use client'
import { useRouter } from 'next/navigation'

export default function Dashboard() {
  const router = useRouter()
  const tasks = [
    {id:1, urgent:true, name:"Nguyen Van An", msg:"在留期限まで14日", action:"申請書を作成"},
    {id:2, urgent:true, name:"Santos Maria", msg:"支援面談が未実施", action:"面談を記録"},
    {id:3, urgent:false, name:"Chen Xiaoming", msg:"試用期間評価の提出", action:"評価を入力"},
  ]
  const stats = [
    {icon:"👥", num:20, label:"在籍者数", color:"#0066cc"},
    {icon:"⚠️", num:3, label:"期限間近", color:"#dc2626"},
    {icon:"📋", num:2, label:"承認待ち", color:"#d97706"},
    {icon:"✅", num:15, label:"支援完了", color:"#16a34a"},
  ]
  return (
    <div style={{minHeight:"100vh",background:"#f3f2ef",fontFamily:"system-ui,sans-serif"}}>
      {/* Header */}
      <div style={{background:"#fff",borderBottom:"1px solid #e0e0e0",padding:"0 24px",height:56,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:8,background:"linear-gradient(135deg,#0066cc,#004499)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🌐</div>
          <span style={{fontWeight:700,fontSize:18,color:"#000"}}>TrustLayer</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <button onClick={()=>router.push('/employees')} style={{background:"#0066cc",border:"none",borderRadius:6,padding:"8px 16px",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer"}}>外国人管理</button>
          <div style={{width:34,height:34,borderRadius:"50%",background:"#0066cc",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,color:"#fff",fontSize:14}}>田</div>
        </div>
      </div>

      <div style={{maxWidth:900,margin:"0 auto",padding:"32px 24px"}}>
        {/* Welcome */}
        <div style={{marginBottom:28}}>
          <h1 style={{margin:"0 0 4px",fontSize:22,fontWeight:700,color:"#000"}}>おはようございます 👋</h1>
          <p style={{margin:0,fontSize:14,color:"#666"}}>今日のタスクを確認しましょう</p>
        </div>

        {/* KPI Cards */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:28}}>
          {stats.map((s,i)=>(
            <div key={i} style={{background:"#fff",border:"1px solid #e0e0e0",borderRadius:12,padding:"20px 16px",textAlign:"center",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
              <div style={{fontSize:24,marginBottom:8}}>{s.icon}</div>
              <div style={{fontSize:28,fontWeight:700,color:s.color}}>{s.num}</div>
              <div style={{fontSize:12,color:"#666",marginTop:4}}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          {/* Today's tasks */}
          <div style={{background:"#fff",border:"1px solid #e0e0e0",borderRadius:12,padding:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
            <h2 style={{margin:"0 0 16px",fontSize:15,fontWeight:600,color:"#000"}}>今日やること（{tasks.length}件）</h2>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {tasks.map(t=>(
                <div key={t.id} style={{border:t.urgent?"1px solid #fecaca":"1px solid #e0e0e0",borderRadius:8,padding:"12px",background:t.urgent?"#fff5f5":"#fafafa"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <span style={{fontSize:13}}>{t.urgent?"🚨":"📋"}</span>
                    <span style={{fontWeight:600,fontSize:13,color:"#000"}}>{t.name}</span>
                    {t.urgent&&<span style={{background:"#fee2e2",color:"#dc2626",fontSize:10,padding:"2px 8px",borderRadius:4,fontWeight:600}}>要対応</span>}
                  </div>
                  <p style={{margin:"0 0 10px",fontSize:12,color:"#666"}}>{t.msg}</p>
                  <button style={{background:t.urgent?"#dc2626":"#0066cc",border:"none",borderRadius:6,padding:"6px 14px",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>{t.action} →</button>
                </div>
              ))}
            </div>
          </div>

          {/* Recent notifications */}
          <div style={{background:"#fff",border:"1px solid #e0e0e0",borderRadius:12,padding:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
            <h2 style={{margin:"0 0 16px",fontSize:15,fontWeight:600,color:"#000"}}>最近の通知</h2>
            {[
              {name:"Nguyen Van An", msg:"在留期限30日前通知を送信", time:"2時間前", ok:true},
              {name:"Santos Maria", msg:"面談リマインダーを送信", time:"5時間前", ok:true},
              {name:"Kim Jiyeon", msg:"通知送信失敗", time:"1日前", ok:false},
            ].map((n,i)=>(
              <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 0",borderBottom:i<2?"1px solid #f0f0f0":"none"}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:n.ok?"#16a34a":"#dc2626",marginTop:5,flexShrink:0}}/>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:"#000"}}>{n.name}</div>
                  <div style={{fontSize:12,color:"#666"}}>{n.msg}</div>
                  <div style={{fontSize:11,color:"#999",marginTop:2}}>{n.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}