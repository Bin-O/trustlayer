import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendLineNotification } from '@/lib/line/sendNotification'

type ResidenceStatus = {
  status_type: string
  expiry_date: string
  is_active: boolean
}

type Worker = {
  id: string
  name_kanji: string | null
  name_romaji: string
  nationality: string
  residence_statuses: ResidenceStatus[]
}

function daysUntil(dateStr: string): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const expiry = new Date(dateStr)
  expiry.setHours(0, 0, 0, 0)
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function buildMessage(worker: Worker, days: number, expiryDate: string, statusType: string): string {
  if (days < 0) {
    return `【期限切れ】${worker.name_kanji || worker.name_romaji}さんの在留資格（${statusType}）は ${Math.abs(days)} 日前に期限が切れています。\n期限日：${expiryDate}`
  }
  if (days <= 30) {
    return `【期限間近・30日以内】${worker.name_kanji || worker.name_romaji}さんの在留資格（${statusType}）の期限まで残り ${days} 日です。\n期限日：${expiryDate}`
  }
  return `【期限間近・90日以内】${worker.name_kanji || worker.name_romaji}さんの在留資格（${statusType}）の期限まで残り ${days} 日です。\n期限日：${expiryDate}`
}

export async function POST(req: NextRequest) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { persistSession: false } }
  )

  const { data: workers, error } = await supabase
    .from('foreign_workers')
    .select('id, name_kanji, name_romaji, nationality, residence_statuses(*)')
    .eq('status', 'active')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: { name: string; days: number; sent: boolean; error?: string }[] = []

  for (const w of (workers ?? []) as Worker[]) {
    const active = w.residence_statuses?.find((s) => s.is_active)
    if (!active) continue

    const days = daysUntil(active.expiry_date)
    if (days > 90) continue

    const message = buildMessage(w, days, active.expiry_date, active.status_type)

    try {
      await sendLineNotification(message)
      results.push({ name: w.name_kanji || w.name_romaji, days, sent: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      results.push({ name: w.name_kanji || w.name_romaji, days, sent: false, error: msg })
    }
  }

  return NextResponse.json({ checked: (workers ?? []).length, notified: results })
}
