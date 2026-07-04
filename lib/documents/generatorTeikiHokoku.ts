import ExcelJS from 'exceljs'
import path from 'path'
import type { TeikiHokokuData, LaborStats } from './templates/teikiHokoku'

const TEMPLATE_PATH = path.join(process.cwd(), 'lib/documents/templates/form-3-6.xlsx')

function round1(n: number) { return Math.round(n * 10) / 10 }

/**
 * 「平均　XX　単位」形式でセルに書き込む
 * 値が null の場合はスキップ（テンプレートテキストを維持）
 */
function writeAvg(ws: ExcelJS.Worksheet, addr: string, val: number | null, unit: string, decimals = 1) {
  if (val == null) return
  const n = decimals === 0 ? String(Math.round(val)) : round1(val).toFixed(decimals)
  ws.getCell(addr).value = `平均　${n}　${unit}`
}

/** 人数セルに書き込む（元テキスト「人」を数値で上書き） */
function writeCount(ws: ExcelJS.Worksheet, addr: string, count: number) {
  ws.getCell(addr).value = count
}

/** 1号(F列)と2号(M列)に同じ種類の値を書き込む */
function writeStats(ws: ExcelJS.Worksheet, row: number, s1: LaborStats, s2: LaborStats,
  getter: (s: LaborStats) => number | null, unit: string, decimals = 1) {
  writeAvg(ws, `F${row}`, getter(s1), unit, decimals)
  writeAvg(ws, `M${row}`, getter(s2), unit, decimals)
}

export async function generateTeikiHokoku(data: TeikiHokokuData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(TEMPLATE_PATH)
  const ws = wb.worksheets[0]

  ws.views = [{ state: 'normal' }]

  const { org, fiscal_year: fy, total, gou1, gou2, created_date } = data

  // ① 届出対象期間（行13）
  ws.getCell('F13').value = `${fy}年４月１日　～　${fy + 1}年３月３１日`

  // ② 特定技能所属機関（行14-21）
  if (org) {
    if (org.legal_person_number) ws.getCell('F14').value = org.legal_person_number
    if (org.industry_field)      ws.getCell('F15').value = org.industry_field
    if (org.name_kana)           ws.getCell('F16').value = org.name_kana
    ws.getCell('F17').value = org.name

    if (org.postal_code) {
      const zip = org.postal_code.replace(/[^0-9]/g, '')
      ws.getCell('F19').value = zip.length >= 7
        ? `〒${zip.slice(0, 3)}-${zip.slice(3, 7)}`
        : `〒${org.postal_code}`
    }
    if (org.address) ws.getCell('F20').value = org.address
    if (org.phone)   ws.getCell('F21').value = `（電話　${org.phone}）`
  }

  // ③ 報告対象外国人数（行24）
  writeCount(ws, 'F24', total.count)
  writeCount(ws, 'M24', gou1.count)
  writeCount(ws, 'Q24', gou2.count)

  // ④ 労働条件等 — 1号(F列) / 2号(M列)
  // (1) 実労働日数
  writeStats(ws, 27, gou1, gou2, s => s.avg_working_days, '日／月', 1)
  // (2) 所定内実労働時間
  writeStats(ws, 28, gou1, gou2, s => s.avg_scheduled_hours, '時間／月', 1)
  // (3) 超過実労働時間
  writeStats(ws, 29, gou1, gou2, s => s.avg_overtime_hours, '時間／月', 1)
  // (4) 現金給与額
  writeStats(ws, 30, gou1, gou2, s => s.avg_gross_pay, '円／月', 0)
  // (4)-① 超過労働給与額
  writeStats(ws, 31, gou1, gou2, s => s.avg_overtime_wages, '円／月', 0)
  // (4)-② 通勤手当
  writeStats(ws, 32, gou1, gou2, s => s.avg_commuting, '円／月', 0)
  // (5) 賞与等特別給与額（年間）
  writeStats(ws, 35, gou1, gou2, s => s.avg_bonus, '円', 0)
  // (6)-③ 税・社会保険料
  writeStats(ws, 39, gou1, gou2, s => s.avg_tax_insurance, '円／月', 0)
  // (6)-④ その他控除
  writeStats(ws, 40, gou1, gou2, s => s.avg_other_deduction, '円／月', 0)

  // ⑤ 担当者（行45）
  if (org?.contact_person) ws.getCell('D45').value = org.contact_person
  if (org?.contact_phone)  ws.getCell('M45').value = org.contact_phone

  // ⑥ 作成年月日（行51）
  const d = new Date(created_date)
  ws.getCell('I51').value = d.getFullYear()
  ws.getCell('M51').value = d.getMonth() + 1
  ws.getCell('Q51').value = d.getDate()

  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}
