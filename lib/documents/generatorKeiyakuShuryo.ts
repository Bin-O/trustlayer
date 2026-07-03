import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import path from 'path'
import fs from 'fs'

const TEMPLATE_PATH = path.join(process.cwd(), 'lib/documents/templates/keiyaku-shuryo-3-1-2.xlsx')

const CARD_NUMBER_CELLS = ['I24','K24','M24','O24','Q24','S24','U24','W24','Y24','AA24','AC24','AE24']

// ExcelJS はテンプレートの drawing を出力時に除去するため、
// テンプレートから元の drawing1.xml（※テキストボックス）を取り出して再注入する。
async function patchDrawing(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer)

  const templateBuf = fs.readFileSync(TEMPLATE_PATH)
  const templateZip = await JSZip.loadAsync(templateBuf)
  const drawingXml = await templateZip.file('xl/drawings/drawing1.xml')!.async('string')

  const sheetPath = Object.keys(zip.files).find(f => f.match(/xl\/worksheets\/sheet\d+\.xml$/))
  if (!sheetPath) return buffer
  const sheetName = sheetPath.split('/').pop()!

  zip.file('xl/drawings/drawing1.xml', drawingXml)

  const relsPath = `xl/worksheets/_rels/${sheetName}.rels`
  const relsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Target="../printerSettings/printerSettings1.bin" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/printerSettings"/>` +
    `<Relationship Id="rId2" Target="../drawings/drawing1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing"/>` +
    `</Relationships>`
  zip.file(relsPath, relsXml)

  let sheetXml = await zip.file(sheetPath)!.async('string')
  if (!sheetXml.includes('drawing r:id')) {
    sheetXml = sheetXml.replace('</worksheet>', '<drawing r:id="rId2"/></worksheet>')
    zip.file(sheetPath, sheetXml)
  }

  let ctXml = await zip.file('[Content_Types].xml')!.async('string')
  if (!ctXml.includes('drawing+xml')) {
    ctXml = ctXml.replace(
      '</Types>',
      `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`
    )
    zip.file('[Content_Types].xml', ctXml)
  }

  return Buffer.from(await zip.generateAsync({ type: 'arraybuffer' }))
}

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

  // 在留カード番号: 英数字のみ抽出して12セルに1文字ずつ書き込み、コメント（緑三角）を削除
  const cardNumber = (worker.residence_card_number ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 12)
  CARD_NUMBER_CELLS.forEach((addr, i) => {
    if (!cardNumber[i]) return
    const cell = ws.getCell(addr)
    cell.value = cardNumber[i]
    cell.note = undefined as unknown as ExcelJS.Comment
  })

  if (conditions?.industry_field) ws.getCell('I28').value = conditions.industry_field
  if (conditions?.job_category)   ws.getCell('AB28').value = conditions.job_category

  if (termination)  ws.getCell('B33').value = '■'
  if (new_contract) ws.getCell('M33').value = '■'

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

  if (new_contract) {
    const [ny, nm, nd] = new_contract.date.split('-').map(Number)
    ws.getCell('M89').value = ny
    ws.getCell('S89').value = nm
    ws.getCell('W89').value = nd
  }

  if (org) {
    if (org.name)    ws.getCell('I102').value = org.name
    if (org.address) ws.getCell('I105').value = org.address
    if (org.phone)   ws.getCell('AA109').value = org.phone
  }

  const creDate = new Date(created_date)
  ws.getCell('Y117').value = creDate.getFullYear()
  ws.getCell('AC117').value = creDate.getMonth() + 1
  ws.getCell('AG117').value = creDate.getDate()

  const raw = Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
  return patchDrawing(raw)
}
