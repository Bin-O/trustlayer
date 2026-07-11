/**
 * 要対応タイムライン改修（件数サマリー + 3件折りたたみ）のPlaywright検証
 * - TEST名義の従業員4人（在留期限30日以内）を作成し、4件以上の状態を作る
 * - フィルタごとに「3件以下→ボタンなし / 4件以上→3件表示+展開/収起」を動的に検証
 * - 実行前提: localhost:3000 で dev サーバー起動済み
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'fs'
import { randomBytes } from 'crypto'

const BASE = 'http://localhost:3000'
const env = Object.fromEntries(
  readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
)
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return fmt(d) }

// ── テストユーザー ──
const CRED_FILE = new URL('./.test-user-cred.json', import.meta.url)
let TEST_EMAIL, TEST_PASSWORD
{
  let saved = null
  try { saved = JSON.parse(readFileSync(CRED_FILE, 'utf8')) } catch {}
  if (saved?.email && saved?.password) {
    TEST_EMAIL = saved.email; TEST_PASSWORD = saved.password
    console.log(`テストユーザー再利用: ${TEST_EMAIL}`)
  } else {
    TEST_EMAIL = `wenbinxx77+tl-test-${Date.now()}@gmail.com`
    TEST_PASSWORD = 'TlTest-' + randomBytes(8).toString('hex')
    const res = await fetch(`${SB_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    })
    const json = await res.json().catch(() => ({}))
    if (!(res.ok && json.access_token)) {
      console.log(`✗ テストユーザー作成不可: ${JSON.stringify(json).slice(0, 200)}`)
      process.exit(2)
    }
    writeFileSync(CRED_FILE, JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }))
    console.log(`テストユーザー準備OK: ${TEST_EMAIL}`)
  }
}

// ── テストデータ: 期限間近（30日以内）の従業員4人 → 在留期限アラート4件 ──
console.log('== テストデータ作成 ==')
const workerIds = []
for (let i = 0; i < 4; i++) {
  const res = await fetch(`${BASE}/api/workers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name_romaji: `TEST TL EXPIRY ${i + 1}`, nationality: 'ベトナム', date_of_birth: '1995-05-05',
      residence_card_number: `ZY0000000${i + 1}ST`, preferred_language: 'vi',
      status_type: '技術・人文知識・国際業務', issued_date: '2025-01-15',
      expiry_date: daysFromNow(10 + i),
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`テスト従業員の作成に失敗: ${json.error}`)
  workerIds.push(json.id)
}
console.log(`workers: ${workerIds.join(', ')}`)

// ── UI検証 ──
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1280, height: 1200 })

await page.goto(`${BASE}/`)
await page.fill('input[type="email"]', TEST_EMAIL)
await page.fill('input[type="password"]', TEST_PASSWORD)
await page.click('button:has-text("ログイン")')
await page.waitForURL('**/dashboard', { timeout: 15000 })
await page.waitForSelector('[data-testid="tl-summary"]', { timeout: 20000 })

const rowCount = () => page.locator('[data-testid^="tl-"]:not([data-testid="tl-summary"]):not([data-testid="tl-toggle"])').count()
const summaryTotal = async () => {
  const txt = await page.locator('[data-testid="tl-summary"]').textContent()
  const m = txt.match(/全 (\d+) 件/)
  return m ? Number(m[1]) : -1
}

let coveredOver3 = false
let coveredUnder4 = false

for (const [filter, label] of [['all', 'すべて'], ['expiry', '在留期限'], ['todoke', '届出'], ['mendan', '支援計画']]) {
  await page.click(`section#action-timeline button:has-text("${label}")`)
  await page.waitForTimeout(300)

  const emptyState = await page.locator('text=現在、緊急の対応事項はありません').isVisible().catch(() => false)
  if (emptyState) {
    check(`[${label}] 0件: 空状態表示（サマリー/ボタンなし）`, true)
    coveredUnder4 = true
    continue
  }

  const total = await summaryTotal()
  const rows = await rowCount()
  const toggle = page.locator('[data-testid="tl-toggle"]')
  const hasToggle = await toggle.isVisible().catch(() => false)

  if (total > 3) {
    coveredOver3 = true
    check(`[${label}] ${total}件(>3): 既定は3件のみ表示`, rows === 3, `表示${rows}件`)
    check(`[${label}] 「他 ${total - 3} 件を表示」ボタンあり`, hasToggle && (await toggle.textContent()).includes(`他 ${total - 3} 件を表示`), await toggle.textContent().catch(() => ''))
    await toggle.click()
    await page.waitForTimeout(200)
    check(`[${label}] 展開で全${total}件表示`, (await rowCount()) === total, `表示${await rowCount()}件`)
    check(`[${label}] 展開後は「折りたたむ」表示`, (await toggle.textContent()).includes('折りたたむ'))
    if (filter === 'all') await page.screenshot({ path: 'screenshot_tl_expanded.png' })
    await toggle.click()
    await page.waitForTimeout(200)
    check(`[${label}] 収起で3件に戻る`, (await rowCount()) === 3, `表示${await rowCount()}件`)
  } else {
    coveredUnder4 = true
    check(`[${label}] ${total}件(≤3): 全件表示・展開ボタンなし`, rows === total && !hasToggle, `表示${rows}件, ボタン${hasToggle}`)
  }

  if (filter === 'all') {
    const summary = await page.locator('[data-testid="tl-summary"]').textContent()
    check('サマリーに「在留期限」件数バッジ', /在留期限 \d+/.test(summary), summary.trim())
    await page.click(`section#action-timeline button:has-text("すべて")`)
    await page.waitForTimeout(200)
    await page.screenshot({ path: 'screenshot_tl_collapsed.png' })
  }
}

check('4件以上のケースを検証済み', coveredOver3)
check('3件以下(または0件)のケースを検証済み', coveredUnder4)

console.log('📸 screenshot_tl_collapsed.png / screenshot_tl_expanded.png')
await browser.close()

const failed = results.filter(r => !r.ok)
console.log(`\n== 結果: ${results.length - failed.length}/${results.length} 通過 ==`)
console.log('\n== クリーンアップ対象（承認後に削除） ==')
console.log(JSON.stringify({ foreign_workers: workerIds, auth_user: TEST_EMAIL }, null, 2))
process.exit(failed.length ? 1 : 0)
