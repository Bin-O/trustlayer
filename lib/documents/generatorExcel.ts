import ExcelJS from 'exceljs'
import path from 'path'
import type { TodokeJokenHenkouData, ChangedSection } from './templates/todokeJokenHenkou'

const TEMPLATE_PATH = path.join(process.cwd(), 'lib/documents/templates/form-3-1-1.xlsx')

// 在留カード番号 12文字 → 各セルに1文字ずつ書き込む
// 行22は装飾用1行マージ、行23-24が実際の入力ボックス（I23:J24, K23:L24...のマスターセルが行23）
// スタイル157はフォントカラー theme="1"(白)のため、黒を明示指定する
function writeResidenceCard(ws: ExcelJS.Worksheet, cardNumber: string) {
  const cols = ['I', 'K', 'M', 'O', 'Q', 'S', 'U', 'W', 'Y', 'AA', 'AC', 'AE'] as const
  const chars = cardNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase().padEnd(12, ' ')
  cols.forEach((col, i) => {
    const ch = chars[i]?.trim()
    if (ch) {
      const cell = ws.getCell(`${col}23`)
      cell.value = ch
      cell.font = { ...cell.font, color: { argb: 'FF000000' } }
    }
  })
}

// 法人番号 13桁 → 各セルに1文字ずつ書き込む
// テンプレートのフォントカラーが白のため、黒を明示指定する
function writeLegalPersonNumber(ws: ExcelJS.Worksheet, num: string) {
  const cols = ['I', 'K', 'M', 'O', 'Q', 'S', 'U', 'W', 'Y', 'AA', 'AC', 'AE', 'AG'] as const
  const chars = num.replace(/[^0-9]/g, '').padEnd(13, ' ')
  cols.forEach((col, i) => {
    const ch = chars[i]?.trim()
    if (ch) {
      const cell = ws.getCell(`${col}49`)
      cell.value = ch
      cell.font = { ...cell.font, color: { argb: 'FF000000' } }
    }
  })
}

const SECTION_CELLS: Record<ChangedSection, string> = {
  I:    'E38',
  IV:   'N38',
  VII:  'S38',
  II:   'E39',
  V:    'N39',
  VIII: 'S39',
  III:  'E40',
  VI:   'N40',
  IX:   'S40',
}

export async function generateTodokeJokenHenkou(data: TodokeJokenHenkouData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(TEMPLATE_PATH)
  const ws = wb.worksheets[0]

  // テンプレートが pageBreakPreview で保存されているため通常表示にリセット
  ws.views = [{ state: 'normal' }]

  const { worker, conditions, change, org, created_date } = data

  // ① 届出の対象者
  ws.getCell('I15').value = worker.name_romaji

  if (worker.date_of_birth) {
    const [y, m, d] = worker.date_of_birth.split('-').map(Number)
    ws.getCell('I18').value = y
    ws.getCell('O18').value = m
    ws.getCell('S18').value = d
  }

  ws.getCell('W18').value = worker.nationality ?? ''

  if (worker.residence_card_number) {
    writeResidenceCard(ws, worker.residence_card_number)
  }

  ws.getCell('I26').value = conditions?.industry_field ?? ''
  ws.getCell('AB26').value = conditions?.job_category ?? ''

  // ② 特定技能雇用契約の変更内容
  // a. 変更年月日
  const chDate = new Date(change.change_date)
  ws.getCell('J31').value = chDate.getFullYear()
  ws.getCell('P31').value = chDate.getMonth() + 1
  ws.getCell('T31').value = chDate.getDate()

  // b. 変更事項チェックボックス（対象のみ ☑ に変更）
  for (const section of change.changed_sections) {
    const cell = SECTION_CELLS[section]
    if (cell) ws.getCell(cell).value = '☑'
  }

  // ③ 届出機関
  if (org) {
    ws.getCell('I52').value = org.name
    ws.getCell('I55').value = org.address ?? ''
    ws.getCell('I59').value = org.representative_name ?? ''
    ws.getCell('AA59').value = org.phone ?? ''
  }

  // 作成年月日（署名欄の日付）
  const creDate = new Date(created_date)
  ws.getCell('W67').value = creDate.getFullYear()
  ws.getCell('AB67').value = creDate.getMonth() + 1
  ws.getCell('AE67').value = creDate.getDate()

  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}
