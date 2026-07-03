'use client'
import { useParams, useRouter } from 'next/navigation'
import AppHeader from '@/components/AppHeader'
import EmploymentConditionsWizard from '@/components/EmploymentConditionsWizard'

export default function EmploymentConditionsPage() {
  const params = useParams()
  const router = useRouter()
  const workerId = params.id as string

  return (
    <div style={{ minHeight: '100vh', background: '#f3f2ef', fontFamily: 'system-ui,sans-serif' }}>
      <AppHeader currentPage="employees" />
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '28px 24px' }}>
        <button
          onClick={() => router.push(`/employees/${workerId}`)}
          style={{ background: 'none', border: 'none', color: '#0066cc', fontSize: 14, cursor: 'pointer', marginBottom: 20, padding: 0 }}>
          ← 従業員詳細に戻る
        </button>
        <EmploymentConditionsWizard
          workerIds={[workerId]}
          showTodokeNotify={true}
          onSaved={() => router.push(`/employees/${workerId}`)}
          onCancel={() => router.push(`/employees/${workerId}`)}
        />
      </div>
    </div>
  )
}
