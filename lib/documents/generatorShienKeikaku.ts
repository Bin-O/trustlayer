import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import path from 'path'

const TEMPLATE_PATH = path.join(process.cwd(), 'lib/documents/templates/shien-keikaku-1-17.xlsx')

// 性別○をdrawing注入で実現する。
// ExcelJSはdrawingを除去して出力するため、必要なファイルを丸ごと新規追加する。
//
// BC18:BP25 に「男　　・　　女」(0-indexed BC=col54, BP=col67, row17-24)
// 各全角文字に2列割り当て: 男(54-55)、スペース×2(56-59)、・(60-61)、スペース×2(62-65)、女(66-67)
async function patchDrawing(buffer: Buffer, gender: string | null | undefined): Promise<Buffer> {
  if (gender !== 'male' && gender !== 'female') return buffer

  const zip = await JSZip.loadAsync(buffer)

  // 1. シートファイルのパスを動的に取得
  const sheetPath = Object.keys(zip.files).find(f => f.match(/xl\/worksheets\/sheet\d+\.xml$/))
  if (!sheetPath) return buffer
  const sheetName = sheetPath.split('/').pop()! // e.g. "sheet2.xml"

  // 2. drawing1.xml を新規作成
  const fromCol = gender === 'male' ? 54 : 65
  const toCol   = gender === 'male' ? 57 : 68
  const drawingXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<xdr:twoCellAnchor moveWithCells="1" sizeWithCells="1">` +
    `<xdr:from><xdr:col>${fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>17</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
    `<xdr:to><xdr:col>${toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>25</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
    `<xdr:sp macro="" textlink="">` +
    `<xdr:nvSpPr><xdr:cNvPr id="100" name="gender_circle"/><xdr:cNvSpPr/></xdr:nvSpPr>` +
    `<xdr:spPr>` +
    `<a:xfrm><a:off x="0" y="0"/><a:ext cx="200000" cy="200000"/></a:xfrm>` +
    `<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>` +
    `<a:noFill/>` +
    `<a:ln w="19050"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>` +
    `</xdr:spPr>` +
    `<xdr:txBody><a:bodyPr/><a:lstStyle/><a:p/></xdr:txBody>` +
    `</xdr:sp><xdr:clientData/>` +
    `</xdr:twoCellAnchor></xdr:wsDr>`
  zip.file('xl/drawings/drawing1.xml', drawingXml)

  // 3. シートのrel ファイルを追加（drawing を rId2 として登録）
  const relsPath = `xl/worksheets/_rels/${sheetName}.rels`
  const relsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId2" Target="../drawings/drawing1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing"/>` +
    `</Relationships>`
  zip.file(relsPath, relsXml)

  // 4. シート XML に <drawing r:id="rId2"/> を挿入
  let sheetXml = await zip.file(sheetPath)!.async('string')
  sheetXml = sheetXml.replace('</worksheet>', '<drawing r:id="rId2"/></worksheet>')
  zip.file(sheetPath, sheetXml)

  // 5. [Content_Types].xml に drawing のエントリを追加
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

export type ShienKeikakuData = {
  worker: {
    name_kanji: string
    name_kana?: string | null
    date_of_birth?: string | null
    nationality?: string | null
    gender?: string | null
  }
  org: {
    name: string
    name_kana?: string | null
    address?: string | null
    phone?: string | null
    support_office_address?: string | null
    support_office_phone?: string | null
    support_supervisor_name?: string | null
    support_supervisor_kana?: string | null
    support_supervisor_title?: string | null
    support_staff_name?: string | null
    support_staff_kana?: string | null
    support_staff_title?: string | null
    // Section IV 自由記入（会社共通テンプレート）
    shien_jizen_guidance?: string | null
    shien_housing?: string | null
    shien_life_support?: string | null
    shien_japanese?: string | null
    shien_consultation?: string | null
    shien_japanese_contact?: string | null
    shien_job_change?: string | null
    shien_regular_meeting?: string | null
    // 実施予定 有/無
    shien_jizen_guidance_plan?: boolean | null
    shien_housing_plan?: boolean | null
    shien_life_support_plan?: boolean | null
    shien_japanese_plan?: boolean | null
    shien_consultation_plan?: boolean | null
    shien_japanese_contact_plan?: boolean | null
    shien_job_change_plan?: boolean | null
    shien_regular_meeting_plan?: boolean | null
    // 委託・担当者
    shien_outsource?: boolean | null
    shien_staff_address?: string | null
  } | null
  created_date: string
}

export async function generateShienKeikaku(data: ShienKeikakuData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(TEMPLATE_PATH)
  const ws = wb.worksheets[0]

  // テンプレートは pageBreakPreview で開かれており「ページ N」透かしが表示される → 通常表示に戻す
  ws.views = [{ state: 'normal' }]

  const { worker, org, created_date } = data

  // 作成日（行13: BE=年 BJ=月 BM=日）
  const creDate = new Date(created_date)
  ws.getCell('BE13').value = creDate.getFullYear()
  ws.getCell('BJ13').value = creDate.getMonth() + 1
  ws.getCell('BM13').value = creDate.getDate()

  // Ⅰ 支援対象者
  // 1. 氏名（O18:AJ25 マージ領域）
  ws.getCell('O18').value = worker.name_kanji

  // 2. 性別 — テンプレートテキストはそのまま残し、○はdrawingで追加する（patchDrawing で処理）

  // 3. 生年月日（Q26=年 V26=月 Z26=日、各マージ領域の左上セル）
  if (worker.date_of_birth) {
    const [y, m, d] = worker.date_of_birth.split('-').map(Number)
    ws.getCell('Q26').value = y
    ws.getCell('V26').value = m
    ws.getCell('Z26').value = d
  }

  // 4. 国籍・地域（BC26:BP33 マージ領域）
  if (worker.nationality) {
    ws.getCell('BC26').value = worker.nationality
  }

  // Ⅱ 特定技能所属機関（自社支援）
  if (org) {
    // 1. 氏名又は名称
    //    ふりがな行: O34:BP36
    //    名称行:    O37:BP41
    ws.getCell('O34').value = org.name_kana ?? ''
    ws.getCell('O37').value = org.name

    // 2. 本店所在地
    //    〒: O42:O43、郵便番号: P42:T43(上3桁)、V42:Z43(下4桁)
    //    住所本文: 行44-49・列O-BA（テンプレートは個別セル→マージして書き込む）
    //    電話番号: BB42:BO47 マージセル（BB42 がトップ左）
    if (org.address) {
      ws.mergeCells('O44:BA49')
      const addrCell = ws.getCell('O44')
      addrCell.value = org.address
      addrCell.alignment = { wrapText: true, vertical: 'top' }
    }
    if (org.phone) {
      ws.getCell('BB42').value = org.phone
    }

    // 3. 支援を行う事務所の所在地（２と異なる場合）
    //    〒: O50:O51、郵便番号: P50:T51(上3桁)、V50:Z51(下4桁)
    //    住所本文: 行52-57・列O-BA（同上）
    //    電話番号: BB50:BO55 マージセル
    if (org.support_office_address) {
      ws.mergeCells('O52:BA57')
      const soAddrCell = ws.getCell('O52')
      soAddrCell.value = org.support_office_address
      soAddrCell.alignment = { wrapText: true, vertical: 'top' }
    }
    if (org.support_office_phone) {
      ws.getCell('BB50').value = org.support_office_phone
    }

    // 4. 支援業務を行う体制の概要 — 支援責任者
    //    ふりがな: AI58:AX60（ふりがな行）
    //    氏名:     AI61:AX65（氏名行）
    //    役職:     BE58:BP65
    if (org.support_supervisor_kana) {
      ws.getCell('AI58').value = org.support_supervisor_kana
    }
    if (org.support_supervisor_name) {
      ws.getCell('AI61').value = org.support_supervisor_name
    }
    if (org.support_supervisor_title) {
      ws.getCell('BE58').value = org.support_supervisor_title
    }

    // Section IV 各支援活動の自由記入欄（テンプレートの「（自由記入）」ラベルを上書き）
    // 各セルはテンプレートで既にマージ済み。トップ左セルに書き込む。
    const shienItems: Array<{
      textCell: string; value: string | null | undefined
      planYCell: string; planNCell: string; plan: boolean | null | undefined
      outsourceCell: string
      addrCell: string
    }> = [
      { textCell: 'G225', value: org.shien_jizen_guidance,   planYCell: 'S225', planNCell: 'S228', plan: org.shien_jizen_guidance_plan,   outsourceCell: 'AC225', addrCell: 'AO225' },
      { textCell: 'G306', value: org.shien_housing,          planYCell: 'S306', planNCell: 'S309', plan: org.shien_housing_plan,          outsourceCell: 'AC306', addrCell: 'AO308' },
      { textCell: 'G413', value: org.shien_life_support,     planYCell: 'S413', planNCell: 'S416', plan: org.shien_life_support_plan,     outsourceCell: 'AC413', addrCell: 'AO415' },
      { textCell: 'E460', value: org.shien_japanese,         planYCell: 'S460', planNCell: 'S463', plan: org.shien_japanese_plan,         outsourceCell: 'AC460', addrCell: 'AO462' },
      { textCell: 'G490', value: org.shien_consultation,     planYCell: 'S490', planNCell: 'S493', plan: org.shien_consultation_plan,     outsourceCell: 'AC490', addrCell: 'AO492' },
      { textCell: 'E580', value: org.shien_japanese_contact, planYCell: 'S580', planNCell: 'S583', plan: org.shien_japanese_contact_plan, outsourceCell: 'AC580', addrCell: 'AO582' },
      { textCell: 'E647', value: org.shien_job_change,       planYCell: 'S647', planNCell: 'S650', plan: org.shien_job_change_plan,       outsourceCell: 'AC647', addrCell: 'AO649' },
      { textCell: 'G701', value: org.shien_regular_meeting,  planYCell: 'S701', planNCell: 'S704', plan: org.shien_regular_meeting_plan,  outsourceCell: 'AC701', addrCell: 'AO703' },
    ]
    for (const item of shienItems) {
      // 自由記入テキスト
      if (item.value) {
        const c = ws.getCell(item.textCell)
        c.value = item.value
        c.alignment = { wrapText: true, vertical: 'top' }
      }
      // 実施予定 有/無 チェック（●）
      if (item.plan !== null && item.plan !== undefined) {
        ws.getCell(item.plan ? item.planYCell : item.planNCell).value = '●'
      }
      // 委託有無
      if (org.shien_outsource !== null && org.shien_outsource !== undefined) {
        ws.getCell(item.outsourceCell).value = org.shien_outsource ? '有' : '無'
      }
      // 支援担当者住所
      if (org.shien_staff_address) {
        const ac = ws.getCell(item.addrCell)
        ac.value = org.shien_staff_address
        ac.alignment = { wrapText: true, vertical: 'top' }
      }
    }
  }

  const raw = Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
  return patchDrawing(raw, worker.gender)
}
