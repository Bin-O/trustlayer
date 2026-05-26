export default function Employees() {
  const employees = [
    {id:1, name:"Nguyen Van An", country:"🇻🇳", visa:"特定技能1号", expire:"2025-06-14", days:14, score:92, status:"在籍中", urgent:true},
    {id:2, name:"Santos Maria", visa:"特定技能1号", country:"🇵🇭", expire:"2025-07-20", days:42, score:65, status:"在籍中", urgent:false},
    {id:3, name:"Chen Xiaoming", country:"🇨🇳", visa:"技術・人文・国際", expire:"2025-08-01", days:78, score:88, status:"試用期間", urgent:false},
    {id:4, name:"Rahman Habibur", country:"🇧🇩", visa:"技術・人文・国際", expire:"2026-01-15", days:180, score:78, status:"在籍中", urgent:false},
    {id:5, name:"Park Jihoon", country:"🇰🇷", visa:"高度専門職", expire:"2026-12-10", days:365, score:95, status:"在籍中", urgent:false},
  ];
  return (
    <div style={{minHeight:"100vh",background:"#070d14",fontFamily:"system-ui,sans-serif",color:"#c8d8e8"}}>
      <div style={{background:"#0a131e",borderBottom:"1px solid #0e2035",padding:"0 24px",height:56,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:8,background:"linear-gradient(135deg,#00f5a0,#0088cc)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🌐</div>
          <span style={{fontWeight:800,fontSize:16,color:"#e8f4ff"}}>TrustLayer</span>
        </div>
        <div style={{display:"flex",gap:16,fontSize:13}}>
          <a href="/" style={{color:"#3a6080",textDecoration:"none"}}>ログイン</a>
          <a href="/dashboard" style={{color:"#3a6080",textDecoration:"none"}}>ダッシュボード</a>
          <a href="/employees" style={{color:"#00f5a0",textDecoration:"none",fontWeight:700}}>在留管理</a>
        </div>
      </div>
      <div style={{padding:"24px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div>
            <h1 style={{margin:"0 0 4px",fontSize:20,fontWeight:800,color:"#e8f4ff"}}>在留情報一覧</h1>
            <p style={{margin:0,fontSize:13,color:"#3a6080"}}>登録外国人材：{employees.length}名</p>
          </div>
          <button style={{background:"linear-gradient(135deg,#00f5a0,#0088cc)",border:"none",borderRadius:10,padding:"10px 20px",color:"#070d14",fontWeight:700,fontSize:13,cursor:"pointer"}}>＋ 新規登録</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {employees.map(e=>(
            <div key={e.id} style={{background:"#0a131e",border:e.urgent?"1px solid #f5505060":"1px solid #0e2035",borderRadius:12,padding:"16px 20px",display:"flex",alignItems:"center",gap:16}}>
              <div style={{fontSize:28}}>{e.country}</div>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <span style={{fontWeight:700,fontSize:15,color:"#e8f4ff"}}>{e.name}</span>
                  {e.urgent&&<span style={{background:"#f5505015",border:"1px solid #f5505040",color:"#f55050",fontSize:10,padding:"2px 8px",borderRadius:4,fontWeight:600}}>期限間近</span>}
                  <span style={{background:"#0e2035",color:"#7aaccc",fontSize:10,padding:"2px 8px",borderRadius:4}}>{e.status}</span>
                </div>
                <div style={{fontSize:12,color:"#3a6080"}}>{e.visa} ／ 期限：{e.expire}（残り{e.days}日）</div>
              </div>
              <div style={{textAlign:"center",minWidth:60}}>
                <div style={{fontSize:20,fontWeight:800,color:e.score>=85?"#00f5a0":e.score>=70?"#f5c400":"#f55050"}}>{e.score}</div>
                <div style={{fontSize:10,color:"#3a6080"}}>信頼スコア</div>
              </div>
              <button style={{background:"#0e2035",border:"1px solid #0e4060",borderRadius:8,padding:"8px 14px",color:"#7aaccc",fontSize:12,cursor:"pointer"}}>詳細 →</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
