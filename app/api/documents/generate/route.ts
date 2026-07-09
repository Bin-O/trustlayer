import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateKoyouJoken } from '@/lib/documents/generator'
import { generateTodokeJokenHenkou } from '@/lib/documents/generatorExcel'
import { generateShienKeikaku } from '@/lib/documents/generatorShienKeikaku'
import { generateKeiyakuShuryo } from '@/lib/documents/generatorKeiyakuShuryo'
import { generateTeikiHokoku } from '@/lib/documents/generatorTeikiHokoku'
import type { KoyouJokenData } from '@/lib/documents/templates/koyouJoken'
import type { TodokeJokenHenkouData, ChangedSection } from '@/lib/documents/templates/todokeJokenHenkou'
import type { ShienKeikakuData } from '@/lib/documents/generatorShienKeikaku'
import type { KeiyakuShuryoData } from '@/lib/documents/generatorKeiyakuShuryo'
import type { TeikiHokokuData, LaborStats } from '@/lib/documents/templates/teikiHokoku'

const ORG_ID = '11111111-1111-1111-1111-111111111111'

/** 年度Nの12ヶ月リスト（N年4月〜N+1年3月） */
function fiscalMonths(fy: number) {
  return [
    ...Array.from({ length: 9 }, (_, i) => ({ year: fy,     month: i + 4 })),
    ...Array.from({ length: 3 }, (_, i) => ({ year: fy + 1, month: i + 1 })),
  ]
}

/** payroll_records から在留資格別の月平均統計を計算 */
function calcStats(
  records: Record<string, unknown>[],
  workerIds: string[],
  fy: number
): LaborStats {
  const months = fiscalMonths(fy)
  const count = workerIds.length

  if (count === 0) {
    return {
      count: 0, avg_working_days: null, avg_scheduled_hours: null, avg_overtime_hours: null,
      avg_gross_pay: null, avg_overtime_wages: null, avg_commuting: null,
      avg_bonus: null, avg_tax_insurance: null, avg_other_deduction: null,
    }
  }

  const mine = records.filter(r => workerIds.includes(r.worker_id as string))

  // 全12ヶ月×全対象者をフラットに合算して月平均を出す（不足月は除外せず0扱い：届出ルールに従う）
  // 賞与は月ごとではなく年間合計で計算
  let sumDays = 0, cntDays = 0
  let sumSched = 0, cntSched = 0
  let sumOvtH = 0, cntOvtH = 0
  let sumGross = 0, cntGross = 0
  let sumOvtW = 0, cntOvtW = 0
  let sumComm = 0, cntComm = 0
  let sumBonus = 0  // 年間合計（人×年）
  let sumTax = 0, cntTax = 0
  let sumOtherDed = 0, cntOtherDed = 0

  for (const wid of workerIds) {
    let workerBonusTotal = 0
    for (const { year, month } of months) {
      const rec = mine.find(r => r.worker_id === wid && r.target_year === year && r.target_month === month)
      if (!rec) continue

      const v = (k: string) => rec[k] as number | null
      if (v('working_days')   != null) { sumDays  += v('working_days')!;   cntDays++ }
      if (v('scheduled_hours') != null) { sumSched += v('scheduled_hours')!; cntSched++ }
      if (v('overtime_hours')  != null) { sumOvtH  += v('overtime_hours')!;  cntOvtH++ }
      if (v('gross_pay')       != null) { sumGross += v('gross_pay')!;       cntGross++ }
      const ovtW = (v('overtime_pay') ?? 0) + (v('late_night_pay') ?? 0)
      if (v('overtime_pay') != null || v('late_night_pay') != null) { sumOvtW += ovtW; cntOvtW++ }
      if (v('commuting_allowance') != null) { sumComm += v('commuting_allowance')!; cntComm++ }
      workerBonusTotal += v('bonus_pay') ?? 0
      const tax = (v('income_tax') ?? 0) + (v('resident_tax') ?? 0)
                + (v('health_insurance') ?? 0) + (v('pension') ?? 0) + (v('employment_insurance') ?? 0)
      if (v('income_tax') != null || v('health_insurance') != null) { sumTax += tax; cntTax++ }
      if (v('other_deduction') != null) { sumOtherDed += v('other_deduction')!; cntOtherDed++ }
    }
    sumBonus += workerBonusTotal
  }

  // 月平均 = 合計 / 月数サンプル数（月×人）
  // 賞与 = 年間合計 / 人数
  return {
    count,
    avg_working_days:    cntDays  > 0 ? sumDays  / cntDays  : null,
    avg_scheduled_hours: cntSched > 0 ? sumSched / cntSched : null,
    avg_overtime_hours:  cntOvtH  > 0 ? sumOvtH  / cntOvtH  : null,
    avg_gross_pay:       cntGross > 0 ? sumGross / cntGross : null,
    avg_overtime_wages:  cntOvtW  > 0 ? sumOvtW  / cntOvtW  : null,
    avg_commuting:       cntComm  > 0 ? sumComm  / cntComm  : null,
    avg_bonus:           count    > 0 ? sumBonus / count    : null,
    avg_tax_insurance:   cntTax   > 0 ? sumTax   / cntTax   : null,
    avg_other_deduction: cntOtherDed > 0 ? sumOtherDed / cntOtherDed : null,
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { documentId, workerId, changeDate, changedSections, termination, newContract, fiscalYear } = body

  // teiki_hokoku は workerId 不要（機関全体のレポート）
  if (!documentId || (!workerId && documentId !== 'teiki_hokoku')) {
    return NextResponse.json({ error: 'documentId と workerId は必須です' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )

  // 生成履歴を記録（未対応の届出判定に使用）。失敗しても文書生成自体は成功として返す
  const recordGeneration = async (docId: string, wId: string | null) => {
    const { error } = await supabase
      .from('document_generations')
      .insert({ document_id: docId, worker_id: wId })
    if (error) console.error(`[documents/generate] 生成履歴の記録に失敗 (${docId}):`, error.message)
  }

  // ── 定期届出（teiki_hokoku）は機関全体レポートのため workerId 不要 ──
  if (documentId === 'teiki_hokoku') {
    const fy = Number(fiscalYear)
    if (!fy || fy < 2020 || fy > 2100) {
      return NextResponse.json({ error: 'fiscalYear が不正です' }, { status: 400 })
    }

    const [{ data: org }, { data: allWorkers }] = await Promise.all([
      supabase.from('organizations').select('*').eq('id', ORG_ID).maybeSingle(),
      supabase.from('foreign_workers')
        .select('id, residence_statuses(status_type, is_active)')
        .eq('status', 'active')
        .order('name_kanji'),
    ])

    // 特定技能1号/2号のアクティブ在留の従業員を分類
    type FW = { id: string; residence_statuses: { status_type: string; is_active: boolean }[] }
    const gou1Ids: string[] = []
    const gou2Ids: string[] = []
    for (const w of (allWorkers ?? []) as FW[]) {
      const active = w.residence_statuses?.find(s => s.is_active)
      if (active?.status_type === '特定技能1号') gou1Ids.push(w.id)
      else if (active?.status_type === '特定技能2号') gou2Ids.push(w.id)
    }
    const allIds = [...gou1Ids, ...gou2Ids]

    const DUMMY_ID = '00000000-0000-0000-0000-000000000000'
    const targetIds = allIds.length ? allIds : [DUMMY_ID]

    // 年度内の payroll_records・employment_conditions を並列取得
    const [{ data: records }, { data: allConditions }] = await Promise.all([
      supabase
        .from('payroll_records')
        .select('worker_id,target_year,target_month,working_days,scheduled_hours,overtime_hours,bonus_pay,gross_pay,overtime_pay,late_night_pay,commuting_allowance,income_tax,resident_tax,health_insurance,pension,employment_insurance,other_deduction')
        .or(`and(target_year.eq.${fy},target_month.gte.4),and(target_year.eq.${fy + 1},target_month.lte.3)`)
        .in('worker_id', targetIds),
      supabase
        .from('employment_conditions')
        .select('worker_id, industry_field')
        .in('worker_id', targetIds),
    ])

    // 従業員個別の industry_field を集約（全員一致→その値、不一致→複数分野表記、未設定→org フォールバック）
    const uniqueFields = [...new Set(
      (allConditions ?? [])
        .map((c: { industry_field: string | null }) => c.industry_field)
        .filter((f): f is string => !!f && f.trim() !== '')
    )]
    const derivedIndustryField: string | null =
      uniqueFields.length === 1 ? uniqueFields[0]
      : uniqueFields.length > 1 ? '複数分野（詳細は個別書類参照）'
      : (org?.industry_field ?? null)

    const recs = (records ?? []) as Record<string, unknown>[]
    const gou1 = calcStats(recs, gou1Ids, fy)
    const gou2 = calcStats(recs, gou2Ids, fy)

    // 合計統計（全対象者）
    const total = calcStats(recs, allIds, fy)
    total.count = gou1.count + gou2.count

    const today = new Date().toISOString().slice(0, 10)
    const input: TeikiHokokuData = {
      org: org ? {
        legal_person_number: org.legal_person_number ?? null,
        industry_field:      derivedIndustryField,
        name_kana:           org.name_kana ?? null,
        name:                org.name ?? '',
        postal_code:         org.postal_code ?? null,
        address:             org.address ?? null,
        phone:               org.phone ?? null,
        contact_person:      org.contact_person ?? null,
        contact_phone:       org.contact_phone ?? null,
      } : null,
      fiscal_year: fy,
      total,
      gou1,
      gou2,
      created_date: today,
    }

    try {
      const buffer = await generateTeikiHokoku(input)
      await recordGeneration('teiki_hokoku', null)
      const filename = `定期届出_${fy}年度.xlsx`
      return new NextResponse(buffer as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      })
    } catch (e) {
      console.error('[documents/generate] teiki_hokoku error:', e)
      return NextResponse.json({ error: '文書生成中にエラーが発生しました' }, { status: 500 })
    }
  }

  // ── 以下は workerId が必要な個別書類 ──
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
      await recordGeneration('koyou_joken', workerId)
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
      await recordGeneration('todoke_joken_henkou', workerId)
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
      await recordGeneration('shien_keikaku', workerId)
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

  if (documentId === 'todoke_keiyaku_shuryo') {
    const today = new Date().toISOString().slice(0, 10)
    const input: KeiyakuShuryoData = {
      worker: {
        name_romaji: worker.name_romaji ?? '',
        date_of_birth: worker.date_of_birth ?? null,
        nationality: worker.nationality ?? null,
        residence_card_number: worker.residence_card_number ?? null,
        gender: worker.gender ?? null,
      },
      conditions: conditions ? {
        industry_field: conditions.industry_field ?? null,
        job_category: conditions.job_category ?? null,
      } : null,
      termination: termination ?? null,
      new_contract: newContract ?? null,
      org: org ? {
        name: org.name ?? '',
        address: org.address ?? null,
        phone: org.phone ?? null,
      } : null,
      created_date: today,
    }

    try {
      const buffer = await generateKeiyakuShuryo(input)
      await recordGeneration('todoke_keiyaku_shuryo', workerId)
      const filename = `随時届出_契約終了_${worker.name_romaji}.xlsx`

      return new NextResponse(buffer as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      })
    } catch (e) {
      console.error('[documents/generate] todoke_keiyaku_shuryo error:', e)
      return NextResponse.json({ error: '文書生成中にエラーが発生しました' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: `未対応の文書タイプ: ${documentId}` }, { status: 400 })
}
