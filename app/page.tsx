'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('メールアドレスまたはパスワードが正しくありません')
    } else {
      router.push('/dashboard')
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0a0f1e',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{
        backgroundColor: '#111827',
        borderRadius: '16px',
        padding: '48px',
        width: '100%',
        maxWidth: '420px',
        border: '1px solid #1f2937'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '64px', height: '64px',
            background: 'linear-gradient(135deg, #00d4aa, #0099ff)',
            borderRadius: '16px',
            margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '28px'
          }}>🌐</div>
          <h1 style={{ color: 'white', fontSize: '24px', fontWeight: 'bold', margin: 0 }}>TrustLayer</h1>
          <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>外国人材プラットフォーム</p>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ color: '#9ca3af', fontSize: '13px', display: 'block', marginBottom: '6px' }}>メールアドレス</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="example@company.com"
            style={{
              width: '100%', padding: '12px 16px',
              backgroundColor: '#1f2937', border: '1px solid #374151',
              borderRadius: '8px', color: 'white', fontSize: '14px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={{ color: '#9ca3af', fontSize: '13px', display: 'block', marginBottom: '6px' }}>パスワード</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{
              width: '100%', padding: '12px 16px',
              backgroundColor: '#1f2937', border: '1px solid #374151',
              borderRadius: '8px', color: 'white', fontSize: '14px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {error && <p style={{ color: '#ef4444', fontSize: '13px', marginBottom: '16px' }}>{error}</p>}

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: '100%', padding: '14px',
            background: 'linear-gradient(135deg, #00d4aa, #0099ff)',
            border: 'none', borderRadius: '8px',
            color: 'white', fontSize: '16px', fontWeight: 'bold',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? 'ログイン中...' : 'ログイン'}
        </button>

        <p style={{ color: '#4b5563', fontSize: '12px', textAlign: 'center', marginTop: '24px' }}>
          LINEログイン機能は近日公開予定
        </p>
      </div>
    </div>
  )
}