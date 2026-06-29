import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, HeadingLevel,
} from 'docx'
import type { KoyouJokenData } from './templates/koyouJoken'

// ── ヘルパー ────────────────────────────────────────────────
const V = (v: unknown, fallback = '　　　　　　　　　　') =>
  (v === null || v === undefined || v === '') ? fallback : String(v)

const YEN = (v: number | null | undefined) =>
  v == null ? '（未記入）' : `${v.toLocaleString('ja-JP')}円`

const BOOL = (v: boolean | null | undefined, yes = '有', no = '無') =>
  v === true ? yes : v === false ? no : '（未記入）'

const CHECK = (v: boolean | null | undefined) => v ? '■' : '□'

const WAGE_LABEL: Record<string, string> = {
  monthly: '月給',
  daily:   '日給',
  hourly:  '時間給',
}

// ── 共通スタイル ──────────────────────────────────────────
const FONT = 'MS明朝'
const SIZE_BODY = 20   // 10pt
const SIZE_SMALL = 18  // 9pt
const SIZE_HEADING = 22 // 11pt

const noBorder = {
  top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
}

const thinBorder = {
  top:    { style: BorderStyle.SINGLE, size: 4, color: '000000' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
  left:   { style: BorderStyle.SINGLE, size: 4, color: '000000' },
  right:  { style: BorderStyle.SINGLE, size: 4, color: '000000' },
}

function run(text: string, opts: { bold?: boolean; size?: number; underline?: boolean } = {}) {
  return new TextRun({
    text,
    font: FONT,
    size: opts.size ?? SIZE_BODY,
    bold: opts.bold ?? false,
  })
}

function para(text: string | TextRun[], opts: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; indent?: number } = {}) {
  const children = typeof text === 'string' ? [run(text)] : text
  return new Paragraph({
    children,
    alignment: opts.align,
    indent: opts.indent != null ? { left: opts.indent } : undefined,
    spacing: { after: 60 },
  })
}

function sectionHeading(text: string) {
  return new Paragraph({
    children: [run(text, { bold: true, size: SIZE_HEADING })],
    spacing: { before: 200, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' } },
  })
}

function labelRow(label: string, value: string) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.NONE, size: 0 },
      left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            borders: noBorder,
            children: [new Paragraph({ children: [run(label, { size: SIZE_SMALL })], spacing: { after: 40 } })],
          }),
          new TableCell({
            width: { size: 70, type: WidthType.PERCENTAGE },
            borders: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '888888' }, top: { style: BorderStyle.NONE, size: 0 }, left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 } },
            children: [new Paragraph({ children: [run(value, { size: SIZE_SMALL })], spacing: { after: 40 } })],
          }),
        ],
      }),
    ],
  })
}

function emptyLine() {
  return new Paragraph({ children: [run('')], spacing: { after: 80 } })
}

// ── 雇用条件書 本体 ──────────────────────────────────────────
export async function generateKoyouJoken(data: KoyouJokenData): Promise<Buffer> {
  const { worker, org, conditions: c, contract } = data
  const activeStatus = worker.residence_statuses?.find(s => s.is_active)

  const today = new Date()
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`

  const wageLabel = WAGE_LABEL[c?.wage_type ?? ''] ?? '（未記入）'

  // 諸手当の行を生成
  const allowanceRows: Paragraph[] = []
  const allowances = [
    { name: c?.allowance_1_name, amount: c?.allowance_1_amount },
    { name: c?.allowance_2_name, amount: c?.allowance_2_amount },
    { name: c?.allowance_3_name, amount: c?.allowance_3_amount },
    { name: c?.allowance_4_name, amount: c?.allowance_4_amount },
  ].filter(a => a.name)

  if (allowances.length === 0) {
    allowanceRows.push(para('　なし', { indent: 400 }))
  } else {
    allowances.forEach((a, i) => {
      allowanceRows.push(para(`　(${String.fromCharCode(97 + i)}) ${V(a.name)}　${YEN(a.amount ?? null)}`, { indent: 400 }))
    })
  }

  // 社会保険チェックリスト
  const insuranceText = [
    c?.insurance_kosei_nenkin ? '■厚生年金' : '□厚生年金',
    c?.insurance_kenko        ? '■健康保険' : '□健康保険',
    c?.insurance_koyo         ? '■雇用保険' : '□雇用保険',
    c?.insurance_rousai       ? '■労災保険' : '□労災保険',
    c?.insurance_kokumin_nenkin ? '■国民年金' : '□国民年金',
    c?.insurance_kokumin_kenko  ? '■国民健康保険' : '□国民健康保険',
  ].join('　')

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: SIZE_BODY },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 720, bottom: 720, left: 1080, right: 1080 },
        },
      },
      children: [
        // ── ヘッダー ──────────────────────────────────
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [run('参考様式第１－６号', { size: SIZE_SMALL })],
          spacing: { after: 40 },
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [run('雇用条件書', { bold: true, size: 36 })],
          spacing: { after: 200 },
        }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [run(dateStr)],
          spacing: { after: 120 },
        }),
        para([run(`${worker.name_kanji}　殿`, { bold: true, size: SIZE_HEADING })]),
        emptyLine(),

        // ── 特定技能所属機関情報 ──────────────────────
        labelRow('特定技能所属機関名', V(org?.name)),
        labelRow('所在地', V(org?.address)),
        labelRow('電話番号', V(org?.phone)),
        labelRow('代表者　役職・氏名', `${V(org?.representative_title)}　${V(org?.representative_name)}`),
        emptyLine(),

        // ── Ⅰ 雇用契約期間 ───────────────────────────
        sectionHeading('Ⅰ．雇用契約期間'),
        para([
          run('１．雇用契約期間　（'),
          run(V(contract?.contract_start_date), { underline: true }),
          run(' ～ '),
          run(V(contract?.contract_end_date), { underline: true }),
          run('）　入国予定日　'),
          run(V(contract?.planned_entry_date), { underline: true }),
        ], { indent: 200 }),
        para(`２．契約の更新の有無　　${CHECK(contract?.contract_renewable === false)} 契約の更新はしない　　${CHECK(contract?.contract_renewable)} 原則として更新する`, { indent: 200 }),
        emptyLine(),

        // ── Ⅱ 就業の場所 ─────────────────────────────
        sectionHeading('Ⅱ．就業の場所'),
        para(`${CHECK(c?.workplace_type === 'direct')} 直接雇用（以下に記入）　　${CHECK(c?.workplace_type === 'dispatch')} 派遣雇用`, { indent: 200 }),
        para(`事業所名　　${V(c?.workplace_name)}`, { indent: 400 }),
        para(`所在地　　　${V(c?.workplace_address)}`, { indent: 400 }),
        para(`連絡先　　　${V(c?.workplace_phone)}`, { indent: 400 }),
        emptyLine(),

        // ── Ⅲ 従事すべき業務の内容 ───────────────────
        sectionHeading('Ⅲ．従事すべき業務の内容'),
        para(`１．分　　野（${V(c?.industry_field)}）`, { indent: 200 }),
        para(`２．業務区分（${V(c?.job_category)}）`, { indent: 200 }),
        emptyLine(),

        // ── Ⅳ 労働時間等 ─────────────────────────────
        sectionHeading('Ⅳ．労働時間等'),
        para('１．始業・終業の時刻等', { indent: 200 }),
        para([
          run(`　(1) 始業（${V(c?.work_start_time)}）　終業（${V(c?.work_end_time)}）`),
          run(`　休憩（${V(c?.break_minutes)}分）`),
        ], { indent: 400 }),
        para([
          run('２．所定労働時間数　'),
          run(`①週（${V(c?.weekly_scheduled_hours)}時間${c?.weekly_scheduled_minutes ? c.weekly_scheduled_minutes + '分' : ''}）`),
          run(`　②月（${V(c?.monthly_scheduled_hours)}時間）`),
          run(`　③年（${V(c?.annual_scheduled_hours)}時間）`),
        ], { indent: 200 }),
        para([
          run('３．所定労働日数　'),
          run(`①週（${V(c?.weekly_scheduled_days)}日）`),
          run(`　②月（${V(c?.monthly_scheduled_days)}日）`),
          run(`　③年（${V(c?.annual_scheduled_days)}日）`),
        ], { indent: 200 }),
        para(`４．所定時間外労働の有無　${CHECK(c?.overtime_exists)} 有　　${CHECK(c?.overtime_exists === false)} 無`, { indent: 200 }),
        emptyLine(),

        // ── Ⅴ 休日 ───────────────────────────────────
        sectionHeading('Ⅴ．休日'),
        para(`１．定例日：${V(c?.regular_holiday_days)}　（年間合計休日日数　${V(c?.annual_holiday_days)}日）`, { indent: 200 }),
        para(`２．非定例日：${V(c?.irregular_holiday_info)}`, { indent: 200 }),
        emptyLine(),

        // ── Ⅵ 休暇 ───────────────────────────────────
        sectionHeading('Ⅵ．休暇'),
        para(`１．年次有給休暇　６か月継続勤務した場合→　${V(c?.annual_paid_leave_days)}日`, { indent: 200 }),
        para(`２．その他の休暇　有給（${V(c?.other_paid_leave)}）　無給（${V(c?.other_unpaid_leave)}）`, { indent: 200 }),
        para('３．一時帰国休暇　乙が一時帰国を希望した場合は、上記１及び２の範囲内で必要な休暇を取得させることとする。', { indent: 200 }),
        emptyLine(),

        // ── Ⅶ 賃金 ───────────────────────────────────
        sectionHeading('Ⅶ．賃金'),
        para([
          run(`１．基本賃金　${CHECK(c?.wage_type === 'monthly')} 月給（${YEN(c?.basic_wage ?? null)}）　`),
          run(`${CHECK(c?.wage_type === 'daily')} 日給（${c?.wage_type === 'daily' ? YEN(c?.basic_wage ?? null) : '　　　　'}）　`),
          run(`${CHECK(c?.wage_type === 'hourly')} 時間給（${c?.wage_type === 'hourly' ? YEN(c?.basic_wage ?? null) : '　　　　'}）`),
        ], { indent: 200 }),
        para('２．諸手当（時間外労働の割増賃金は除く）', { indent: 200 }),
        ...allowanceRows,
        para('３．割増賃金率', { indent: 200 }),
        para([
          run(`　(1) 所定時間外　法定超月60時間以内（${V(c?.overtime_rate_under60)}%）　法定超月60時間超（${V(c?.overtime_rate_over60)}%）　所定超（${V(c?.overtime_rate_prescribed)}%）`),
        ], { indent: 400 }),
        para(`　(2) 休日　法定休日（${V(c?.holiday_rate_statutory)}%）　法定外休日（${V(c?.holiday_rate_non_statutory)}%）`, { indent: 400 }),
        para(`　(3) 深夜（${V(c?.late_night_rate)}%）`, { indent: 400 }),
        para(`４．賃金締切日　毎月${V(c?.wage_cutoff_day)}日`, { indent: 200 }),
        para(`５．賃金支払日　毎月${V(c?.wage_payment_day)}日`, { indent: 200 }),
        para(`６．賃金支払方法　${CHECK(c?.wage_payment_method === 'bank')} 口座振込　${CHECK(c?.wage_payment_method === 'cash')} 通貨払`, { indent: 200 }),
        para(`７．労使協定に基づく賃金支払時の控除　${CHECK(c?.wage_deduction_agreement === false)} 無　${CHECK(c?.wage_deduction_agreement)} 有`, { indent: 200 }),
        para(`８．昇給　${CHECK(c?.salary_increase_exists)} 有（${V(c?.salary_increase_details)}）　${CHECK(c?.salary_increase_exists === false)} 無`, { indent: 200 }),
        para(`９．賞与　${CHECK(c?.bonus_exists)} 有（${V(c?.bonus_details)}）　${CHECK(c?.bonus_exists === false)} 無`, { indent: 200 }),
        para(`10．退職金　${CHECK(c?.severance_pay_exists)} 有（${V(c?.severance_pay_details)}）　${CHECK(c?.severance_pay_exists === false)} 無`, { indent: 200 }),
        para(`11．休業手当　${CHECK(c?.work_injury_allowance_exists)} 有（率：${V(c?.work_injury_allowance_rate)}）　${CHECK(c?.work_injury_allowance_exists === false)} 無`, { indent: 200 }),
        emptyLine(),

        // ── Ⅷ 退職に関する事項 ───────────────────────
        sectionHeading('Ⅷ．退職に関する事項'),
        para('１．自己都合退職の手続（退職する30日前に社長・工場長等に届けること）', { indent: 200 }),
        para('２．解雇の事由及び手続', { indent: 200 }),
        para([run('　解雇は、やむを得ない事由がある場合に限り少なくとも30日前に予告をするか、又は30日分以上の平均賃金を支払って解雇する。', { size: SIZE_SMALL })], { indent: 400 }),
        emptyLine(),

        // ── Ⅸ その他 ─────────────────────────────────
        sectionHeading('Ⅸ．その他'),
        para('１．社会保険の加入状況・労働保険の適用状況', { indent: 200 }),
        para(insuranceText, { indent: 400 }),
        para(`２．雇入れ時の健康診断　${V(c?.health_checkup_on_hire)}`, { indent: 200 }),
        para(`３．初回の定期健康診断　${V(c?.health_checkup_first)}　（その後　${V(c?.health_checkup_interval, '1年ごと')}に実施）`, { indent: 200 }),
        para('４．本契約終了後に乙が帰国するに当たり、乙が帰国旅費を負担することができないときは、甲が当該旅費を負担するとともに、帰国が円滑になされるよう必要な措置を講じることとする。', { indent: 200 }),
        emptyLine(),
        emptyLine(),

        // ── 受取人署名欄 ──────────────────────────────
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [run('受取人（署名）　　　　　　　　　　　　　　　　　　　　')],
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: '000000' } },
          spacing: { before: 400, after: 40 },
        }),
      ],
    }],
  })

  return Buffer.from(await Packer.toBuffer(doc))
}
