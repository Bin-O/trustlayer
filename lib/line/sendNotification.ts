const LINE_BROADCAST_URL = 'https://api.line.me/v2/bot/message/broadcast'

export async function sendLineNotification(message: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not set')

  const res = await fetch(LINE_BROADCAST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages: [{ type: 'text', text: message }],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`LINE API error ${res.status}: ${body}`)
  }
}
