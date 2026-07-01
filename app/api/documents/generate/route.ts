import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateKoyouJoken } from '@/lib/documents/generator'
import { generateTodokeJokenHenkou } from '@/lib/documents/generatorExcel'
import type { KoyouJokenData } from '@/lib/documents/templates/koyouJoken'
import type { TodokeJokenHenkouData, ChangedSection } from '@/lib/documents/templates/todokeJokenHenkou'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { documentId, workerId, changeDate, changedSections } = body

  if (!documentId || !workerId) {
    return NextResponse.json({ error: 'documentId と workerId は必須です' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )

  const { data: worker, error: workerErr } = await supabase
    .from('foreign_workers')
    .select('*, residence_statuses(*)')
    .eq('id', workerId)
    .single()

  if (workerErr || !worker) {
    return NextResponse.json({ error: '従業員データが見つかりません' }, { status: 404 })
  }

  const [{ data: conditions }, { data: contract }, { data: org }] = await Promise.all([
    supabase.from('employment_conditions').select('*').eq('worker_id', workerId).maybeSingle(),
    supabase.from('worker_contracts').select('*').eq('worker_id', workerId).maybeSingle(),
    supabase.from('organizations').select('*').eq('id', worker.org_id).maybeSingle(),
  ])

  if (documentId === 'koyou_joken') {
    const input: KoyouJokenData = { worker, org: org ?? null, conditions: conditions ?? null, contract: contract ?? null }

    try {
      const buffer = await generateKoyouJoken(input)
      const filename = `雇用条件書_${worker.name_romaji}.docx`

      return new NextResponse(buffer as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      })
    } catch (e) {
      console.error('[documents/generate] koyou_joken error:', e)
      return NextResponse.json({ error: '文書生成中にエラーが発生しました' }, { status: 500 })
    }
  }

  if (documentId === 'todoke_joken_henkou') {
    const today = new Date().toISOString().slice(0, 10)
    const input: TodokeJokenHenkouData = {
      worker: {
        name_romaji: worker.name_romaji ?? '',
        date_of_birth: worker.date_of_birth ?? null,
        nationality: worker.nationality ?? null,
        residence_card_number: worker.residence_card_number ?? null,
      },
      conditions: conditions ? {
        industry_field: conditions.industry_field ?? null,
        job_category: conditions.job_category ?? null,
      } : null,
      change: {
        change_date: changeDate ?? today,
        changed_sections: (changedSections ?? []) as ChangedSection[],
      },
      org: org ? {
        name: org.name ?? '',
        address: org.address ?? null,
        phone: org.phone ?? null,
        representative_name: org.representative_name ?? null,
      } : null,
      created_date: today,
    }

    try {
      const buffer = await generateTodokeJokenHenkou(input)
      const filename = `随時届出_条件変更_${worker.name_romaji}.xlsx`

      return new NextResponse(buffer as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      })
    } catch (e) {
      console.error('[documents/generate] todoke_joken_henkou error:', e)
      return NextResponse.json({ error: '文書生成中にエラーが発生しました' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: `未対応の文書タイプ: ${documentId}` }, { status: 400 })
}
