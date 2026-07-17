'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import LogoMark from '@/components/LogoMark'

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
    <div style={{minHeight:'100vh',background:'#f9fafb',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'system-ui,sans-serif'}}>
      <div style={{background:'#fff',borderRadius:12,padding:'48px',width:'100%',maxWidth:420,border:'1px solid #e5e7eb',boxShadow:'0 4px 20px rgba(0,0,0,0.08)'}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{margin:'0 auto 16px',display:'flex',justifyContent:'center'}}><LogoMark size={48} /></div>
          <h1 style={{color:'#111827',fontSize:22,fontWeight:700,margin:0}}>TrustLayer</h1>
          <p style={{color:'#6b7280',fontSize:13,marginTop:4}}>外国人材プラットフォーム</p>
        </div>

        <div style={{marginBottom:16}}>
          <label style={{color:'#374151',fontSize:13,fontWeight:600,display:'block',marginBottom:6}}>メールアドレス</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="example@company.com"
            style={{width:'100%',padding:'11px 14px',background:'#fff',border:'1px solid #d1d5db',borderRadius:8,color:'#111827',fontSize:14,boxSizing:'border-box',outline:'none'}}
          />
        </div>

        <div style={{marginBottom:24}}>
          <label style={{color:'#374151',fontSize:13,fontWeight:600,display:'block',marginBottom:6}}>パスワード</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{width:'100%',padding:'11px 14px',background:'#fff',border:'1px solid #d1d5db',borderRadius:8,color:'#111827',fontSize:14,boxSizing:'border-box',outline:'none'}}
          />
        </div>

        {error && <p style={{color:'#dc2626',fontSize:13,marginBottom:16}}>{error}</p>}

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{width:'100%',padding:'13px',background:'#2563eb',border:'none',borderRadius:8,color:'#fff',fontSize:15,fontWeight:700,cursor:loading?'not-allowed':'pointer',opacity:loading?0.7:1}}
        >
          {loading ? 'ログイン中...' : 'ログイン'}
        </button>

        <p style={{color:'#9ca3af',fontSize:12,textAlign:'center',marginTop:24}}>
          LINEログイン機能は近日公開予定
        </p>
      </div>
    </div>
  )
}