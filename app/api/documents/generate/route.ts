import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateKoyouJoken } from '@/lib/documents/generator'
import type { KoyouJokenData } from '@/lib/documents/templates/koyouJoken'

export async function POST(req: NextRequest) {
  const { documentId, workerId } = await req.json()

  if (!documentId || !workerId) {
    return NextResponse.json({ error: 'documentId と workerId は必須です' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )

  // 従業員データ取得
  const { data: worker, error: workerErr } = await supabase
    .from('foreign_workers')
    .select('*, residence_statuses(*)')
    .eq('id', workerId)
    .single()

  if (workerErr || !worker) {
    return NextResponse.json({ error: '従業員データが見つかりません' }, { status: 404 })
  }

  // 雇用条件・契約・企業データを並行取得
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

  return NextResponse.json({ error: `未対応の文書タイプ: ${documentId}` }, { status: 400 })
}
