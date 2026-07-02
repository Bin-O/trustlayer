import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ORG_ID = '11111111-1111-1111-1111-111111111111'

export async function POST(req: NextRequest) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { persistSession: false } }
  )

  try {
    const body = await req.json()
    const {
      name_kanji, name_romaji, nationality, date_of_birth,
      passport_number, residence_card_number, preferred_language,
      status_type, issued_date, expiry_date, gender,
    } = body

    const { data: worker, error: workerErr } = await supabase
      .from('foreign_workers')
      .insert({
        org_id: ORG_ID,
        name_kanji,
        name_romaji,
        nationality,
        date_of_birth,
        passport_number,
        residence_card_number,
        preferred_language,
        status: 'active',
        ...(gender ? { gender } : {}),
      })
      .select()
      .single()

    if (workerErr) throw new Error(workerErr.message)

    const { error: statusErr } = await supabase
      .from('residence_statuses')
      .insert({
        worker_id: worker.id,
        status_type,
        card_number: residence_card_number,
        issued_date,
        expiry_date,
        is_active: true,
        source: 'manual',
      })

    if (statusErr) {
      await supabase.from('foreign_workers').delete().eq('id', worker.id)
      throw new Error(statusErr.message)
    }

    return NextResponse.json({ id: worker.id })
  } catch (e) {
    const msg = e instanceof Error ? e.message : '不明なエラー'
    console.error('Worker create error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
