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

  const navBtn = (label: string, page: Page, path: string) => (
    <button
      onClick={() => router.push(path)}
      style={{
        background: 'none',
        border: 'none',
        color: currentPage === page ? '#0066cc' : '#666',
        fontWeight: currentPage === page ? 600 : 400,
        fontSize: 13,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ background: '#fff', borderBottom: '1px solid #e0e0e0', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#0066cc,#004499)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🌐</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#000', lineHeight: 1.2 }}>TrustLayer</div>
          {orgName && <div style={{ fontSize: 11, color: '#888', lineHeight: 1.2 }}>{orgName}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {navBtn('ダッシュボード', 'dashboard', '/dashboard')}
        {navBtn('在留管理', 'employees', '/employees')}
        {navBtn('定期届出', 'reports', '/reports/annual')}
        {navBtn('設定', 'settings', '/settings/organization')}
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#0066cc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 14 }}>田</div>
      </div>
    </div>
  )
}
