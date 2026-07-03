import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import path from 'path'
import fs from 'fs'

const TEMPLATE_PATH = path.join(process.cwd(), 'lib/documents/templates/keiyaku-shuryo-3-1-2.xlsx')

// 在留カード番号をI23, K23, M23, ... AE23 の12セルに1文字ずつ書き込む
const CARD_NUMBER_CELLS = ['I23','K23','M23','O23','Q23','S23','U23','W23','Y23','AA23','AC23','AE23']

// 性別○をdrawing注入で実現する。
// テンプレートの drawing1.xml（※テキストボックス）を保持しつつ、性別楕円を追加する。
async function patchDrawing(buffer: Buffer, gender: string | null | undefined): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer)

  // テンプレートから元の drawing1.xml を取得（※テキストボックス保持用）
  const templateBuf = fs.readFileSync(TEMPLATE_PATH)
  const templateZip = await JSZip.loadAsync(templateBuf)
  const origDrawingXml = await templateZip.file('xl/drawings/drawing1.xml')!.async('string')

  let drawingXml: string
  if (gender === 'male' || gender === 'female') {
    // AE16:AH17 = 「男　・　女」（col 30-33, row 15-16, 0-indexed）
    // 男: cols 30-31, 女: cols 32-33
    const fromCol = gender === 'male' ? 30 : 32
    const toCol   = gender === 'male' ? 32 : 34
    const circleShape =
      `<xdr:twoCellAnchor moveWithCells="1" sizeWithCells="1">` +
      `<xdr:from><xdr:col>${fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>15</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
      `<xdr:to><xdr:col>${toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>17</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
      `<xdr:sp macro="" textlink="">` +
      `<xdr:nvSpPr><xdr:cNvPr id="200" name="gender_circle"/><xdr:cNvSpPr/></xdr:nvSpPr>` +
      `<xdr:spPr>` +
      `<a:xfrm><a:off x="0" y="0"/><a:ext cx="200000" cy="200000"/></a:xfrm>` +
      `<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>` +
      `<a:noFill/>` +
      `<a:ln w="19050"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>` +
      `</xdr:spPr>` +
      `<xdr:txBody><a:bodyPr/><a:lstStyle/><a:p/></xdr:txBody>` +
      `</xdr:sp><xdr:clientData/>` +
      `</xdr:twoCellAnchor>`

    // 元の drawing XML の </xdr:wsDr> 直前に楕円を挿入
    drawingXml = origDrawingXml.replace('</xdr:wsDr>', circleShape + '</xdr:wsDr>')
  } else {
    drawingXml = origDrawingXml
  }

  // シートファイルのパスを動的に取得
  const sheetPath = Object.keys(zip.files).find(f => f.match(/xl\/worksheets\/sheet\d+\.xml$/))
  if (!sheetPath) return buffer
  const sheetName = sheetPath.split('/').pop()!

  // drawing1.xml を注入
  zip.file('xl/drawings/drawing1.xml', drawingXml)

  // シートの _rels に drawing を登録（printerSettings は rId1 に残す）
  const relsPath = `xl/worksheets/_rels/${sheetName}.rels`
  const relsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Target="../printerSettings/printerSettings1.bin" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/printerSettings"/>` +
    `<Relationship Id="rId2" Target="../drawings/drawing1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing"/>` +
    `</Relationships>`
  zip.file(relsPath, relsXml)

  // シート XML に <drawing r:id="rId2"/> を挿入
  let sheetXml = await zip.file(sheetPath)!.async('string')
  if (!sheetXml.includes('drawing r:id')) {
    sheetXml = sheetXml.replace('</worksheet>', '<drawing r:id="rId2"/></worksheet>')
    zip.file(sheetPath, sheetXml)
  }

  // [Content_Types].xml に drawing のエントリを追加
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

  // ① 届出の対象者
  ws.getCell('I16').value = worker.name_romaji

  if (worker.date_of_birth) {
    const [y, m, d] = worker.date_of_birth.split('-').map(Number)
    ws.getCell('I19').value = y
    ws.getCell('O19').value = m
    ws.getCell('S19').value = d
  }

  if (worker.nationality) {
    ws.getCell('W19').value = worker.nationality
  }

  if (worker.residence_card_number) {
    const digits = worker.residence_card_number.replace(/\s/g, '')
    CARD_NUMBER_CELLS.forEach((cell, i) => {
      if (digits[i]) ws.getCell(cell).value = digits[i]
    })
  }

  if (conditions?.industry_field) ws.getCell('I28').value = conditions.industry_field
  if (conditions?.job_category)   ws.getCell('AB28').value = conditions.job_category

  // ② 届出の事由チェック
  if (termination)   ws.getCell('B33').value = '■'
  if (new_contract)  ws.getCell('M33').value = '■'

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

  const raw = Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
  return patchDrawing(raw, worker.gender)
}
