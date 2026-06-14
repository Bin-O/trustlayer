'use client'
import { useRouter } from 'next/navigation'

export default function Employees() {
  const router = useRouter()
  const employees = [
    {id:1, name:"Nguyen Van An", country:"🇻🇳", visa:"特定技能1号", expire:"2025-06-14", days:14, score:92, status:"在籍中", urgent:true},
    {id:2, name:"Santos Maria", country:"🇵🇭", visa:"特定技能1号", expire:"2025-07-20", days:42, score:65, status:"在籍中", urgent:false},
    {id:3, name:"Chen Xiaoming", country:"🇨🇳", visa:"技術・人文・国際", expire:"2025-08-01", days:78, score:88, status:"試用期間", urgent:false},
    {id:4, name:"Rahman Habibur", country:"🇧🇩", visa:"技術・人文・国際", expire:"2026-01-15", days:180, score:78, status:"在籍中", urgent:false},
    {id:5, name:"Park Jihoon", country:"🇰🇷", visa:"高度専門職", expire:"2026-12-10", days:365, score:95, status:"在籍中", urgent:false},
  ]

  const getDaysBadge = (days: number) => {
    if (days <= 30) return {bg:"#fee2e2", color:"#dc2626", text:`残り${days}日`}
    if (days <= 60) return {bg:"#fef3c7", color:"#d97706", text:`残り${days}日`}
    return {bg:"#dcfce7", color:"#16a34a", text:`残り${days}日`}
  }

  const getScoreColor = (score: number) => {
    if (score >= 85) return "#16a34a"
    if (score >= 70) return "#d97706"
    return "#dc2626"
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
        {/* Page title */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <div>
            <h1 style={{margin:"0 0 4px",fontSize:22,fontWeight:700,color:"#000"}}>在留情報一覧</h1>
            <p style={{margin:0,fontSize:14,color:"#666"}}>登録外国人材：{employees.length}名</p>
          </div>
          <button style={{background:"#0066cc",border:"none",borderRadius:6,padding:"10px 20px",color:"#fff",fontWeight:600,fontSize:13,cursor:"pointer"}}>＋ 新規登録</button>
        </div>

        {/* Employee list */}
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {employees.map(e => {
            const badge = getDaysBadge(e.days)
            return (
              <div key={e.id} style={{background:"#fff",border:e.urgent?"1px solid #fecaca":"1px solid #e0e0e0",borderRadius:12,padding:"16px 20px",display:"flex",alignItems:"center",gap:16,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
                <div style={{fontSize:28}}>{e.country}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <span style={{fontWeight:600,fontSize:15,color:"#000"}}>{e.name}</span>
                    {e.urgent && <span style={{background:"#fee2e2",color:"#dc2626",fontSize:11,padding:"2px 8px",borderRadius:4,fontWeight:600}}>期限間近</span>}
                    <span style={{background:"#f0f0f0",color:"#666",fontSize:11,padding:"2px 8px",borderRadius:4}}>{e.status}</span>
                  </div>
                  <div style={{fontSize:13,color:"#666"}}>{e.visa}</div>
                </div>
                <div style={{textAlign:"center"}}>
                  <span style={{background:badge.bg,color:badge.color,fontSize:12,fontWeight:600,padding:"4px 10px",borderRadius:6}}>{badge.text}</span>
                  <div style={{fontSize:11,color:"#999",marginTop:2}}>期限：{e.expire}</div>
                </div>
                <div style={{textAlign:"center",minWidth:60}}>
                  <div style={{fontSize:22,fontWeight:700,color:getScoreColor(e.score)}}>{e.score}</div>
                  <div style={{fontSize:11,color:"#999"}}>信頼スコア</div>
                </div>
                <button
                  onClick={()=>router.push(`/employees/${e.id}`)}
                  style={{background:"#fff",border:"1px solid #0066cc",borderRadius:6,padding:"8px 16px",color:"#0066cc",fontSize:13,fontWeight:600,cursor:"pointer"}}
                >詳細 →</button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}