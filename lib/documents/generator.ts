import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, PageBreak,
} from 'docx'
import type { KoyouJokenData } from './templates/koyouJoken'

// ── ヘルパー ────────────────────────────────────────────────
const BLANK = '　　　　　　　　　　'

const V = (v: unknown, fallback = BLANK) =>
  (v === null || v === undefined || v === '') ? fallback : String(v)

const YEN = (v: number | null | undefined, fallback = BLANK) =>
  v == null ? fallback : `${v.toLocaleString('ja-JP')}円`

const YEN_APPROX = (v: number | null | undefined) =>
  v == null ? `約${BLANK}円` : `約 ${v.toLocaleString('ja-JP')}円`

const CHECK = (v: boolean | null | undefined) => v ? '■' : '□'

// ── 共通スタイル ──────────────────────────────────────────
const FONT = 'MS明朝'
const SIZE_BODY = 20    // 10pt
const SIZE_SMALL = 18   // 9pt
const SIZE_HEADING = 22 // 11pt

const noBorder = {
  top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
}

function run(text: string, opts: { bold?: boolean; size?: number } = {}) {
  return new TextRun({ text, font: FONT, size: opts.size ?? SIZE_BODY, bold: opts.bold ?? false })
}

function para(
  text: string | TextRun[],
  opts: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; indent?: number; size?: number } = {},
) {
  const children = typeof text === 'string'
    ? [new TextRun({ text, font: FONT, size: opts.size ?? SIZE_BODY })]
    : text
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
            borders: {
              bottom: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
              top: { style: BorderStyle.NONE, size: 0 },
              left: { style: BorderStyle.NONE, size: 0 },
              right: { style: BorderStyle.NONE, size: 0 },
            },
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

function noteText(text: string) {
  return para(text, { indent: 600, size: SIZE_SMALL })
}

function shiftLine(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  days: string | null | undefined,
  hours: number | null | undefined,
  minutes: number | null | undefined,
) {
  const s = V(startTime, '　　　')
  const e = V(endTime, '　　　')
  const d = V(days, '　　　　')
  const h = V(hours, '　　')
  const m = V(minutes, '　　')
  return para(
    `　　　始業（${s}）　終業（${e}）　（適用日　${d}，１日の所定労働時間　${h}時間${m}分）`,
    { indent: 400, size: SIZE_SMALL },
  )
}

// ── 雇用条件書 本体 ──────────────────────────────────────────
export async function generateKoyouJoken(data: KoyouJokenData): Promise<Buffer> {
  const { worker, org, conditions: c, contract } = data

  const today = new Date()
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`

  // 諸手当（本体Ⅶ用：名称と金額のみ）
  const allowancesForMain = [
    { name: c?.allowance_1_name, amount: c?.allowance_1_amount },
    { name: c?.allowance_2_name, amount: c?.allowance_2_amount },
    { name: c?.allowance_3_name, amount: c?.allowance_3_amount },
    { name: c?.allowance_4_name, amount: c?.allowance_4_amount },
  ].filter(a => a.name)

  const mainAllowanceLabel = allowancesForMain.length > 0
    ? allowancesForMain.map(a => `${a.name}`).join('，')
    : BLANK

  // 社会保険チェック
  const insuranceText = [
    `${CHECK(c?.insurance_kosei_nenkin)} 厚生年金`,
    `${CHECK(c?.insurance_kenko)} 健康保険`,
    `${CHECK(c?.insurance_koyo)} 雇用保険`,
    `${CHECK(c?.insurance_rousai)} 労災保険`,
    `${CHECK(c?.insurance_kokumin_nenkin)} 国民年金`,
    `${CHECK(c?.insurance_kokumin_kenko)} 国民健康保険`,
  ].join('　')

  // 1日の所定労働時間（指定がなければ週時間÷日数から計算）
  let dailyHours = c?.daily_scheduled_hours ?? null
  let dailyMinutes = c?.daily_scheduled_minutes ?? 0
  if (dailyHours == null && c?.weekly_scheduled_hours != null && c?.weekly_scheduled_days != null && c.weekly_scheduled_days > 0) {
    const totalMins = (c.weekly_scheduled_hours * 60 + (c.weekly_scheduled_minutes ?? 0)) / c.weekly_scheduled_days
    dailyHours = Math.floor(totalMins / 60)
    dailyMinutes = Math.round(totalMins % 60)
  }

  // ── 別紙用：概算・控除計算 ──────────────────────────────
  const allowancesTotal = [
    c?.allowance_1_amount, c?.allowance_2_amount,
    c?.allowance_3_amount, c?.allowance_4_amount,
  ].reduce<number>((sum, v) => sum + (v ?? 0), 0)

  const monthlyEstimate = c?.basic_wage != null
    ? c.basic_wage + allowancesTotal
    : null

  const deductions = [
    c?.deduction_tax ?? null,
    c?.deduction_social_insurance ?? null,
    c?.deduction_employment_insurance ?? null,
    c?.deduction_food ?? null,
    c?.deduction_housing ?? null,
    c?.deduction_utilities ?? null,
    c?.deduction_other_1_amount ?? null,
    c?.deduction_other_2_amount ?? null,
  ]
  const deductionsTotal = deductions.every(v => v == null)
    ? null
    : deductions.reduce<number>((sum, v) => sum + (v ?? 0), 0)

  const takehome = (monthlyEstimate != null && deductionsTotal != null)
    ? monthlyEstimate - deductionsTotal
    : null

  // 別紙用：諸手当4行（計算方法付き）
  const allowanceDefs = [
    { name: c?.allowance_1_name, amount: c?.allowance_1_amount, method: c?.allowance_1_calc_method },
    { name: c?.allowance_2_name, amount: c?.allowance_2_amount, method: c?.allowance_2_calc_method },
    { name: c?.allowance_3_name, amount: c?.allowance_3_amount, method: c?.allowance_3_calc_method },
    { name: c?.allowance_4_name, amount: c?.allowance_4_amount, method: c?.allowance_4_calc_method },
  ]

  const beppiAllowanceRows = allowanceDefs.map((a, i) => {
    const label = String.fromCharCode(97 + i) // a b c d
    const name = V(a.name, '　　　')
    const amt = a.amount != null ? `${a.amount.toLocaleString('ja-JP')}円` : `${BLANK}円`
    const method = V(a.method, '')
    return para(
      `　(${label}) （${name}　${amt}／計算方法：${method || BLANK}）`,
      { indent: 400, size: SIZE_SMALL },
    )
  })

  // ── Document 組み立て ──────────────────────────────────────
  const doc = new Document({
    styles: {
      default: { document: { run: { font: FONT, size: SIZE_BODY } } },
    },
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 1080, right: 1080 } } },
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
        para([run(`${worker.name_kanji || worker.name_romaji}　殿`, { bold: true, size: SIZE_HEADING })]),
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
          run(V(contract?.contract_start_date), {}),
          run(' ～ '),
          run(V(contract?.contract_end_date), {}),
          run('）　入国予定日　'),
          run(V(contract?.planned_entry_date), {}),
        ], { indent: 200 }),
        para(
          `２．契約の更新の有無　　${CHECK(contract?.contract_renewable === false)} 契約の更新はしない　　${CHECK(contract?.contract_renewable)} 原則として更新する`,
          { indent: 200 },
        ),
        para(
          '　※　会社の経営状況が著しく悪化した場合等には，契約を更新しない場合がある。',
          { indent: 400, size: SIZE_SMALL },
        ),
        emptyLine(),

        // ── Ⅱ 就業の場所 ─────────────────────────────
        sectionHeading('Ⅱ．就業の場所'),
        para(
          `${CHECK(c?.workplace_type === 'direct')} 直接雇用（以下に記入）　　${CHECK(c?.workplace_type === 'dispatch')} 派遣雇用（別紙「就業条件明示書」に記入）`,
          { indent: 200 },
        ),
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
        para(
          `　(1) 始業（${V(c?.work_start_time)}）　終業（${V(c?.work_end_time)}）　（１日の所定労働時間数　${V(dailyHours, '　　')}時間${V(dailyMinutes === 0 ? '0' : dailyMinutes, '　　')}分）`,
          { indent: 400 },
        ),
        para('　(2) 【次の制度が労働者に適用される場合】', { indent: 400 }),
        para(
          `　　${CHECK(c?.henkou_roudou_jikan)} 変形労働時間制：（${V(c?.henkou_roudou_jikan_unit, '　　　')}）単位の変形労働時間制`,
          { indent: 400, size: SIZE_SMALL },
        ),
        noteText('　　※　１年単位の変形労働時間制を採用している場合には，乙が十分に理解できる言語を併記した年間カレンダーの写し及び労働基準監督署へ届け出た変形労働時間制に関する協定書の写しを添付する。'),
        para(
          `　　${CHECK(c?.kotai_sei)} 交代制として，次の勤務時間の組合せによる。`,
          { indent: 400, size: SIZE_SMALL },
        ),
        shiftLine(c?.shift1_start_time, c?.shift1_end_time, c?.shift1_days, c?.shift1_daily_hours, c?.shift1_daily_minutes),
        shiftLine(c?.shift2_start_time, c?.shift2_end_time, c?.shift2_days, c?.shift2_daily_hours, c?.shift2_daily_minutes),
        shiftLine(c?.shift3_start_time, c?.shift3_end_time, c?.shift3_days, c?.shift3_daily_hours, c?.shift3_daily_minutes),
        para(`２．休憩時間　（${V(c?.break_minutes, '　　')}分）`, { indent: 200 }),
        para([
          run('３．所定労働時間数　'),
          run(`①週（${V(c?.weekly_scheduled_hours)}時間${c?.weekly_scheduled_minutes ? c.weekly_scheduled_minutes + '分' : ''}）`),
          run(`　②月（${V(c?.monthly_scheduled_hours)}時間）`),
          run(`　③年（${V(c?.annual_scheduled_hours)}時間）`),
        ], { indent: 200 }),
        para([
          run('４．所定労働日数　'),
          run(`①週（${V(c?.weekly_scheduled_days)}日）`),
          run(`　②月（${V(c?.monthly_scheduled_days)}日）`),
          run(`　③年（${V(c?.annual_scheduled_days)}日）`),
        ], { indent: 200 }),
        para(
          `５．所定時間外労働の有無　${CHECK(c?.overtime_exists)} 有　　${CHECK(c?.overtime_exists === false)} 無`,
          { indent: 200 },
        ),
        para('○詳細は，就業規則　第　　条～第　　条，第　　条～第　　条，第　　条～第　　条', { indent: 400, size: SIZE_SMALL }),
        emptyLine(),

        // ── Ⅴ 休日 ───────────────────────────────────
        sectionHeading('Ⅴ．休日'),
        para(`１．定例日：${V(c?.regular_holiday_days)}　（年間合計休日日数　${V(c?.annual_holiday_days)}日）`, { indent: 200 }),
        para(`２．非定例日：${V(c?.irregular_holiday_info)}`, { indent: 200 }),
        para('○詳細は，就業規則　第　　条～第　　条，第　　条～第　　条', { indent: 400, size: SIZE_SMALL }),
        emptyLine(),

        // ── Ⅵ 休暇 ───────────────────────────────────
        sectionHeading('Ⅵ．休暇'),
        para(`１．年次有給休暇　６か月継続勤務した場合→　${V(c?.annual_paid_leave_days)}日`, { indent: 200 }),
        para(`２．その他の休暇　有給（${V(c?.other_paid_leave)}）　無給（${V(c?.other_unpaid_leave)}）`, { indent: 200 }),
        para('３．一時帰国休暇　乙が一時帰国を希望した場合は、上記１及び２の範囲内で必要な休暇を取得させることとする。', { indent: 200 }),
        para('○詳細は，就業規則　第　　条～第　　条，第　　条～第　　条', { indent: 400, size: SIZE_SMALL }),
        emptyLine(),

        // ── Ⅶ 賃金 ───────────────────────────────────
        sectionHeading('Ⅶ．賃金'),
        para([
          run(`１．基本賃金　${CHECK(c?.wage_type === 'monthly')} 月給（${c?.wage_type === 'monthly' ? YEN(c?.basic_wage) : BLANK}）　`),
          run(`${CHECK(c?.wage_type === 'daily')} 日給（${c?.wage_type === 'daily' ? YEN(c?.basic_wage) : BLANK}）　`),
          run(`${CHECK(c?.wage_type === 'hourly')} 時間給（${c?.wage_type === 'hourly' ? YEN(c?.basic_wage) : BLANK}）`),
        ], { indent: 200 }),
        para('　※詳細は別紙のとおり', { indent: 400, size: SIZE_SMALL }),
        para(
          `２．諸手当（時間外労働の割増賃金は除く）　（${mainAllowanceLabel}）`,
          { indent: 200 },
        ),
        para('　※詳細は別紙のとおり', { indent: 400, size: SIZE_SMALL }),
        para('３．所定時間外，休日又は深夜労働に対して支払われる割増賃金率', { indent: 200 }),
        para([
          run(`　(1) 所定時間外　法定超月60時間以内（${V(c?.overtime_rate_under60)}%）　法定超月60時間超（${V(c?.overtime_rate_over60)}%）　所定超（${V(c?.overtime_rate_prescribed)}%）`),
        ], { indent: 400 }),
        para(`　(2) 休日　法定休日（${V(c?.holiday_rate_statutory)}%）　法定外休日（${V(c?.holiday_rate_non_statutory)}%）`, { indent: 400 }),
        para(`　(3) 深夜（${V(c?.late_night_rate)}%）`, { indent: 400 }),
        para(`４．賃金締切日　毎月${V(c?.wage_cutoff_day)}日`, { indent: 200 }),
        para(`５．賃金支払日　毎月${V(c?.wage_payment_day)}日`, { indent: 200 }),
        para(`６．賃金支払方法　${CHECK(c?.wage_payment_method === 'bank')} 口座振込　${CHECK(c?.wage_payment_method === 'cash')} 通貨払`, { indent: 200 }),
        para(
          `７．労使協定に基づく賃金支払時の控除　${CHECK(c?.wage_deduction_agreement === false)} 無　${CHECK(c?.wage_deduction_agreement)} 有　※詳細は別紙のとおり`,
          { indent: 200 },
        ),
        para(`８．昇給　${CHECK(c?.salary_increase_exists)} 有（${V(c?.salary_increase_details)}）　${CHECK(c?.salary_increase_exists === false)} 無`, { indent: 200 }),
        para(`９．賞与　${CHECK(c?.bonus_exists)} 有（${V(c?.bonus_details)}）　${CHECK(c?.bonus_exists === false)} 無`, { indent: 200 }),
        para(`10．退職金　${CHECK(c?.severance_pay_exists)} 有（${V(c?.severance_pay_details)}）　${CHECK(c?.severance_pay_exists === false)} 無`, { indent: 200 }),
        para(`11．休業手当　${CHECK(c?.work_injury_allowance_exists)} 有（率：${V(c?.work_injury_allowance_rate)}）　${CHECK(c?.work_injury_allowance_exists === false)} 無`, { indent: 200 }),
        emptyLine(),

        // ── Ⅷ 退職に関する事項 ───────────────────────
        sectionHeading('Ⅷ．退職に関する事項'),
        para('１．自己都合退職の手続（退職する30日前に社長・工場長等に届けること）', { indent: 200 }),
        para('２．解雇の事由及び手続', { indent: 200 }),
        para(
          '　解雇は，やむを得ない事由がある場合に限り少なくとも30日前に予告をするか，又は30日分以上の平均賃金を支払って解雇する。特定技能外国人の責めに帰すべき事由に基づいて解雇する場合には，所轄労働基準監督署長の認定を受けることにより予告も平均賃金の支払も行わず即時解雇されることもあり得る。',
          { indent: 400, size: SIZE_SMALL },
        ),
        para('○詳細は，就業規則　第　　条～第　　条，第　　条～第　　条', { indent: 400, size: SIZE_SMALL }),
        emptyLine(),

        // ── Ⅸ その他 ─────────────────────────────────
        sectionHeading('Ⅸ．その他'),
        para(`１．社会保険の加入状況・労働保険の適用状況（${insuranceText}）`, { indent: 200 }),
        para(`２．雇入れ時の健康診断　${V(c?.health_checkup_on_hire)}`, { indent: 200 }),
        para(`３．初回の定期健康診断　${V(c?.health_checkup_first)}　（その後　${V(c?.health_checkup_interval, '1年ごと')}に実施）`, { indent: 200 }),
        para(
          '４．本契約終了後に乙が帰国するに当たり，乙が帰国旅費を負担することができないときは，甲が当該旅費を負担するとともに，帰国が円滑になされるよう必要な措置を講じることとする。',
          { indent: 200 },
        ),
        emptyLine(),
        emptyLine(),

        // ── 受取人署名欄 ──────────────────────────────
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [run('受取人（署名）　　　　　　　　　　　　　　　　　　　　')],
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: '000000' } },
          spacing: { before: 400, after: 40 },
        }),

        // ══════════════════════════════════════════════════════
        // 別紙（賃金の支払）── ページブレーク後
        // ══════════════════════════════════════════════════════
        new Paragraph({
          children: [new PageBreak()],
          spacing: { after: 0 },
        }),

        // 別紙ヘッダー
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [run('参考様式第１－６号　別紙', { size: SIZE_SMALL })],
          spacing: { after: 200 },
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [run('賃金の支払', { bold: true, size: 28 })],
          spacing: { after: 200 },
        }),

        // 1. 基本賃金
        sectionHeading('１．基本賃金'),
        para([
          run(`${CHECK(c?.wage_type === 'monthly')} 月給（${c?.wage_type === 'monthly' ? YEN(c?.basic_wage) : BLANK}）　`),
          run(`${CHECK(c?.wage_type === 'daily')} 日給（${c?.wage_type === 'daily' ? YEN(c?.basic_wage) : BLANK}）　`),
          run(`${CHECK(c?.wage_type === 'hourly')} 時間給（${c?.wage_type === 'hourly' ? YEN(c?.basic_wage) : BLANK}）`),
        ], { indent: 200 }),
        para(
          `※月給・日給の場合の１時間当たりの金額（${BLANK}円）`,
          { indent: 200, size: SIZE_SMALL },
        ),
        para(
          `※日給・時給の場合の１か月当たりの金額（${BLANK}円）`,
          { indent: 200, size: SIZE_SMALL },
        ),

        // 2. 諸手当
        sectionHeading('２．諸手当の額及び計算方法（時間外労働の割増賃金は除く。）'),
        ...beppiAllowanceRows,

        // 3. 概算額
        sectionHeading('３．１か月当たりの支払概算額（１＋２）'),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [run(monthlyEstimate != null
            ? `約 ${monthlyEstimate.toLocaleString('ja-JP')}円（合計）`
            : `約${BLANK}円（合計）`,
          )],
          spacing: { after: 60 },
        }),

        // 4. 控除項目
        sectionHeading('４．賃金支払時に控除する項目'),
        para(`　(a) 税　　　金　　　　　　　（${YEN_APPROX(c?.deduction_tax)}）`, { indent: 200 }),
        para(`　(b) 社会保険料　　　　　　　（${YEN_APPROX(c?.deduction_social_insurance)}）`, { indent: 200 }),
        para(`　(c) 雇用保険料　　　　　　　（${YEN_APPROX(c?.deduction_employment_insurance)}）`, { indent: 200 }),
        para(`　(d) 食　　　費　　　　　　　（${YEN_APPROX(c?.deduction_food)}）`, { indent: 200 }),
        para(`　(e) 居　住　費　　　　　　　（${YEN_APPROX(c?.deduction_housing)}）`, { indent: 200 }),
        para(`　(f) その他（水道光熱費）　　（${YEN_APPROX(c?.deduction_utilities)}）`, { indent: 200 }),
        para(
          `　　　（${V(c?.deduction_other_1_name, '　　　　　　')}）　（${YEN_APPROX(c?.deduction_other_1_amount)}）`,
          { indent: 200 },
        ),
        para(
          `　　　（${V(c?.deduction_other_2_name, '　　　　　　')}）　（${YEN_APPROX(c?.deduction_other_2_amount)}）`,
          { indent: 200 },
        ),
        emptyLine(),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [run(deductionsTotal != null
            ? `控除する金額　　約 ${deductionsTotal.toLocaleString('ja-JP')}円（合計）`
            : `控除する金額　　約${BLANK}円（合計）`,
          )],
          spacing: { after: 60 },
        }),

        // 5. 手取り支給額
        sectionHeading('５．手取り支給額（３－４）'),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [run(takehome != null
            ? `約 ${takehome.toLocaleString('ja-JP')}円（合計）`
            : `約${BLANK}円（合計）`,
          )],
          spacing: { after: 60 },
        }),
        emptyLine(),
        para(
          '※欠勤等がない場合であって，時間外労働の割増賃金等は除く。',
          { size: SIZE_SMALL },
        ),
      ],
    }],
  })

  return Buffer.from(await Packer.toBuffer(doc))
}
