/**
 * 要対応タイムライン改修（フィルタボタンへの件数統合 + 超過バッジ + 3件折りたたみ）のPlaywright検証
 * - TEST名義の従業員（在留期限30日以内×4人）を作成し、4件以上の状態を作る
 * - 検証項目:
 *   1. カード内の旧サマリー行(tl-summary)が存在しない
 *   2. フィルタボタンに件数表示（すべて N / 在留期限 N / 届出 N / 支援計画 N）、分類件数の合計=すべて
 *   3. 0件の分類ボタンは disabled
 *   4. 超過バッジ: 超過0件なら非表示 → 期限超過の従業員を追加後、件数付きで表示
 *   5. 3件折りたたみ/展開の既存ロジック不変
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

// ── テストデータ作成ヘルパー ──
const workerIds = []
const createWorker = async (name, cardNo, expiry) => {
  const res = await fetch(`${BASE}/api/workers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name_romaji: name, nationality: 'ベトナム', date_of_birth: '1995-05-05',
      residence_card_number: cardNo, preferred_language: 'vi',
      status_type: '技術・人文知識・国際業務', issued_date: '2025-01-15',
      expiry_date: expiry,
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`テスト従業員の作成に失敗: ${json.error}`)
  workerIds.push(json.id)
  return json.id
}

// ── テストデータ: 期限間近（30日以内・未超過）の従業員4人 → 在留期限アラート4件 ──
console.log('== テストデータ作成（期限間近×4） ==')
for (let i = 0; i < 4; i++) {
  await createWorker(`TEST TL EXPIRY ${i + 1}`, `ZY0000000${i + 1}ST`, daysFromNow(10 + i))
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

const FILTERS = [['all', 'すべて'], ['expiry', '在留期限'], ['todoke', '届出'], ['mendan', '支援計画']]

const waitForCounts = async () => {
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="tl-filter-all"]')
    return el && /すべて \d+/.test(el.textContent)
  }, { timeout: 20000 })
}
const buttonCount = async (f) => {
  const txt = await page.locator(`[data-testid="tl-filter-${f}"]`).textContent()
  const m = txt.match(/(\d+)\s*$/)
  return m ? Number(m[1]) : -1
}
// タイムライン行は div[data-testid^="tl-"]（フィルタボタン/トグルは button、バッジは span）
const rowCount = () => page.locator('div[data-testid^="tl-"]').count()
const overdueRowTags = () => page.locator('[data-testid="tl-overdue-tag"]').count()

await waitForCounts()

// ── 1. 旧サマリー行が存在しない ──
check('カード内の旧サマリー行(tl-summary)が存在しない', (await page.locator('[data-testid="tl-summary"]').count()) === 0)

// ── 2. フィルタボタンの件数表示と整合性 ──
const counts = {}
for (const [f, label] of FILTERS) {
  counts[f] = await buttonCount(f)
  check(`フィルタボタン「${label}」に件数表示`, counts[f] >= 0, `${label} ${counts[f]}`)
}
check('分類件数の合計 = すべての件数',
  counts.expiry + counts.todoke + counts.mendan === counts.all,
  `${counts.expiry}+${counts.todoke}+${counts.mendan} = ${counts.all}`)
check('在留期限が4件以上（テストデータ反映）', counts.expiry >= 4, `在留期限 ${counts.expiry}`)

// ── 3. 0件の分類ボタンは disabled / 1件以上は有効でクリック可能 ──
let coveredZero = false
for (const [f, label] of FILTERS.slice(1)) {
  const btn = page.locator(`[data-testid="tl-filter-${f}"]`)
  const disabled = await btn.isDisabled()
  if (counts[f] === 0) {
    coveredZero = true
    check(`[${label}] 0件: ボタンがdisabled`, disabled)
  } else {
    check(`[${label}] ${counts[f]}件: ボタンが有効`, !disabled)
  }
}
if (!coveredZero) console.log('（0件の分類がないため disabled ケースは既存データ上未発生）')
check('「すべて」ボタンは常に有効', !(await page.locator('[data-testid="tl-filter-all"]').isDisabled()))

// ── 4a. 超過バッジ: 超過行数と一致（0なら非表示） ──
const badge = page.locator('[data-testid="tl-overdue-badge"]')
{
  // 「すべて」で展開して超過行タグを全数カウント
  await page.click('[data-testid="tl-filter-all"]')
  await page.waitForTimeout(300)
  const toggle = page.locator('[data-testid="tl-toggle"]')
  if (await toggle.isVisible().catch(() => false)) { await toggle.click(); await page.waitForTimeout(200) }
  const overdueRows = await overdueRowTags()
  if (overdueRows === 0) {
    check('超過0件: バッジ非表示', !(await badge.isVisible().catch(() => false)))
  } else {
    const txt = await badge.textContent().catch(() => '')
    check(`超過${overdueRows}件(既存データ): バッジ表示・件数一致`, txt.includes(`超過 ${overdueRows}`), txt)
  }
  if (await toggle.isVisible().catch(() => false)) { await toggle.click(); await page.waitForTimeout(200) }
  await page.screenshot({ path: 'screenshot_tl_no_overdue.png' })
}

// ── 5. 3件折りたたみ/展開（フィルタごとに動的検証） ──
let coveredOver3 = false
let coveredUnder4 = false
for (const [f, label] of FILTERS) {
  if (f !== 'all' && counts[f] === 0) {
    check(`[${label}] 0件: disabledのためクリック検証スキップ`, true)
    coveredUnder4 = true
    continue
  }
  await page.click(`[data-testid="tl-filter-${f}"]`)
  await page.waitForTimeout(300)

  if (counts[f] === 0) {
    // all が0件の場合のみ（分類0件はdisabledで到達しない）
    check(`[${label}] 0件: 空状態表示`, await page.locator('text=現在、緊急の対応事項はありません').isVisible())
    continue
  }

  const rows = await rowCount()
  const toggle = page.locator('[data-testid="tl-toggle"]')
  const hasToggle = await toggle.isVisible().catch(() => false)

  if (counts[f] > 3) {
    coveredOver3 = true
    check(`[${label}] ${counts[f]}件(>3): 既定は3件のみ表示`, rows === 3, `表示${rows}件`)
    check(`[${label}] 「他 ${counts[f] - 3} 件を表示」ボタンあり`, hasToggle && (await toggle.textContent()).includes(`他 ${counts[f] - 3} 件を表示`), await toggle.textContent().catch(() => ''))
    await toggle.click()
    await page.waitForTimeout(200)
    check(`[${label}] 展開で全${counts[f]}件表示`, (await rowCount()) === counts[f], `表示${await rowCount()}件`)
    check(`[${label}] 展開後は「折りたたむ」表示`, (await toggle.textContent()).includes('折りたたむ'))
    if (f === 'all') await page.screenshot({ path: 'screenshot_tl_expanded.png' })
    await toggle.click()
    await page.waitForTimeout(200)
    check(`[${label}] 収起で3件に戻る`, (await rowCount()) === 3, `表示${await rowCount()}件`)
  } else {
    coveredUnder4 = true
    check(`[${label}] ${counts[f]}件(≤3): 全件表示・展開ボタンなし`, rows === counts[f] && !hasToggle, `表示${rows}件, ボタン${hasToggle}`)
  }
}
check('4件以上のケースを検証済み', coveredOver3)
check('3件以下(または0件)のケースを検証済み', coveredUnder4)

// ── 4b. 超過バッジ: 期限超過の従業員を追加 → バッジ表示・件数増加 ──
console.log('== テストデータ追加（期限超過×1） ==')
await createWorker('TEST TL OVERDUE 1', 'ZZ00000001ST', daysFromNow(-5))
const prevAll = counts.all
await page.reload()
await waitForCounts()
{
  await page.waitForTimeout(300)
  const toggle = page.locator('[data-testid="tl-toggle"]')
  if (await toggle.isVisible().catch(() => false)) { await toggle.click(); await page.waitForTimeout(200) }
  const overdueRows = await overdueRowTags()
  const txt = await badge.textContent().catch(() => '')
  check('超過データ追加後: バッジ表示', await badge.isVisible().catch(() => false), txt)
  check(`バッジ件数が超過行数(${overdueRows})と一致`, txt.includes(`超過 ${overdueRows}`), txt)
  check('「すべて」件数が+1', (await buttonCount('all')) === prevAll + 1, `${prevAll} → ${await buttonCount('all')}`)
  if (await toggle.isVisible().catch(() => false)) { await toggle.click(); await page.waitForTimeout(200) }
  await page.screenshot({ path: 'screenshot_tl_overdue_badge.png' })
}

// ── 6. 0件状態（Supabaseレスポンスを空にモック）: バッジ非表示・分類ボタン全disabled・空状態表示 ──
{
  const zeroPage = await browser.newPage()
  await zeroPage.setViewportSize({ width: 1280, height: 1200 })
  await zeroPage.route(`${SB_URL}/rest/v1/**`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await zeroPage.goto(`${BASE}/`)
  await zeroPage.fill('input[type="email"]', TEST_EMAIL)
  await zeroPage.fill('input[type="password"]', TEST_PASSWORD)
  await zeroPage.click('button:has-text("ログイン")')
  await zeroPage.waitForURL('**/dashboard', { timeout: 15000 })
  await zeroPage.waitForFunction(() => {
    const el = document.querySelector('[data-testid="tl-filter-all"]')
    return el && /すべて \d+/.test(el.textContent)
  }, { timeout: 20000 })
  check('[0件状態] 「すべて 0」表示', /すべて 0/.test(await zeroPage.locator('[data-testid="tl-filter-all"]').textContent()))
  check('[0件状態] 超過バッジ非表示', (await zeroPage.locator('[data-testid="tl-overdue-badge"]').count()) === 0)
  for (const [f, label] of FILTERS.slice(1)) {
    check(`[0件状態] 「${label} 0」がdisabled`, await zeroPage.locator(`[data-testid="tl-filter-${f}"]`).isDisabled())
  }
  check('[0件状態] 空状態メッセージ表示', await zeroPage.locator('text=現在、緊急の対応事項はありません').isVisible())
  await zeroPage.screenshot({ path: 'screenshot_tl_zero_state.png' })
  await zeroPage.close()
}

console.log('📸 screenshot_tl_zero_state.png / screenshot_tl_expanded.png / screenshot_tl_overdue_badge.png')
await browser.close()

const failed = results.filter(r => !r.ok)
console.log(`\n== 結果: ${results.length - failed.length}/${results.length} 通過 ==`)
console.log('\n== クリーンアップ対象（承認後に削除） ==')
console.log(JSON.stringify({ foreign_workers: workerIds, auth_user: TEST_EMAIL }, null, 2))
process.exit(failed.length ? 1 : 0)
