export default function EmployeeDetail() {
  const employee = {
    name:"Nguyen Van An", country:"🇻🇳", visa:"特定技能1号",
    expire:"2025-06-14", days:14, score:92, status:"在籍中",
    job:"製造エンジニア", company:"株式会社サンプル", joined:"2023-04-01",
    support:true, lastMeeting:"2025-04-10",
    history:[
      {date:"2025-04-10", type:"支援面談", note:"生活環境に問題なし"},
      {date:"2025-02-15", type:"在留更新", note:"申請書類提出済み"},
      {date:"2024-10-01", type:"定期面談", note:"業務に慣れてきた"},
    ]
  };
  return (
    <div style={{minHeight:"100vh",background:"#070d14",fontFamily:"system-ui,sans-serif",color:"#c8d8e8"}}>
      <div style={{background:"#0a131e",borderBottom:"1px solid #0e2035",padding:"0 24px",height:56,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:8,background:"linear-gradient(135deg,#00f5a0,#0088cc)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🌐</div>
          <span style={{fontWeight:800,fontSize:16,color:"#e8f4ff"}}>TrustLayer</span>
        </div>
        <a href="/employees" style={{color:"#3a6080",fontSize:13,textDecoration:"none"}}>← 一覧に戻る</a>
      </div>
      <div style={{padding:"24px",maxWidth:700,margin:"0 auto"}}>
        <div style={{background:"#0a131e",border:"1px solid #f5505060",borderRadius:16,padding:"24px",marginBottom:16,display:"flex",alignItems:"center",gap:20}}>
          <div style={{fontSize:56}}>{employee.country}</div>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <h1 style={{margin:0,fontSize:22,fontWeight:800,color:"#e8f4ff"}}>{employee.name}</h1>
              <span style={{background:"#f5505015",border:"1px solid #f5505040",color:"#f55050",fontSize:11,padding:"2px 10px",borderRadius:4,fontWeight:600}}>期限間近</span>
            </div>
            <div style={{fontSize:13,color:"#3a6080",marginBottom:4}}>{employee.visa} ／ {employee.job}</div>
            <div style={{fontSize:13,color:"#f55050",fontWeight:600}}>在留期限：{employee.expire}（残り{employee.days}日）</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:40,fontWeight:800,color:"#00f5a0"}}>{employee.score}</div>
            <div style={{fontSize:11,color:"#3a6080"}}>信頼スコア</div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
          {[
            {label:"在留資格",value:employee.visa},
            {label:"ステータス",value:employee.status},
            {label:"入社日",value:employee.joined},
            {label:"最終面談",value:employee.lastMeeting},
          ].map((item,i)=>(
            <div key={i} style={{background:"#0a131e",border:"1px solid #0e2035",borderRadius:12,padding:"16px"}}>
              <div style={{fontSize:11,color:"#3a6080",marginBottom:6}}>{item.label}</div>
              <div style={{fontSize:14,fontWeight:600,color:"#e8f4ff"}}>{item.value}</div>
            </div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
          <button style={{background:"linear-gradient(135deg,#00f5a0,#0088cc)",border:"none",borderRadius:10,padding:"14px",color:"#070d14",fontWeight:800,fontSize:14,cursor:"pointer"}}>📄 申請書を作成</button>
          <button style={{background:"#0a131e",border:"1px solid #0e4060",borderRadius:10,padding:"14px",color:"#7aaccc",fontWeight:700,fontSize:14,cursor:"pointer"}}>📝 面談を記録</button>
        </div>
        <div style={{background:"#0a131e",border:"1px solid #0e2035",borderRadius:12,padding:"20px"}}>
          <h2 style={{margin:"0 0 16px",fontSize:14,fontWeight:700,color:"#7aaccc"}}>対応履歴</h2>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {employee.history.map((h,i)=>(
              <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:"#00f5a0",marginTop:5,flexShrink:0}}></div>
                <div>
                  <div style={{fontSize:12,color:"#3a6080",marginBottom:2}}>{h.date} ／ {h.type}</div>
                  <div style={{fontSize:13,color:"#c8d8e8"}}>{h.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
