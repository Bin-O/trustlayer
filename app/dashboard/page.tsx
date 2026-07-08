'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppHeader from '@/components/AppHeader'

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

type Task = {
  id: string
  urgent: boolean
  name: string
  msg: string
  action: string
  workerId: string
}

type Notification = {
  name: string
  msg: string
  time: string
  ok: boolean
}

function getDays(expiry: string) {
  return Math.ceil((new Date(expiry).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
}

function getRelativeTime(dateStr: string) {
  const diff = new Date().getTime() - new Date(dateStr).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return '今日'
  if (days === 1) return '1日前'
  if (days < 7) return `${days}日前`
  return `${Math.floor(days / 7)}週間前`
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 11) return 'おはようございます'
  if (hour >= 11 && hour < 18) return 'こんにちは'
  return 'こんばんは'
}

export default function Dashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState([
    { icon: '👥', num: 0, label: '在籍者数', color: '#0066cc' },
    { icon: '⚠️', num: 0, label: '期限間近', color: '#dc2626' },
    { icon: '📋', num: 0, label: '期限切れ', color: '#d97706' },
    { icon: '✅', num: 0, label: '期限余裕', color: '#16a34a' },
  ])
  const [tasks, setTasks] = useState<Task[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])

  useEffect(() => {
    const supabase = createClient()
    const fetchData = async () => {
      const { data } = await supabase
        .from('foreign_workers')
        .select('*, residence_statuses(*)')
        .eq('status', 'active')
        .order('created_at', { ascending: false })

      if (!data) { setLoading(false); return }

      const total = data.length
      let expiringSoon = 0
      let expired = 0
      let safe = 0
      const derivedTasks: Task[] = []
      const derivedNotifications: Notification[] = []

      data.forEach(w => {
        const active = w.residence_statuses?.find((s: { is_active: boolean }) => s.is_active)
        if (!active) return

        const days = getDays(active.expiry_date)

        if (days < 0) {
          expired++
          derivedTasks.push({
            id: w.id,
            urgent: true,
            name: w.name_kanji || w.name_romaji,
            msg: `在留期限が${Math.abs(days)}日超過しています`,
            action: '更新申請を作成',
            workerId: w.id,
          })
          derivedNotifications.push({
            name: w.name_kanji || w.name_romaji,
            msg: `在留期限切れ通知を送信 (${active.expiry_date})`,
            time: getRelativeTime(active.expiry_date),
            ok: false,
          })
        } else if (days <= 60) {
          expiringSoon++
          derivedTasks.push({
            id: w.id,
            urgent: days <= 30,
            name: w.name_kanji || w.name_romaji,
            msg: `在留期限まで${days}日`,
            action: days <= 30 ? '申請書を作成' : '期限を確認',
            workerId: w.id,
          })
          derivedNotifications.push({
            name: w.name_kanji || w.name_romaji,
            msg: `在留期限${days}日前通知を送信`,
            time: getRelativeTime(new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString()),
            ok: true,
          })
        } else {
          safe++
        }
      })

      setStats([
        { icon: '👥', num: total, label: '在籍者数', color: '#0066cc' },
        { icon: '⚠️', num: expiringSoon, label: '期限間近', color: '#dc2626' },
        { icon: '📋', num: expired, label: '期限切れ', color: '#d97706' },
        { icon: '✅', num: safe, label: '期限余裕', color: '#16a34a' },
      ])
      setTasks(derivedTasks.slice(0, 5))
      setNotifications(derivedNotifications.slice(0, 3))
      setLoading(false)
    }
    fetchData()
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#f3f2ef', fontFamily: 'system-ui,sans-serif' }}>
      {/* Header */}
      <AppHeader currentPage="dashboard" />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
        {/* Welcome */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#000' }}>{getGreeting()} 👋</h1>
          <p style={{ margin: 0, fontSize: 14, color: '#666' }}>今日のタスクを確認しましょう</p>
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 28 }}>
          {stats.map((s, i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 12, padding: '20px 16px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
              {loading ? (
                <div style={{ fontSize: 28, fontWeight: 700, color: '#ccc' }}>--</div>
              ) : (
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.num}</div>
              )}
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Today's tasks */}
          <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 12, padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: '#000' }}>
              今日やること（{loading ? '--' : tasks.length}件）
            </h2>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 30, color: '#999', fontSize: 13 }}>読み込み中...</div>
            ) : tasks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: '#16a34a', fontSize: 13 }}>✅ 本日の対応タスクはありません</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {tasks.map(t => (
                  <div key={t.id} style={{ border: t.urgent ? '1px solid #fecaca' : '1px solid #e0e0e0', borderRadius: 8, padding: '12px', background: t.urgent ? '#fff5f5' : '#fafafa' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 13 }}>{t.urgent ? '🚨' : '📋'}</span>
                      <span style={{ fontWeight: 600, fontSize: 13, color: '#000' }}>{t.name}</span>
                      {t.urgent && <span style={{ background: '#fee2e2', color: '#dc2626', fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>要対応</span>}
                    </div>
                    <p style={{ margin: '0 0 10px', fontSize: 12, color: '#666' }}>{t.msg}</p>
                    <button
                      onClick={() => router.push(`/employees/${t.workerId}`)}
                      style={{ background: t.urgent ? '#dc2626' : '#0066cc', border: 'none', borderRadius: 6, padding: '6px 14px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      {t.action} →
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent notifications */}
          <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 12, padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: '#000' }}>最近の通知</h2>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 30, color: '#999', fontSize: 13 }}>読み込み中...</div>
            ) : notifications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: '#999', fontSize: 13 }}>通知はありません</div>
            ) : (
              notifications.map((n, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: i < notifications.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: n.ok ? '#16a34a' : '#dc2626', marginTop: 5, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#000' }}>{n.name}</div>
                    <div style={{ fontSize: 12, color: '#666' }}>{n.msg}</div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{n.time}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
