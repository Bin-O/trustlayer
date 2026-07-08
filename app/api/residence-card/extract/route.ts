import { NextRequest, NextResponse } from 'next/server'

const EXTRACT_PROMPT = `この在留カード（表面）から以下の項目を読み取り、JSON形式のみで返してください。説明文は不要です。

抽出する項目：
- name_romaji: 氏名（ローマ字表記、例: "NGUYEN VAN AN"）
- name_kanji: 氏名の漢字表記（カードに漢字併記がある場合のみ。無ければ null）
- name_kana: 氏名のカタカナ読み（カードには記載がないため、ローマ字氏名と国籍から発音を推定してカタカナで返す。例: "NGUYEN VAN AN" → "グエン・ヴァン・アン"。区切りは「・」）
- date_of_birth: 生年月日（"YYYY-MM-DD" 形式、例: "1995-04-01"）
- gender: 性別（男性なら "male"、女性なら "female"）
- nationality: 国籍・地域（日本語表記。例: "ベトナム", "フィリピン", "中国", "バングラデシュ", "韓国", "インドネシア", "ミャンマー", "タイ", "インド"。該当する日本語名で返す）
- status_type: 在留資格（カード記載のまま。例: "特定技能1号", "技術・人文知識・国際業務", "技能実習2号イ"）
- expiry_date: 在留期間の満了日（"YYYY-MM-DD" 形式。「在留期間（満了日）」欄の括弧内の日付）
- residence_card_number: 在留カード番号（カード右上の英数字12桁、例: "AB12345678CD"）
- issued_date: 交付年月日（"YYYY-MM-DD" 形式。カード下部の「交付年月日」）
- work_restriction: 就労制限の有無（カード記載のまま。例: "就労制限なし", "在留資格に基づく就労活動のみ可", "就労不可"）

注意：
- 日付は和暦・「YYYY年MM月DD日」表記でも "YYYY-MM-DD" に変換して返す
- 項目が見つからない・判読できない場合は null にする
- 在留カード以外の画像の場合は全項目 null にする
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
      console.error('[residence-card/extract] Anthropic API error:', res.status, errText)
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
    console.error('[residence-card/extract] error:', e)
    return NextResponse.json({ error: '読み取り処理中にエラーが発生しました' }, { status: 500 })
  }
}
