/**
 * 雇用条件書（参考様式第1-6号）── 公式docxテンプレート差し込み方式
 *
 * 旧 generator.ts は `docx` ライブラリで文書をコード組立していたため公式様式の
 * 「近似再現」に留まっていた。本実装は令和6年4月改正版の公式ファイルに
 * {{ }} プレースホルダを埋め込んだ koyo_joken_sho_template.docx へ値を差し込む。
 * 罫線・フォント・段組みは公式ファイルそのもの（テンプレは書き換えない）。
 *
 * ライブラリ: docx-templates (MIT) / cmdDelimiter: ['{{','}}']
 * 差し込み規約（対応表§0）:
 *   - チェックボックスは boolean ではなく '☑' / '□' の文字列
 *   - 値が無い項目は '' を渡す（undefined は "undefined" と印字されるため禁止）
 *   - 単位（円/％/時/分/日/年）はテンプレ本文側に既にあるため、値は数値のみ
 */
import { readFile } from 'fs/promises'
import path from 'path'
import { createReport } from 'docx-templates'
import type { KoyouJokenData } from './templates/koyouJoken'

const TEMPLATE_PATH = path.join(process.cwd(), 'lib/documents/templates/koyo_joken_sho_template.docx')

// ── 差し込みヘルパー ────────────────────────────────────────
/** 文字列化。null/undefined/'' は '' */
const s = (v: unknown): string =>
  v === null || v === undefined || v === '' ? '' : String(v)

/** チェックボックス文字。真なら ☑、偽/不明なら □ */
const cb = (v: boolean | null | undefined): string => (v === true ? '☑' : '□')

/** 金額（千区切り・整数）。null は '' */
const yen = (v: number | null | undefined): string =>
  v === null || v === undefined ? '' : Math.round(v).toLocaleString('ja-JP')

/** 数値（率・日数・時間等、整数）。null は '' */
const num = (v: number | null | undefined): string =>
  v === null || v === undefined ? '' : String(Math.round(v))

/** "YYYY-MM-DD" → { nen, tsuki, hi }（各数値文字列、無効なら空） */
function splitDate(iso: string | null | undefined): { nen: string; tsuki: string; hi: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s(iso))
  if (!m) return { nen: '', tsuki: '', hi: '' }
  return { nen: String(+m[1]), tsuki: String(+m[2]), hi: String(+m[3]) }
}

/** "YYYY-MM" → { nen, tsuki } */
function splitMonth(ym: string | null | undefined): { nen: string; tsuki: string } {
  const m = /^(\d{4})-(\d{2})/.exec(s(ym))
  if (!m) return { nen: '', tsuki: '' }
  return { nen: String(+m[1]), tsuki: String(+m[2]) }
}

/** "HH:MM" → { ji, fun } */
function splitTime(t: string | null | undefined): { ji: string; fun: string } {
  const m = /^(\d{1,2}):(\d{2})/.exec(s(t))
  if (!m) return { ji: '', fun: '' }
  return { ji: String(+m[1]), fun: String(+m[2]) }
}

/**
 * A5: 定例日の整形（出力側のみ。DBは変更しない）。
 * テンプレは「毎週{{teireibi_yobi}}曜日、日本の国民の祝日、その他（{{teireibi_sonota}}）」。
 *  - 「祝日」等は様式に既に印字済みのため除去（{{teireibi_yobi}}には入れない）
 *  - 曜日名は「曜日」「曜」を落とした素の文字（月〜日）だけを yobi に残す
 *  - 曜日でも祝日でもない語は sonota へ回す
 */
function formatTeireibi(raw: string | null | undefined): { yobi: string; sonota: string } {
  const src = s(raw)
  if (!src) return { yobi: '', sonota: '' }
  const tokens = src.split(/[、,，・/／\s]+/).map(t => t.trim()).filter(Boolean)
  const yobi: string[] = []
  const sonota: string[] = []
  for (const tok of tokens) {
    const t = tok.replace(/^毎週/, '')
    if (/祝/.test(t)) continue // 祝日・国民の祝日・日本の国民の祝日 等はテンプレ側に印字済み
    const bare = t.replace(/曜日|曜/g, '')
    if (/^[月火水木金土日]$/.test(bare)) yobi.push(bare)
    else if (t) sonota.push(t)
  }
  return { yobi: yobi.join('・'), sonota: sonota.join('、') }
}

/**
 * 別紙用の1時間当たり／1か月当たり金額の算出（A6：最賃適合性の根拠欄）。
 * どの所定労働時間列を分母に使ったかは呼び出し側でログ報告する。
 */
function calcWageConversions(c: KoyouJokenData['conditions']) {
  if (!c || c.basic_wage == null) return { jikan_atari: '', tsuki_atari: '', memo: 'basic_wage が null のため未算出' }

  const wage = c.basic_wage
  // 月平均所定労働時間（最賃適合性の根拠。誤差は安全側＝時間単価が高めに出ない算式を採用）。
  // 優先: ① 年所定/12（暦を反映し最も正確） → ② 月所定（概数入力されやすい）
  //       → ③ 週所定×365/7/12（1年=365日換算。×52/12 は1年=364日で分母が小さくなるため不採用）
  const monthlyHours =
    c.annual_scheduled_hours != null ? c.annual_scheduled_hours / 12
    : c.monthly_scheduled_hours != null ? c.monthly_scheduled_hours
    : c.weekly_scheduled_hours != null ? (c.weekly_scheduled_hours * 365) / 7 / 12
    : null
  const monthlyHoursSrc =
    c.annual_scheduled_hours != null ? 'annual_scheduled_hours / 12'
    : c.monthly_scheduled_hours != null ? 'monthly_scheduled_hours'
    : c.weekly_scheduled_hours != null ? 'weekly_scheduled_hours × 365 / 7 / 12'
    : '(該当列なし)'

  let jikan_atari = ''
  let tsuki_atari = ''
  let memo = ''

  if (c.wage_type === 'monthly') {
    // 月給 → 1時間当たり = 月給 ÷ 月平均所定労働時間
    if (monthlyHours && monthlyHours > 0) jikan_atari = num(wage / monthlyHours)
    memo = `月給: jikan_atari = basic_wage ÷ [${monthlyHoursSrc}]（分母=${monthlyHours ?? 'なし'}h）`
  } else if (c.wage_type === 'daily') {
    // 日給 → 1時間当たり = 日給 ÷ 1日所定労働時間、1か月当たり = 日給 × 月所定労働日数
    if (c.daily_scheduled_hours && c.daily_scheduled_hours > 0) jikan_atari = num(wage / c.daily_scheduled_hours)
    if (c.monthly_scheduled_days != null) tsuki_atari = yen(wage * c.monthly_scheduled_days)
    memo = `日給: jikan_atari = basic_wage ÷ daily_scheduled_hours（=${c.daily_scheduled_hours ?? 'なし'}h）／ tsuki_atari = basic_wage × monthly_scheduled_days（=${c.monthly_scheduled_days ?? 'なし'}日）`
  } else if (c.wage_type === 'hourly') {
    // 時間給 → 1か月当たり = 時給 × 月平均所定労働時間
    if (monthlyHours && monthlyHours > 0) tsuki_atari = yen(wage * monthlyHours)
    memo = `時間給: tsuki_atari = basic_wage × [${monthlyHoursSrc}]（分母=${monthlyHours ?? 'なし'}h）`
  }
  return { jikan_atari, tsuki_atari, memo }
}

/** 全213プレースホルダを構築（欠損はすべて ''）。algoDetail は分母報告用。 */
export function buildKoyouJokenPlaceholders(
  data: KoyouJokenData,
): { values: Record<string, string>; calcMemo: string } {
  const { worker, org, conditions: c, contract } = data

  const today = new Date()
  const sakusei = { nen: String(today.getFullYear()), tsuki: String(today.getMonth() + 1), hi: String(today.getDate()) }

  const start = splitDate(contract?.contract_start_date)
  const end = splitDate(contract?.contract_end_date)
  const nyukoku = splitDate(contract?.planned_entry_date)
  const mukiTenkan = splitDate(contract?.muki_tenkan_date)
  const shigyo = splitTime(c?.work_start_time)
  const shuugyou = splitTime(c?.work_end_time)
  const shift1s = splitTime(c?.shift1_start_time), shift1e = splitTime(c?.shift1_end_time)
  const shift2s = splitTime(c?.shift2_start_time), shift2e = splitTime(c?.shift2_end_time)
  const shift3s = splitTime(c?.shift3_start_time), shift3e = splitTime(c?.shift3_end_time)
  const kenshinHire = splitMonth(c?.health_checkup_on_hire)
  const kenshinFirst = splitMonth(c?.health_checkup_first)

  // 別紙 概算額（B1: 固定残業代は含めない。基本賃金 + 諸手当(a〜d)のみ）
  const allowanceSum =
    (c?.allowance_1_amount ?? 0) + (c?.allowance_2_amount ?? 0) +
    (c?.allowance_3_amount ?? 0) + (c?.allowance_4_amount ?? 0)
  const gaisanNum = c?.basic_wage != null ? c.basic_wage + allowanceSum : null

  // 別紙 控除合計・手取り
  const deds = [
    c?.deduction_tax, c?.deduction_social_insurance, c?.deduction_employment_insurance,
    c?.deduction_food, c?.deduction_housing, c?.deduction_utilities,
    c?.deduction_other_1_amount, c?.deduction_other_2_amount,
  ]
  const dedPresent = deds.some(v => v != null)
  const dedSum = deds.reduce<number>((sum, v) => sum + (v ?? 0), 0)
  const tedoriNum = gaisanNum != null ? gaisanNum - (dedPresent ? dedSum : 0) : null

  // A6 換算額
  const conv = calcWageConversions(c)

  const V: Record<string, string> = {
    // ── ヘッダー ──
    sakusei_nen: sakusei.nen, sakusei_tsuki: sakusei.tsuki, sakusei_hi: sakusei.hi,
    gaikokujin_shimei: s(worker.name_kanji) || s(worker.name_romaji),
    kikan_mei: s(org?.name),
    kikan_shozaichi: s(org?.address),
    kikan_denwa: s(org?.phone),
    kikan_daihyo: `${s(org?.representative_title)} ${s(org?.representative_name)}`.trim(),

    // ── Ⅰ 雇用契約期間 ──
    keiyaku_kaishi_nen: start.nen, keiyaku_kaishi_tsuki: start.tsuki, keiyaku_kaishi_hi: start.hi,
    keiyaku_shuryo_nen: end.nen, keiyaku_shuryo_tsuki: end.tsuki, keiyaku_shuryo_hi: end.hi,
    nyukoku_nen: nyukoku.nen, nyukoku_tsuki: nyukoku.tsuki, nyukoku_hi: nyukoku.hi,
    cb_koshin_jido: cb(contract?.contract_renewal_type === 'auto'),
    cb_koshin_ariuru: cb(contract?.contract_renewal_type === 'possible'),
    cb_koshin_shinai: cb(contract?.contract_renewal_type === 'none'),
    cb_kijun_gyomuryo: cb(contract?.renewal_criteria_workload),
    cb_kijun_seiseki: cb(contract?.renewal_criteria_performance),
    cb_kijun_noryoku: cb(contract?.renewal_criteria_ability),
    cb_kijun_keiei: cb(contract?.renewal_criteria_company),
    cb_kijun_shinchoku: cb(contract?.renewal_criteria_progress),
    cb_kijun_sonota: cb(contract?.renewal_criteria_other),
    kijun_sonota_naiyo: s(contract?.renewal_criteria_other_text),
    koshin_jogen_umu: contract?.renewal_limit_exists === true ? '有' : contract?.renewal_limit_exists === false ? '無' : '',
    koshin_jogen_kaisu: num(contract?.renewal_limit_count),
    koshin_jogen_nensu: num(contract?.renewal_limit_years),
    muki_tenkan_nen: mukiTenkan.nen, muki_tenkan_tsuki: mukiTenkan.tsuki, muki_tenkan_hi: mukiTenkan.hi,
    muki_joken_henko_umu: contract?.muki_conditions_change_exists === true ? '有' : contract?.muki_conditions_change_exists === false ? '無' : '',

    // ── Ⅱ 就業の場所 ──
    cb_chokusetsu_koyo: cb(c?.workplace_type === 'direct'),
    cb_haken_koyo: cb(c?.workplace_type === 'dispatch'),
    shugyo_basho_jigyosho_mei: s(c?.workplace_name),
    shugyo_basho_shozaichi: s(c?.workplace_address),
    shugyo_basho_renrakusaki: s(c?.workplace_phone),
    cb_shugyo_basho_henko_nashi: cb(c?.workplace_change_none),
    shugyo_basho_henko_jigyosho_mei: s(c?.workplace_change_name),
    shugyo_basho_henko_shozaichi: s(c?.workplace_change_address),
    shugyo_basho_henko_renrakusaki: s(c?.workplace_change_phone),

    // ── Ⅲ 従事すべき業務の内容 ──
    bunya: s(c?.industry_field),
    gyomu_kubun: s(c?.job_category),
    cb_gyomu_henko_nashi: cb(c?.job_change_none),
    bunya_henko: s(c?.job_change_field),
    gyomu_kubun_henko: s(c?.job_change_category),

    // ── Ⅳ 労働時間等 ──
    shigyo_ji: shigyo.ji, shigyo_fun: shigyo.fun,
    shuugyou_ji: shuugyou.ji, shuugyou_fun: shuugyou.fun,
    shotei_1nichi_jikan: num(c?.daily_scheduled_hours), shotei_1nichi_fun: num(c?.daily_scheduled_minutes),
    cb_hensei_rodo: cb(c?.henkou_roudou_jikan),
    hensei_tani: s(c?.henkou_roudou_jikan_unit),
    cb_kotaisei: cb(c?.kotai_sei),
    kotai1_shigyo_ji: shift1s.ji, kotai1_shigyo_fun: shift1s.fun,
    kotai1_shuugyou_ji: shift1e.ji, kotai1_shuugyou_fun: shift1e.fun,
    kotai1_tekiyobi: s(c?.shift1_days), kotai1_jikan: num(c?.shift1_daily_hours), kotai1_fun: num(c?.shift1_daily_minutes),
    kotai2_shigyo_ji: shift2s.ji, kotai2_shigyo_fun: shift2s.fun,
    kotai2_shuugyou_ji: shift2e.ji, kotai2_shuugyou_fun: shift2e.fun,
    kotai2_tekiyobi: s(c?.shift2_days), kotai2_jikan: num(c?.shift2_daily_hours), kotai2_fun: num(c?.shift2_daily_minutes),
    kotai3_shigyo_ji: shift3s.ji, kotai3_shigyo_fun: shift3s.fun,
    kotai3_shuugyou_ji: shift3e.ji, kotai3_shuugyou_fun: shift3e.fun,
    kotai3_tekiyobi: s(c?.shift3_days), kotai3_jikan: num(c?.shift3_daily_hours), kotai3_fun: num(c?.shift3_daily_minutes),
    kyukei_fun: num(c?.break_minutes),
    shotei_shu_jikan: num(c?.weekly_scheduled_hours), shotei_shu_fun: num(c?.weekly_scheduled_minutes),
    shotei_tsuki_jikan: num(c?.monthly_scheduled_hours), shotei_tsuki_fun: '', // 月の「分」列はDB非保持（C群）
    shotei_nen_jikan: num(c?.annual_scheduled_hours), shotei_nen_fun: '',     // 年の「分」列はDB非保持（C群）
    nissu_shu: num(c?.weekly_scheduled_days), nissu_tsuki: num(c?.monthly_scheduled_days), nissu_nen: num(c?.annual_scheduled_days),
    cb_jikangai_ari: cb(c?.overtime_exists === true),
    cb_jikangai_nashi: cb(c?.overtime_exists === false),
    // 就業規則の条文番号（A1: DB入力欄なし → 空欄。次回DB追加候補）
    kisoku_rodo_1a: '', kisoku_rodo_1b: '', kisoku_rodo_2a: '', kisoku_rodo_2b: '', kisoku_rodo_3a: '', kisoku_rodo_3b: '',

    // ── Ⅴ 休日 ──
    // A5: regular_holiday_days を整形。曜日名のみ→teireibi_yobi、祝日語は除去（様式に印字済）、
    //     曜日でも祝日でもない語→teireibi_sonota（出力側整形のみ・DB非変更）
    teireibi_yobi: formatTeireibi(c?.regular_holiday_days).yobi,
    teireibi_sonota: formatTeireibi(c?.regular_holiday_days).sonota,
    nenkan_kyujitsu: num(c?.annual_holiday_days),
    // A5: irregular_holiday_info→hiteireibi_sonota（自由記述欄）／hiteireibi_hi は空
    hiteireibi_hi: '', hiteireibi_sonota: s(c?.irregular_holiday_info),
    kisoku_kyujitsu_1a: '', kisoku_kyujitsu_1b: '', kisoku_kyujitsu_2a: '', kisoku_kyujitsu_2b: '',

    // ── Ⅵ 休暇 ──
    nenkyu_6kagetsu: num(c?.annual_paid_leave_days),
    // 6か月未満の年休（A4: DB非保持 → □＋空欄）
    cb_nenkyu_miman_ari: '□', cb_nenkyu_miman_nashi: '□',
    nenkyu_miman_kagetsu: '', nenkyu_miman_hi: '',
    sonota_kyuka_yukyu: s(c?.other_paid_leave), sonota_kyuka_mukyu: s(c?.other_unpaid_leave),
    kisoku_kyuka_1a: '', kisoku_kyuka_1b: '', kisoku_kyuka_2a: '', kisoku_kyuka_2b: '',

    // ── Ⅶ 賃金（本体） ── ※基本賃金は固定残業代を含まない額（basic_wage をそのまま）
    cb_kihon_gekkyu: cb(c?.wage_type === 'monthly'),
    cb_kihon_nikkyu: cb(c?.wage_type === 'daily'),
    cb_kihon_jikyu: cb(c?.wage_type === 'hourly'),
    kihon_gekkyu_gaku: c?.wage_type === 'monthly' ? yen(c?.basic_wage) : '',
    kihon_nikkyu_gaku: c?.wage_type === 'daily' ? yen(c?.basic_wage) : '',
    kihon_jikyu_gaku: c?.wage_type === 'hourly' ? yen(c?.basic_wage) : '',
    teate_mei_1: s(c?.allowance_1_name), teate_mei_2: s(c?.allowance_2_name), teate_mei_3: s(c?.allowance_3_name),
    // ↑ 本体は名称3枠のみ。4つ目の手当名称は別紙 teate_d に出す（B3）
    wari_jikangai_60ika: num(c?.overtime_rate_under60),
    wari_jikangai_60koe: num(c?.overtime_rate_over60),
    wari_shoteicho: num(c?.overtime_rate_prescribed),
    wari_hotei_kyujitsu: num(c?.holiday_rate_statutory),
    wari_hoteigai_kyujitsu: num(c?.holiday_rate_non_statutory),
    wari_shinya: num(c?.late_night_rate),
    cb_shimebi_1: c?.wage_cutoff_day != null ? '☑' : '□', shimebi_1: num(c?.wage_cutoff_day),
    cb_shimebi_2: '□', shimebi_2: '',
    cb_shiharaibi_1: c?.wage_payment_day != null ? '☑' : '□', shiharaibi_1: num(c?.wage_payment_day),
    cb_shiharaibi_2: '□', shiharaibi_2: '',
    cb_kouza_furikomi: cb(c?.wage_payment_method === 'bank'),
    cb_tsuka_barai: cb(c?.wage_payment_method === 'cash'),
    cb_kojo_nashi: cb(c?.wage_deduction_agreement === false),
    cb_kojo_ari: cb(c?.wage_deduction_agreement === true),
    cb_shokyu_ari: cb(c?.salary_increase_exists === true), cb_shokyu_nashi: cb(c?.salary_increase_exists === false),
    shokyu_naiyo: s(c?.salary_increase_details),
    cb_shoyo_ari: cb(c?.bonus_exists === true), cb_shoyo_nashi: cb(c?.bonus_exists === false),
    shoyo_naiyo: s(c?.bonus_details),
    cb_taishokukin_ari: cb(c?.severance_pay_exists === true), cb_taishokukin_nashi: cb(c?.severance_pay_exists === false),
    taishokukin_naiyo: s(c?.severance_pay_details),
    // B2: カラム名は work_injury_allowance（労災）だが、様式の該当項目は「休業手当」。
    //     名称がずれている点に留意（DB列名＝労災allowance ／ 帳票項目＝休業手当）。
    cb_kyugyo_teate_ari: cb(c?.work_injury_allowance_exists === true),
    kyugyo_teate_ritsu: s(c?.work_injury_allowance_rate),

    // ── Ⅷ 退職に関する事項 ──
    // A2: 自己都合退職の申出日数は労働条件そのもの。システムが固定値を決めず空欄で出す（次回DB追加候補）
    jiko_tsugo_hizen: '',
    kisoku_taishoku_1a: '', kisoku_taishoku_1b: '', kisoku_taishoku_2a: '', kisoku_taishoku_2b: '',

    // ── Ⅸ その他 ──
    cb_kosei_nenkin: cb(c?.insurance_kosei_nenkin),
    cb_kenko_hoken: cb(c?.insurance_kenko),
    cb_koyo_hoken: cb(c?.insurance_koyo),
    cb_rosai_hoken: cb(c?.insurance_rousai),
    cb_kokumin_nenkin: cb(c?.insurance_kokumin_nenkin),
    cb_kokumin_kenko: cb(c?.insurance_kokumin_kenko),
    cb_hoken_sonota: '□', hoken_sonota_naiyo: '', // A3: その他保険はDB非保持 → □＋空欄
    kenshin_yatoiire_nen: kenshinHire.nen, kenshin_yatoiire_tsuki: kenshinHire.tsuki,
    kenshin_shokai_nen: kenshinFirst.nen, kenshin_shokai_tsuki: kenshinFirst.tsuki,
    kenshin_kankaku: s(c?.health_checkup_interval),
    madoguchi_busho: s(c?.consultation_desk_dept),
    madoguchi_tantosha: s(c?.consultation_desk_person),
    madoguchi_renrakusaki: s(c?.consultation_desk_contact),
    kisoku_kakunin_basho: s(c?.work_rules_location),

    // ── 別紙1「賃金の支払」 ──
    // ※ cb_kihon_* / kihon_*_gaku は本体と同名（同一値が両所に入り整合保証）
    jikan_atari_gaku: conv.jikan_atari, // A6: 月給・日給の1時間当たり額（算出）
    tsuki_atari_gaku: conv.tsuki_atari, // A6: 日給・時間給の1か月当たり額（算出）
    teate_a_mei: s(c?.allowance_1_name), teate_a_gaku: yen(c?.allowance_1_amount), teate_a_keisan: s(c?.allowance_1_calc_method),
    teate_b_mei: s(c?.allowance_2_name), teate_b_gaku: yen(c?.allowance_2_amount), teate_b_keisan: s(c?.allowance_2_calc_method),
    teate_c_mei: s(c?.allowance_3_name), teate_c_gaku: yen(c?.allowance_3_amount), teate_c_keisan: s(c?.allowance_3_calc_method),
    teate_d_mei: s(c?.allowance_4_name), teate_d_gaku: yen(c?.allowance_4_amount), teate_d_keisan: s(c?.allowance_4_calc_method),
    // (e) 固定残業代（諸手当a〜dとは別枠。時間外割増の前払いのため概算額には加算しない=B1）
    kotei_zangyo_mei: s(c?.fixed_overtime_name),
    kotei_zangyo_gaku: yen(c?.fixed_overtime_amount),
    kotei_zangyo_jikan: num(c?.fixed_overtime_hours),
    kotei_zangyo_choka_jikan: num(c?.fixed_overtime_threshold_hours),
    // 3. 概算額（1+2）= 基本賃金 + 諸手当(a〜d)。固定残業代は含めない（B1）
    shiharai_gaisan: yen(gaisanNum),
    // 4. 控除項目
    kojo_zeikin: yen(c?.deduction_tax),
    kojo_shakai_hoken: yen(c?.deduction_social_insurance),
    kojo_koyo_hoken: yen(c?.deduction_employment_insurance),
    kojo_shokuhi: yen(c?.deduction_food),
    kojo_kyojuhi: yen(c?.deduction_housing),
    kojo_suido_konetsu: yen(c?.deduction_utilities),
    kojo_sonota_1_mei: s(c?.deduction_other_1_name), kojo_sonota_1_gaku: yen(c?.deduction_other_1_amount),
    kojo_sonota_2_mei: s(c?.deduction_other_2_name), kojo_sonota_2_gaku: yen(c?.deduction_other_2_amount),
    kojo_sonota_3_mei: '', kojo_sonota_3_gaku: '', // 控除その他はDB2枠のみ（C群）
    kojo_sonota_4_mei: '', kojo_sonota_4_gaku: '',
    kojo_sonota_5_mei: '', kojo_sonota_5_gaku: '',
    kojo_gokei: dedPresent ? yen(dedSum) : '',
    // 5. 手取り支給額（3−4）
    tedori_gokei: yen(tedoriNum),
  }

  return { values: V, calcMemo: conv.memo }
}

/** 公式docxテンプレートへ差し込んで .docx バッファを返す */
export async function generateKoyouJokenTemplate(data: KoyouJokenData): Promise<Buffer> {
  const template = await readFile(TEMPLATE_PATH)
  const { values } = buildKoyouJokenPlaceholders(data)

  const buf = await createReport({
    template,
    data: values,
    cmdDelimiter: ['{{', '}}'],
    // 全キーを '' 込みで供給済みだが、万一の nullish も空文字にする
    rejectNullish: false,
    failFast: true,
    // プレーンな値差し込みのみ。追加JSコンテキストは不要
  })

  return Buffer.from(buf)
}
