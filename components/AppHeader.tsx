'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const ORG_ID = '11111111-1111-1111-1111-111111111111'

type Page = 'dashboard' | 'employees' | 'reports' | 'settings'

export default function AppHeader({ currentPage }: { currentPage: Page }) {
  const router = useRouter()
  const [orgName, setOrgName] = useState<string>('')

  useEffect(() => {
    createClient()
      .from('organizations')
      .select('name')
      .eq('id', ORG_ID)
      .single()
      .then(({ data }) => { if (data?.name) setOrgName(data.name) })
  }, [])

  const navBtn = (label: string, page: Page, path: string) => {
    const active = currentPage === page
    return (
      <button
        onClick={() => router.push(path)}
        style={{
          background: active ? '#eff6ff' : 'none',
          border: 'none',
          borderRadius: 6,
          padding: '7px 12px',
          color: active ? '#0066cc' : '#555',
          fontWeight: active ? 600 : 500,
          fontSize: 13,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <div style={{ background: '#fff', borderBottom: '1px solid #e0e0e0', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, position: 'sticky', top: 0, zIndex: 100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#0066cc,#004499)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🌐</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#000', lineHeight: 1.2 }}>TrustLayer</div>
          {orgName && <div style={{ fontSize: 11, color: '#888', lineHeight: 1.2 }}>{orgName}</div>}
        </div>
      </div>

      <nav style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {/* 共通機能（全在留資格が対象） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {navBtn('ダッシュボード', 'dashboard', '/dashboard')}
          {navBtn('従業員管理', 'employees', '/employees')}
          {navBtn('設定', 'settings', '/settings/organization')}
        </div>

        <div style={{ width: 1, height: 24, background: '#e5e7eb', flexShrink: 0 }} />

        {/* 特定技能専属機能のグループ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px 3px 10px', background: '#f8fafc', border: '1px solid #eef1f5', borderRadius: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>特定技能</span>
          {navBtn('定期届出', 'reports', '/reports/annual')}
        </div>

        <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#0066cc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 14, flexShrink: 0, marginLeft: 4 }}>田</div>
      </nav>
    </div>
  )
}
