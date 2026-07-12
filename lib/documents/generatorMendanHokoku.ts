import ExcelJS from 'exceljs'
import path from 'path'
import { INTERVIEW_ITEMS, type InterviewItemKey, type ItemCheck, type StaffRole } from '@/lib/supportTasks'

const TEMPLATE_PATH = path.join(process.cwd(), 'lib/documents/templates/mendan-hokoku-5-5.xlsx')

export type MendanHokokuData = {
  worker: { name: string }          // 特定技能外国人の氏名
  org: { name: string } | null      // 特定技能所属機関の氏名又は名称
  interview: {
    date: string                    // 面談日 'YYYY-MM-DD'
    method: 'in_person' | 'online'
    staff_name: string
    staff_role: StaffRole           // 'support_staff'(支援担当者) | 'support_manager'(支援責任者)
    staff_role_title: string | null // 役職名
    items: Partial<Record<InterviewItemKey, ItemCheck>>
    violation: { has: boolean; date: string | null; detail: string | null }
    free_note: string | null
  }
  created_date: string              // 作成年月日 'YYYY-MM-DD'
}

function jpDate(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${y}年${m}月${d}日`
}

/**
 * テンプレートの「□A ⏎ □B」型セルの該当選択肢の □ を ■ に置換する。
 * セルの既存スタイル・改行はそのまま保持される（値のみ差し替え）。
 */
function checkOption(ws: ExcelJS.Worksheet, addr: string, chosen: string) {
  const cell = ws.getCell(addr)
  const v = cell.value
  if (typeof v !== 'string') return
  cell.value = v.replace(`□${chosen}`, `■${chosen}`).replace(`□　${chosen}`, `■　${chosen}`)
}

export async function generateMendanHokoku(data: MendanHokokuData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(TEMPLATE_PATH)
  const ws = wb.worksheets[0]

  // ── 1 面談対象者 ──
  ws.getCell('L8').value = data.worker.name
  if (data.org?.name) ws.getCell('L9').value = data.org.name
  ws.getCell('L10').value = jpDate(data.interview.date)
  checkOption(ws, 'AB10', data.interview.method === 'online' ? 'オンライン' : '対面')

  // ── 2 面談対応者 ──
  ws.getCell('L13').value = data.interview.staff_name
  checkOption(ws, 'L14', data.interview.staff_role === 'support_manager' ? '支援責任者' : '支援担当者')
  if (data.interview.staff_role_title) ws.getCell('AB14').value = data.interview.staff_role_title

  // ── 3 面談結果: 18項目の 有/無 と問題の内容（W列・Z列） ──
  for (const item of INTERVIEW_ITEMS) {
    const check = data.interview.items[item.key]
    const hasIssue = check?.hasIssue === true
    checkOption(ws, `W${item.row}`, hasIssue ? '有' : '無')
    if (hasIssue && check?.detail) ws.getCell(`Z${item.row}`).value = check.detail
  }

  // ⑥ 基準不適合等の有無
  checkOption(ws, 'F36', data.interview.violation.has ? '有り' : 'なし')

  // ⑦ その他特筆すべき事項
  if (data.interview.free_note) ws.getCell('F38').value = data.interview.free_note

  // ── 4 基準不適合等への対応（有りの場合のみ。対応結果ア/イ/ウは空欄のまま） ──
  if (data.interview.violation.has) {
    if (data.interview.violation.date) ws.getCell('L43').value = jpDate(data.interview.violation.date)
    if (data.interview.violation.detail) ws.getCell('L44').value = data.interview.violation.detail
  }

  // ── 末尾: 作成年月日・面談実施者の氏名 ──
  ws.getCell('V56').value = jpDate(data.created_date)
  ws.getCell('X61').value = data.interview.staff_name

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
