import ExcelJS from 'exceljs'
import path from 'path'
import { INTERVIEW_ITEMS, type InterviewItemKey, type ItemCheck, type StaffRole, type SupervisorTarget } from '@/lib/supportTasks'

/**
 * 定期面談報告書の生成（参考様式第5-5号=本人用 / 第5-6号=監督者用）
 * 両様式は 8〜38行が同一レイアウトで、①面談対象者ブロックの意味と
 * ④基準不適合ブロック以降の行番号（+2行）のみが異なる
 */
const FORM_MAP = {
  '5-5': {
    template: 'mendan-hokoku-5-5.xlsx',
    violationDate: 'L43',
    violationDetail: 'L44',
    createdDate: 'V56',
    interviewer: 'X61',
  },
  '5-6': {
    template: 'mendan-hokoku-5-6.xlsx',
    violationDate: 'L45',
    violationDetail: 'L46',
    createdDate: 'V58',
    interviewer: 'X63',
  },
} as const

export type MendanForm = keyof typeof FORM_MAP

export type MendanHokokuData = {
  form: MendanForm
  // 5-5号: L8=特定技能外国人の氏名 / L9=所属機関名
  worker: { name: string }
  org: { name: string } | null
  // 5-6号: L8=監督者の氏名及び役職 / L9=所属部署（form='5-6' のとき必須）
  supervisorTarget: SupervisorTarget | null
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
  const map = FORM_MAP[data.form]
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path.join(process.cwd(), 'lib/documents/templates', map.template))
  const ws = wb.worksheets[0]

  // ── 1 面談対象者 ──
  if (data.form === '5-6') {
    const t = data.supervisorTarget
    ws.getCell('L8').value = t ? [t.name, t.title].filter(Boolean).join('　') : ''
    ws.getCell('L9').value = t?.department ?? ''
  } else {
    ws.getCell('L8').value = data.worker.name
    if (data.org?.name) ws.getCell('L9').value = data.org.name
  }
  ws.getCell('L10').value = jpDate(data.interview.date)
  checkOption(ws, 'AB10', data.interview.method === 'online' ? 'オンライン' : '対面')

  // ── 2 面談対応者 ──
  ws.getCell('L13').value = data.interview.staff_name
  checkOption(ws, 'L14', data.interview.staff_role === 'support_manager' ? '支援責任者' : '支援担当者')
  if (data.interview.staff_role_title) ws.getCell('AB14').value = data.interview.staff_role_title

  // ── 3 面談結果: 18項目の 有/無 と問題の内容（W列・Z列、両様式で同一行） ──
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
    if (data.interview.violation.date) ws.getCell(map.violationDate).value = jpDate(data.interview.violation.date)
    if (data.interview.violation.detail) ws.getCell(map.violationDetail).value = data.interview.violation.detail
  }

  // ── 末尾: 作成年月日・面談実施者の氏名 ──
  ws.getCell(map.createdDate).value = jpDate(data.created_date)
  ws.getCell(map.interviewer).value = data.interview.staff_name

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
