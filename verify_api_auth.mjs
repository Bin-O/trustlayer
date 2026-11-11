/**
 * セッションB2: /api 3ルートの cookie 認証化の検証
 * - V1: 未ログイン（cookie なし）で3ルートに POST → すべて 401
 * - V2: ログイン後、画面と同じ同一オリジン fetch で /api/workers → TEST 従業員を作成、詳細画面に在留資格が出る
 * - V3: /api/documents/generate（koyou_joken）を TEST 従業員で生成 → docx が返る
 * - V4: ダッシュボード・従業員一覧が表示される（デモ従業員が見える）
 * - check-expiry はログイン状態では叩かない（LINE 通知が実送信されるため）
 * - 作成した TEST 従業員の ID を最後に出力（クリーンアップは SELECT 提示→承認後）
 * - 実行前提: localhost:3000 で dev サーバー起動済み
 */
import { chromium } from 'playwright'
import { readFileSync } from 'fs'

const BASE = process.env.BASE || 'http://localhost:3000'
const { email: TEST_EMAIL, password: TEST_PASSWORD } = JSON.parse(
  readFileSync(new URL('./.test-user-cred.json', import.meta.url), 'utf8'))

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`) }

// ── V1: 未ログイン ──
for (const path of ['/api/workers', '/api/documents/generate', '/api/notifications/check-expiry']) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  check(`V1 未ログイン ${path}`, res.status === 401, `status=${res.status}`)
}

// Playwright 同梱ブラウザが未導入の環境ではシステムの Chrome を使う（PW_CHANNEL= で無効化）
const browser = await chromium.launch(process.env.PW_CHANNEL === '' ? {} : { channel: process.env.PW_CHANNEL || 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const consoleErrors = []
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })

// ログイン
await page.goto(`${BASE}/`)
await page.waitForLoadState('networkidle')
await page.waitForTimeout(1000)
await page.fill('input[type="email"]', TEST_EMAIL)
await page.fill('input[type="password"]', TEST_PASSWORD)
if (!(await page.inputValue('input[type="email"]'))) throw new Error('email入力がhydration前に消えた')
await page.click('button:has-text("ログイン")')
await page.waitForURL('**/dashboard', { timeout: 15000 })

// ── V2: /api/workers（ログイン cookie 付き同一オリジン fetch）──
const created = await page.evaluate(async () => {
  const res = await fetch('/api/workers', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name_kanji: null, name_kana: null, name_romaji: 'TEST B2 AUTHCHECK', nationality: 'ベトナム',
      date_of_birth: '1995-01-01', passport_number: null, residence_card_number: 'ZZ00000002ZZ',
      preferred_language: 'vi', status_type: '特定技能1号', issued_date: null, expiry_date: '2027-12-31', gender: '',
    }),
  })
  return { status: res.status, body: await res.json() }
})
check('V2 ログイン後 /api/workers', created.status === 200 && !!created.body.id, `status=${created.status} ${JSON.stringify(created.body)}`)
const workerId = created.body.id

if (workerId) {
  await page.goto(`${BASE}/employees/${workerId}`)
  await page.waitForLoadState('networkidle')
  const text = await page.textContent('body')
  check('V2 詳細画面に TEST 従業員と在留資格', text.includes('TEST B2 AUTHCHECK') && text.includes('特定技能1号'))

  // ── V3: 帳票生成（雇用条件書）──
  const gen = await page.evaluate(async (wid) => {
    const res = await fetch('/api/documents/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: 'koyou_joken', workerId: wid }),
    })
    const buf = await res.arrayBuffer()
    return { status: res.status, type: res.headers.get('content-type'), size: buf.byteLength }
  }, workerId)
  check('V3 /api/documents/generate koyou_joken', gen.status === 200 && (gen.type || '').includes('wordprocessingml') && gen.size > 1000,
    `status=${gen.status} type=${gen.type} size=${gen.size}`)
}

// ── V4: 既存画面 ──
await page.goto(`${BASE}/employees`)
await page.waitForLoadState('networkidle')
await page.waitForTimeout(800)
const listText = await page.textContent('body')
const demoNames = ['NGUYEN VAN MINH', 'REYES ANGELO', 'グエン', 'レイエス']
check('V4 従業員一覧にデモ従業員と TEST 従業員', demoNames.some(n => listText.includes(n)) && listText.includes('TEST B2 AUTHCHECK'), '')

await page.goto(`${BASE}/dashboard`)
await page.waitForLoadState('networkidle')
await page.waitForTimeout(1500)
await page.screenshot({ path: process.env.SHOT || '/tmp/b2_dashboard.png', fullPage: false })
check('V4 ダッシュボード表示（console error なし）', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))

await browser.close()
console.log(`\n結果: ${results.filter(r => r.ok).length}/${results.length} PASS`)
console.log(`クリーンアップ対象 TEST worker=${workerId ?? '(作成なし)'}`)
process.exit(results.every(r => r.ok) ? 0 : 1)
