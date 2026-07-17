'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppHeader from '@/components/AppHeader'
import EmploymentConditionsWizard from '@/components/EmploymentConditionsWizard'
import { getFlag } from '@/lib/countries'
import { calculateTrustScore, BRANCH_META, type TrustBranch } from '@/lib/trustScore'

type Worker = {
  id: string
  name_kanji: string | null
  name_romaji: string
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
  const [includeRetired, setIncludeRetired] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmModal, setConfirmModal] = useState(false)
  const [bulkWizard, setBulkWizard] = useState(false)
  const [bulkDone, setBulkDone] = useState<number | null>(null)
  // 信頼スコアの表示分岐（緑/橙/灰）。一覧では各行ぶんを非同期算出して格納する
  const [branches, setBranches] = useState<Record<string, TrustBranch>>({})
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

  // 一覧の各従業員について信頼スコアの分岐を算出（詳細ページと同一ロジックを共有）
  useEffect(() => {
    if (workers.length === 0) return
    let cancelled = false
    const run = async () => {
      const entries = await Promise.all(
        workers.map(async w => {
          try {
            const result = await calculateTrustScore(w.id)
            return [w.id, result.branch] as const
          } catch {
            return null
          }
        })
      )
      if (cancelled) return
      setBranches(Object.fromEntries(entries.filter((e): e is readonly [string, TrustBranch] => e !== null)))
    }
    run()
    return () => { cancelled = true }
  }, [workers])

  const getDays = (expiry: string) => {
    return Math.ceil((new Date(expiry).getTime() - new Date().getTime()) / (1000*60*60*24))
  }

  // 在留期限の残日数: ≤30日=赤(回復不能の切迫) / 31〜60日=橙 / それ以外=灰(期日前)
  // 緑は「完了・検証済」専用のため残日数には使わない(docs/product-direction.md 原則3)
  const getDaysBadge = (days: number) => {
    if (days <= 30) return {bg:'#fee2e2',color:'#dc2626',text:`残り${days}日`}
    if (days <= 60) return {bg:'#fef3c7',color:'#d97706',text:`残り${days}日`}
    return {bg:'#f3f4f6',color:'#6b7280',text:`残り${days}日`}
  }

  const activeWorkers = workers.filter(w => w.status === 'active')
  const retiredCount = workers.length - activeWorkers.length
  const displayWorkers = includeRetired ? workers : activeWorkers

  const allSelected = displayWorkers.length > 0 && displayWorkers.every(w => selected.has(w.id))
  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(displayWorkers.map(w => w.id)))
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
      <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui,sans-serif' }}>
        <AppHeader currentPage="employees" />
        <div style={{ maxWidth: 780, margin: '0 auto', padding: '28px 24px' }}>
          <button
            onClick={() => setBulkWizard(false)}
            style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 14, cursor: 'pointer', marginBottom: 20, padding: 0 }}>
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
    <div style={{minHeight:'100vh',background:'#f9fafb',fontFamily:'system-ui,sans-serif'}}>
      <AppHeader currentPage="employees" />

      <div style={{maxWidth:900,margin:'0 auto',padding:'32px 24px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
          <div>
            <h1 style={{margin:'0 0 4px',fontSize:21,fontWeight:700,color:'#111827'}}>従業員管理</h1>
            <p style={{margin:0,fontSize:14,color:'#6b7280'}}>
              在職：{activeWorkers.length}名{retiredCount > 0 && `　退職：${retiredCount}名`}
            </p>
          </div>
          <button onClick={()=>router.push('/employees/new')} style={{background:'#2563eb',border:'none',borderRadius:6,padding:'10px 20px',color:'#fff',fontWeight:600,fontSize:13,cursor:'pointer'}}>＋ 新規登録</button>
        </div>

        {bulkDone !== null && (
          <div style={{background:'#dcfce7',border:'1px solid #86efac',borderRadius:8,padding:'12px 18px',marginBottom:16,fontSize:14,color:'#15803d',fontWeight:600}}>
            ✓ {bulkDone}名分の雇用条件を保存しました
          </div>
        )}

        {loading ? (
          <div style={{textAlign:'center',padding:60,color:'#6b7280'}}>読み込み中...</div>
        ) : displayWorkers.length === 0 ? (
          <div style={{textAlign:'center',padding:60,color:'#6b7280'}}>データがありません</div>
        ) : (
          <>
            {/* ヘッダー行（全選択） */}
            <div style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:12,padding:'12px 20px',marginBottom:8,display:'flex',alignItems:'center',gap:12,boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                style={{width:16,height:16,cursor:'pointer',accentColor:'#2563eb'}}
              />
              <span style={{fontSize:13,fontWeight:600,color:'#6b7280'}}>全選択</span>
              <label style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6,fontSize:13,color:'#6b7280',cursor:'pointer'}}>
                <input
                  type="checkbox"
                  checked={includeRetired}
                  onChange={e => setIncludeRetired(e.target.checked)}
                  style={{width:15,height:15,cursor:'pointer',accentColor:'#2563eb'}}
                />
                退職者を含む{retiredCount > 0 && `（${retiredCount}名）`}
              </label>
            </div>

            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {displayWorkers.map(w => {
                const active = w.residence_statuses?.find(s => s.is_active)
                const retired = w.status === 'retired'
                const days = active ? getDays(active.expiry_date) : 999
                const badge = getDaysBadge(days)
                const urgent = !retired && days <= 30
                const isChecked = selected.has(w.id)
                const branch = branches[w.id]
                return (
                  <div key={w.id} style={{background:'#fff',border:isChecked?'1px solid #2563eb':urgent?'1px solid #fecaca':'1px solid #e5e7eb',borderRadius:12,padding:'16px 20px',display:'flex',alignItems:'center',gap:16,boxShadow: isChecked ? '0 0 0 2px rgba(37,99,235,0.15)' : '0 1px 3px rgba(0,0,0,0.06)',transition:'border-color 0.15s'}}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleOne(w.id)}
                      onClick={e => e.stopPropagation()}
                      style={{width:16,height:16,cursor:'pointer',accentColor:'#2563eb',flexShrink:0}}
                    />
                    <div style={{fontSize:28}}>{getFlag(w.nationality)}</div>
                    <div style={{flex:1}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                        <span style={{fontWeight:600,fontSize:14,color:'#111827'}}>{w.name_kanji || w.name_romaji}</span>
                        {urgent && <span style={{background:'#fee2e2',color:'#dc2626',fontSize:11,padding:'2px 8px',borderRadius:4,fontWeight:600}}>期限間近</span>}
                        {retired ? (
                          <span style={{background:'#475569',color:'#fff',fontSize:11,padding:'2px 8px',borderRadius:4,fontWeight:600}}>退職</span>
                        ) : (
                          <span style={{background:'#f3f4f6',color:'#6b7280',fontSize:11,padding:'2px 8px',borderRadius:4}}>{w.status === 'active' ? '在籍中' : w.status}</span>
                        )}
                        {!retired && branch && (
                          <span title="信頼スコアの状態" style={{background:BRANCH_META[branch].bg,color:BRANCH_META[branch].color,border:`1px solid ${BRANCH_META[branch].border}`,fontSize:11,padding:'2px 8px',borderRadius:4,fontWeight:600}}>{BRANCH_META[branch].label}</span>
                        )}
                      </div>
                      <div style={{fontSize:13,color:'#6b7280'}}>{active?.status_type || '未登録'}</div>
                    </div>
                    {active && (
                      <div style={{textAlign:'center'}}>
                        <span style={{background:badge.bg,color:badge.color,fontSize:12,fontWeight:600,padding:'4px 10px',borderRadius:6}}>{badge.text}</span>
                        <div style={{fontSize:11,color:'#9ca3af',marginTop:2}}>期限：{active.expiry_date}</div>
                      </div>
                    )}
                    <button onClick={()=>router.push(`/employees/${w.id}`)} style={{background:'#fff',border:'1px solid #2563eb',borderRadius:6,padding:'8px 16px',color:'#2563eb',fontSize:13,fontWeight:600,cursor:'pointer'}}>詳細 →</button>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* 一括適用フローティングバー */}
      {selected.size > 0 && (
        <div style={{position:'fixed',bottom:0,left:0,right:0,background:'#1a1a2e',borderTop:'2px solid #2563eb',padding:'14px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',zIndex:100,boxShadow:'0 -4px 20px rgba(0,0,0,0.25)'}}>
          <div style={{color:'#fff',fontSize:14,fontWeight:600}}>
            {selected.size}名を選択中
            <span style={{color:'#94a3b8',fontWeight:400,marginLeft:8,fontSize:13}}>
              {selectedWorkers.map(w => w.name_kanji || w.name_romaji).join('、')}
            </span>
          </div>
          <div style={{display:'flex',gap:10}}>
            <button onClick={() => setSelected(new Set())} style={{padding:'9px 18px',borderRadius:6,border:'1px solid #475569',background:'transparent',color:'#cbd5e1',fontSize:13,cursor:'pointer'}}>
              選択解除
            </button>
            <button onClick={() => setConfirmModal(true)} style={{padding:'9px 20px',borderRadius:6,border:'none',background:'#2563eb',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>
              選択した{selected.size}名に同じ条件を適用
            </button>
          </div>
        </div>
      )}

      {/* 確認モーダル */}
      {confirmModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'#fff',borderRadius:12,padding:'28px 32px',width:480,maxWidth:'100%',boxShadow:'0 8px 32px rgba(0,0,0,0.18)'}}>
            <h3 style={{margin:'0 0 12px',fontSize:16,fontWeight:700,color:'#111'}}>一括適用の確認</h3>
            <p style={{margin:'0 0 16px',fontSize:13,color:'#6b7280',lineHeight:1.7}}>
              以下の従業員に同じ雇用条件を一括で適用します。<br />
              既存の雇用条件は上書きされます。
            </p>
            <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8,padding:'10px 14px',marginBottom:20}}>
              {selectedWorkers.map(w => (
                <div key={w.id} style={{fontSize:13,color:'#374151',padding:'3px 0',borderBottom:'1px solid #f1f5f9'}}>
                  {w.name_kanji || w.name_romaji}
                  <span style={{color:'#94a3b8',marginLeft:8,fontSize:12}}>{w.residence_statuses?.find(s => s.is_active)?.status_type || '—'}</span>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={() => setConfirmModal(false)} style={{padding:'10px 22px',borderRadius:8,border:'1px solid #d1d5db',background:'#fff',color:'#6b7280',fontSize:14,cursor:'pointer'}}>
                キャンセル
              </button>
              <button onClick={() => { setConfirmModal(false); setBulkWizard(true) }} style={{padding:'10px 22px',borderRadius:8,border:'none',background:'#2563eb',color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer'}}>
                適用する →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
