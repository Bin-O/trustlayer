import { NextRequest, NextResponse } from 'next/server'

const EXTRACT_PROMPT = `この賃金台帳（給与明細書）から以下の項目を読み取り、JSON形式のみで返してください。説明文は不要です。

抽出する項目：
- target_year: 対象年（整数、例: 2026）
- target_month: 対象月（整数1〜12、例: 6）
- basic_salary: 基本給（整数・円）
- overtime_pay: 時間外手当（整数・円）
- late_night_pay: 深夜手当（整数・円）
- commuting_allowance: 通勤手当（整数・円）
- other_allowance: その他手当合計（整数・円）
- gross_pay: 支給合計（整数・円）
- health_insurance: 健康保険（整数・円）
- pension: 厚生年金（整数・円）
- employment_insurance: 雇用保険（整数・円）
- income_tax: 所得税（整数・円）
- resident_tax: 住民税（整数・円）
- other_deduction: その他控除合計（整数・円）
- total_deduction: 控除合計（整数・円）
- net_pay: 差引支給額（整数・円）

注意：
- 数値はカンマや円記号を除いた整数で返す
- 項目が見つからない場合は null にする
- JSONのみ返す（コードブロック不要）`

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'ファイルが見つかりません' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mimeType = file.type || 'application/pdf'

    // PDF は document source、画像は image source として送信
    const isPdf = mimeType === 'application/pdf'

    const messageContent = isPdf
      ? [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 },
          },
          { type: 'text', text: EXTRACT_PROMPT },
        ]
      : [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: base64 },
          },
          { type: 'text', text: EXTRACT_PROMPT },
        ]

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: messageContent }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[payroll/extract] Anthropic API error:', res.status, errText)
      return NextResponse.json({ error: `AI読み取りエラー (${res.status})` }, { status: 502 })
    }

    const data = await res.json()
    const rawText = data.content?.[0]?.text ?? ''

    // JSON部分を抽出してパース
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'JSONの抽出に失敗しました', raw: rawText }, { status: 422 })
    }

    const extracted = JSON.parse(jsonMatch[0])
    return NextResponse.json({ extracted, raw: rawText })
  } catch (e) {
    console.error('[payroll/extract] error:', e)
    return NextResponse.json({ error: '読み取り処理中にエラーが発生しました' }, { status: 500 })
  }
}
