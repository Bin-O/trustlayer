'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LogOut, Settings } from 'lucide-react'
import LogoMark from '@/components/LogoMark'

const ORG_ID = '11111111-1111-1111-1111-111111111111'

type Page = 'dashboard' | 'employees' | 'reports' | 'settings'

export default function AppHeader({ currentPage }: { currentPage: Page }) {
  const router = useRouter()
  const pathname = usePathname()
  const [orgName, setOrgName] = useState<string>('')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    createClient()
      .from('organizations')
      .select('name')
      .eq('id', ORG_ID)
      .single()
      .then(({ data }) => { if (data?.name) setOrgName(data.name) })
  }, [])

  const navBtn = (label: string, page: Page, path: string) => {
    // reports は複数ページを持つため、同一 currentPage 内では pathname で active を分ける
    const active = currentPage === page && (currentPage !== 'reports' || pathname === path)
    return (
      <button
        onClick={() => router.push(path)}
        style={{
          background: active ? '#eff6ff' : 'none',
          border: 'none',
          borderRadius: 6,
          padding: '7px 12px',
          color: active ? '#2563eb' : '#6b7280',
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
    <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, position: 'sticky', top: 0, zIndex: 100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <LogoMark size={34} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#000', lineHeight: 1.2 }}>TrustLayer</div>
          {orgName && <div style={{ fontSize: 11, color: '#888', lineHeight: 1.2 }}>{orgName}</div>}
        </div>
      </div>

      <nav style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {/* 共通機能（全在留資格が対象） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {navBtn('ダッシュボード', 'dashboard', '/dashboard')}
          {navBtn('従業員管理', 'employees', '/employees')}
        </div>

        {/* 特定技能専属機能（ラベルバッジで表現） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#475569', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 7px', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>特定技能</span>
          {navBtn('定期届出', 'reports', '/reports/annual')}
          {navBtn('支援業務', 'reports', '/reports/support-matrix')}
        </div>

        {/* アバターメニュー（設定） */}
        <div style={{ position: 'relative', marginLeft: 6 }}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label="アカウントメニュー"
            style={{
              width: 34, height: 34, borderRadius: '50%', background: '#2563eb',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, color: '#fff', fontSize: 14, flexShrink: 0,
              border: currentPage === 'settings' ? '2px solid #93c5fd' : 'none',
              cursor: 'pointer', padding: 0,
            }}
          >
            田
          </button>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 110 }} />
              <div style={{ position: 'absolute', right: 0, top: 42, zIndex: 120, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.10)', minWidth: 180, padding: 6 }}>
                {orgName && (
                  <div style={{ padding: '8px 10px 6px', fontSize: 11, color: '#9ca3af', borderBottom: '1px solid #f3f4f6', marginBottom: 4 }}>{orgName}</div>
                )}
                <button
                  onClick={() => { setMenuOpen(false); router.push('/settings/organization') }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    background: currentPage === 'settings' ? '#eff6ff' : 'none',
                    border: 'none', borderRadius: 6, padding: '8px 10px',
                    fontSize: 13, fontWeight: currentPage === 'settings' ? 600 : 500,
                    color: currentPage === 'settings' ? '#2563eb' : '#374151',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <Settings size={15} strokeWidth={2} />
                  設定
                </button>
                <div style={{ height: 1, background: '#f3f4f6', margin: '4px 0' }} />
                <button
                  onClick={async () => {
                    setMenuOpen(false)
                    await createClient().auth.signOut()
                    // フルリロードでクライアント側の状態とルーターキャッシュを破棄する
                    window.location.href = '/'
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    background: 'none', border: 'none', borderRadius: 6, padding: '8px 10px',
                    fontSize: 13, fontWeight: 500, color: '#dc2626',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <LogOut size={15} strokeWidth={2} />
                  ログアウト
                </button>
              </div>
            </>
          )}
        </div>
      </nav>
    </div>
  )
}
