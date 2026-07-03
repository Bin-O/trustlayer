import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateKoyouJoken } from '@/lib/documents/generator'
import { generateTodokeJokenHenkou } from '@/lib/documents/generatorExcel'
import { generateShienKeikaku } from '@/lib/documents/generatorShienKeikaku'
import type { KoyouJokenData } from '@/lib/documents/templates/koyouJoken'
import type { TodokeJokenHenkouData, ChangedSection } from '@/lib/documents/templates/todokeJokenHenkou'
import type { ShienKeikakuData } from '@/lib/documents/generatorShienKeikaku'

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

  if (documentId === 'shien_keikaku') {
    const today = new Date().toISOString().slice(0, 10)
    const input: ShienKeikakuData = {
      worker: {
        name_kanji: worker.name_kanji ?? worker.name_romaji ?? '',
        name_kana: worker.name_kana ?? null,
        date_of_birth: worker.date_of_birth ?? null,
        nationality: worker.nationality ?? null,
        gender: worker.gender ?? null,
      },
      org: org ? {
        name: org.name ?? '',
        name_kana: org.name_kana ?? null,
        address: org.address ?? null,
        phone: org.phone ?? null,
        support_office_address: org.support_office_address ?? null,
        support_office_phone: org.support_office_phone ?? null,
        support_supervisor_name: org.support_supervisor_name ?? null,
        support_supervisor_kana: org.support_supervisor_kana ?? null,
        support_supervisor_title: org.support_supervisor_title ?? null,
        support_staff_name: org.support_staff_name ?? null,
        support_staff_kana: org.support_staff_kana ?? null,
        support_staff_title: org.support_staff_title ?? null,
        shien_jizen_guidance: org.shien_jizen_guidance ?? null,
        shien_housing: org.shien_housing ?? null,
        shien_life_support: org.shien_life_support ?? null,
        shien_japanese: org.shien_japanese ?? null,
        shien_consultation: org.shien_consultation ?? null,
        shien_japanese_contact: org.shien_japanese_contact ?? null,
        shien_job_change: org.shien_job_change ?? null,
        shien_regular_meeting: org.shien_regular_meeting ?? null,
        shien_jizen_guidance_plan: org.shien_jizen_guidance_plan ?? null,
        shien_housing_plan: org.shien_housing_plan ?? null,
        shien_life_support_plan: org.shien_life_support_plan ?? null,
        shien_japanese_plan: org.shien_japanese_plan ?? null,
        shien_consultation_plan: org.shien_consultation_plan ?? null,
        shien_japanese_contact_plan: org.shien_japanese_contact_plan ?? null,
        shien_job_change_plan: org.shien_job_change_plan ?? null,
        shien_regular_meeting_plan: org.shien_regular_meeting_plan ?? null,
        shien_outsource: org.shien_outsource ?? null,
        shien_staff_address: org.shien_staff_address ?? null,
      } : null,
      created_date: today,
    }

    try {
      const buffer = await generateShienKeikaku(input)
      const filename = `支援計画書_${worker.name_kanji ?? worker.name_romaji}.xlsx`

      return new NextResponse(buffer as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      })
    } catch (e) {
      console.error('[documents/generate] shien_keikaku error:', e)
      return NextResponse.json({ error: '文書生成中にエラーが発生しました' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: `未対応の文書タイプ: ${documentId}` }, { status: 400 })
}
