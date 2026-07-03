'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppHeader from '@/components/AppHeader'
import EmploymentConditionsWizard from '@/components/EmploymentConditionsWizard'

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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmModal, setConfirmModal] = useState(false)
  const [bulkWizard, setBulkWizard] = useState(false)
  const [bulkDone, setBulkDone] = useState<number | null>(null)
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

  const allSelected = workers.length > 0 && workers.every(w => selected.has(w.id))
  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(workers.map(w => w.id)))
    }
  }
  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectedWorkers = workers.filter(w => selected.has(w.id))

  const handleBulkSaved = (count: number) => {
    setBulkWizard(false)
    setBulkDone(count)
    setSelected(new Set())
    setTimeout(() => setBulkDone(null), 4000)
  }

  if (bulkWizard) {
    return (
      <div style={{ minHeight: '100vh', background: '#f3f2ef', fontFamily: 'system-ui,sans-serif' }}>
        <AppHeader currentPage="employees" />
        <div style={{ maxWidth: 780, margin: '0 auto', padding: '28px 24px' }}>
          <button
            onClick={() => setBulkWizard(false)}
            style={{ background: 'none', border: 'none', color: '#0066cc', fontSize: 14, cursor: 'pointer', marginBottom: 20, padding: 0 }}>
            ← 従業員一覧に戻る
          </button>
          <EmploymentConditionsWizard
            workerIds={[...selected]}
            showTodokeNotify={false}
            onSaved={handleBulkSaved}
            onCancel={() => setBulkWizard(false)}
          />
        </div>
      </div>
    )
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

        {bulkDone !== null && (
          <div style={{background:'#dcfce7',border:'1px solid #86efac',borderRadius:8,padding:'12px 18px',marginBottom:16,fontSize:14,color:'#15803d',fontWeight:600}}>
            ✓ {bulkDone}名分の雇用条件を保存しました
          </div>
        )}

        {loading ? (
          <div style={{textAlign:'center',padding:60,color:'#666'}}>読み込み中...</div>
        ) : workers.length === 0 ? (
          <div style={{textAlign:'center',padding:60,color:'#666'}}>データがありません</div>
        ) : (
          <>
            {/* ヘッダー行（全選択） */}
            <div style={{background:'#fff',border:'1px solid #e0e0e0',borderRadius:12,padding:'12px 20px',marginBottom:8,display:'flex',alignItems:'center',gap:12,boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                style={{width:16,height:16,cursor:'pointer',accentColor:'#0066cc'}}
              />
              <span style={{fontSize:13,fontWeight:600,color:'#555'}}>全選択</span>
            </div>

            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {workers.map(w => {
                const active = w.residence_statuses?.find(s => s.is_active)
                const days = active ? getDays(active.expiry_date) : 999
                const badge = getDaysBadge(days)
                const urgent = days <= 30
                const isChecked = selected.has(w.id)
                return (
                  <div key={w.id} style={{background:'#fff',border:isChecked?'1px solid #0066cc':urgent?'1px solid #fecaca':'1px solid #e0e0e0',borderRadius:12,padding:'16px 20px',display:'flex',alignItems:'center',gap:16,boxShadow: isChecked ? '0 0 0 2px rgba(0,102,204,0.15)' : '0 1px 3px rgba(0,0,0,0.06)',transition:'border-color 0.15s'}}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleOne(w.id)}
                      onClick={e => e.stopPropagation()}
                      style={{width:16,height:16,cursor:'pointer',accentColor:'#0066cc',flexShrink:0}}
                    />
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
          </>
        )}
      </div>

      {/* 一括適用フローティングバー */}
      {selected.size > 0 && (
        <div style={{position:'fixed',bottom:0,left:0,right:0,background:'#1a1a2e',borderTop:'2px solid #0066cc',padding:'14px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',zIndex:100,boxShadow:'0 -4px 20px rgba(0,0,0,0.25)'}}>
          <div style={{color:'#fff',fontSize:14,fontWeight:600}}>
            {selected.size}名を選択中
            <span style={{color:'#94a3b8',fontWeight:400,marginLeft:8,fontSize:13}}>
              {selectedWorkers.map(w => w.name_kanji).join('、')}
            </span>
          </div>
          <div style={{display:'flex',gap:10}}>
            <button onClick={() => setSelected(new Set())} style={{padding:'9px 18px',borderRadius:6,border:'1px solid #475569',background:'transparent',color:'#cbd5e1',fontSize:13,cursor:'pointer'}}>
              選択解除
            </button>
            <button onClick={() => setConfirmModal(true)} style={{padding:'9px 20px',borderRadius:6,border:'none',background:'#0066cc',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>
              選択した{selected.size}名に同じ条件を適用
            </button>
          </div>
        </div>
      )}

      {/* 確認モーダル */}
      {confirmModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'#fff',borderRadius:14,padding:'28px 32px',width:480,maxWidth:'100%',boxShadow:'0 8px 40px rgba(0,0,0,0.18)'}}>
            <h3 style={{margin:'0 0 12px',fontSize:17,fontWeight:700,color:'#111'}}>一括適用の確認</h3>
            <p style={{margin:'0 0 16px',fontSize:13,color:'#555',lineHeight:1.7}}>
              以下の従業員に同じ雇用条件を一括で適用します。<br />
              既存の雇用条件は上書きされます。
            </p>
            <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8,padding:'10px 14px',marginBottom:20}}>
              {selectedWorkers.map(w => (
                <div key={w.id} style={{fontSize:13,color:'#374151',padding:'3px 0',borderBottom:'1px solid #f1f5f9'}}>
                  {w.name_kanji}
                  <span style={{color:'#94a3b8',marginLeft:8,fontSize:12}}>{w.residence_statuses?.find(s => s.is_active)?.status_type || '—'}</span>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={() => setConfirmModal(false)} style={{padding:'10px 22px',borderRadius:8,border:'1px solid #d0d0d0',background:'#fff',color:'#555',fontSize:14,cursor:'pointer'}}>
                キャンセル
              </button>
              <button onClick={() => { setConfirmModal(false); setBulkWizard(true) }} style={{padding:'10px 22px',borderRadius:8,border:'none',background:'#0066cc',color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer'}}>
                適用する →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
