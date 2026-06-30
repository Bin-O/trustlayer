'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppHeader from '@/components/AppHeader'

type Worker = {
  id: string
  name_kanji: string
  nationality: string
  status: string
  residence_statuses: {
    status_type: string
    expiry_date: string
    is_active: boolean
  }[]
}

export default function Employees() {
  const router = useRouter()
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase
        .from('foreign_workers')
        .select('*, residence_statuses(*)')
        .order('created_at', { ascending: false })
      if (data) setWorkers(data)
      setLoading(false)
    }
    fetchData()
  }, [])

  const getFlag = (nationality: string) => {
    const flags: {[key: string]: string} = {
      'ベトナム':'🇻🇳','フィリピン':'🇵🇭','中国':'🇨🇳','バングラデシュ':'🇧🇩','韓国':'🇰🇷'
    }
    return flags[nationality] || '🌏'
  }

  const getDays = (expiry: string) => {
    return Math.ceil((new Date(expiry).getTime() - new Date().getTime()) / (1000*60*60*24))
  }

  const getDaysBadge = (days: number) => {
    if (days <= 30) return {bg:'#fee2e2',color:'#dc2626',text:`残り${days}日`}
    if (days <= 60) return {bg:'#fef3c7',color:'#d97706',text:`残り${days}日`}
    return {bg:'#dcfce7',color:'#16a34a',text:`残り${days}日`}
  }

  return (
    <div style={{minHeight:'100vh',background:'#f3f2ef',fontFamily:'system-ui,sans-serif'}}>
      <AppHeader currentPage="employees" />

      <div style={{maxWidth:900,margin:'0 auto',padding:'32px 24px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
          <div>
            <h1 style={{margin:'0 0 4px',fontSize:22,fontWeight:700,color:'#000'}}>在留情報一覧</h1>
            <p style={{margin:0,fontSize:14,color:'#666'}}>登録外国人材：{workers.length}名</p>
          </div>
          <button onClick={()=>router.push('/employees/new')} style={{background:'#0066cc',border:'none',borderRadius:6,padding:'10px 20px',color:'#fff',fontWeight:600,fontSize:13,cursor:'pointer'}}>＋ 新規登録</button>
        </div>

        {loading ? (
          <div style={{textAlign:'center',padding:60,color:'#666'}}>読み込み中...</div>
        ) : workers.length === 0 ? (
          <div style={{textAlign:'center',padding:60,color:'#666'}}>データがありません</div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {workers.map(w => {
              const active = w.residence_statuses?.find(s => s.is_active)
              const days = active ? getDays(active.expiry_date) : 999
              const badge = getDaysBadge(days)
              const urgent = days <= 30
              return (
                <div key={w.id} style={{background:'#fff',border:urgent?'1px solid #fecaca':'1px solid #e0e0e0',borderRadius:12,padding:'16px 20px',display:'flex',alignItems:'center',gap:16,boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
                  <div style={{fontSize:28}}>{getFlag(w.nationality)}</div>
                  <div style={{flex:1}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                      <span style={{fontWeight:600,fontSize:15,color:'#000'}}>{w.name_kanji}</span>
                      {urgent && <span style={{background:'#fee2e2',color:'#dc2626',fontSize:11,padding:'2px 8px',borderRadius:4,fontWeight:600}}>期限間近</span>}
                      <span style={{background:'#f0f0f0',color:'#666',fontSize:11,padding:'2px 8px',borderRadius:4}}>{w.status === 'active' ? '在籍中' : w.status}</span>
                    </div>
                    <div style={{fontSize:13,color:'#666'}}>{active?.status_type || '未登録'}</div>
                  </div>
                  {active && (
                    <div style={{textAlign:'center'}}>
                      <span style={{background:badge.bg,color:badge.color,fontSize:12,fontWeight:600,padding:'4px 10px',borderRadius:6}}>{badge.text}</span>
                      <div style={{fontSize:11,color:'#999',marginTop:2}}>期限：{active.expiry_date}</div>
                    </div>
                  )}
                  <button onClick={()=>router.push(`/employees/${w.id}`)} style={{background:'#fff',border:'1px solid #0066cc',borderRadius:6,padding:'8px 16px',color:'#0066cc',fontSize:13,fontWeight:600,cursor:'pointer'}}>詳細 →</button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}