import ExcelJS from 'exceljs'
import path from 'path'

const TEMPLATE_PATH = path.join(process.cwd(), 'lib/documents/templates/keiyaku-shuryo-3-1-2.xlsx')

// 在留カード番号: 英数字のみ抽出して12セル（Row24）に1文字ずつ書き込む
const CARD_NUMBER_CELLS = ['I24','K24','M24','O24','Q24','S24','U24','W24','Y24','AA24','AC24','AE24']

export type KeiyakuShuryoData = {
  worker: {
    name_romaji: string
    date_of_birth?: string | null
    nationality?: string | null
    residence_card_number?: string | null
    gender?: string | null
  }
  conditions?: {
    industry_field?: string | null
    job_category?: string | null
  } | null
  termination?: {
    date: string
    type: 'expiry' | 'resignation' | 'dismissal' | 'other'
    reason?: string | null
  } | null
  new_contract?: {
    date: string
  } | null
  org: {
    name: string
    address?: string | null
    phone?: string | null
  } | null
  created_date: string
}

export async function generateKeiyakuShuryo(data: KeiyakuShuryoData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(TEMPLATE_PATH)
  const ws = wb.worksheets[0]

  ws.views = [{ state: 'normal' }]

  const { worker, conditions, termination, new_contract, org, created_date } = data

  // ① 届出の対象者
  ws.getCell('I16').value = worker.name_romaji

  // 性別: AE16:AH17 は「男　・　女」の1結合セル → 値を書き換えて●を付与
  if (worker.gender === 'male') {
    ws.getCell('AE16').value = '男●・　女'
  } else if (worker.gender === 'female') {
    ws.getCell('AE16').value = '男　・女●'
  }

  if (worker.date_of_birth) {
    const [y, m, d] = worker.date_of_birth.split('-').map(Number)
    ws.getCell('I19').value = y
    ws.getCell('O19').value = m
    ws.getCell('S19').value = d
  }

  if (worker.nationality) {
    ws.getCell('W19').value = worker.nationality
  }

  const cardNumber = (worker.residence_card_number ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 12)
  CARD_NUMBER_CELLS.forEach((addr, i) => {
    if (!cardNumber[i]) return
    const cell = ws.getCell(addr)
    cell.value = cardNumber[i]
    cell.note = undefined as unknown as ExcelJS.Comment
  })

  if (conditions?.industry_field) ws.getCell('I28').value = conditions.industry_field
  if (conditions?.job_category)   ws.getCell('AB28').value = conditions.job_category

  // ② 届出の事由チェック
  if (termination)  ws.getCell('B33').value = '■'
  if (new_contract) ws.getCell('M33').value = '■'

  // A 契約の終了
  if (termination) {
    const [ty, tm, td] = termination.date.split('-').map(Number)
    ws.getCell('M40').value = ty
    ws.getCell('S40').value = tm
    ws.getCell('W40').value = td

    switch (termination.type) {
      case 'expiry':
        ws.getCell('D45').value = '■'
        break
      case 'dismissal':
        ws.getCell('D47').value = '■'
        ws.getCell('E48').value = '■'
        break
      case 'resignation':
        ws.getCell('D53').value = '■'
        ws.getCell('E58').value = '■'
        break
      case 'other':
        ws.getCell('D53').value = '■'
        ws.getCell('E59').value = '■'
        break
    }
  }

  // B 新たな契約の締結
  if (new_contract) {
    const [ny, nm, nd] = new_contract.date.split('-').map(Number)
    ws.getCell('M89').value = ny
    ws.getCell('S89').value = nm
    ws.getCell('W89').value = nd
  }

  // ③ 届出機関
  if (org) {
    if (org.name)    ws.getCell('I102').value = org.name
    if (org.address) ws.getCell('I105').value = org.address
    if (org.phone)   ws.getCell('AA109').value = org.phone
  }

  // 作成日
  const creDate = new Date(created_date)
  ws.getCell('Y117').value = creDate.getFullYear()
  ws.getCell('AC117').value = creDate.getMonth() + 1
  ws.getCell('AG117').value = creDate.getDate()

  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}
