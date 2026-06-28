import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json()

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('Anthropic API error:', res.status, errText)
      return NextResponse.json({ text: `APIエラーが発生しました (${res.status})` }, { status: 502 })
    }

    const data = await res.json()
    return NextResponse.json({ text: data.content?.[0]?.text || 'エラー' })
  } catch (e) {
    console.error('Generate route error:', e)
    return NextResponse.json({ text: '生成に失敗しました。もう一度お試しください。' }, { status: 500 })
  }
}
