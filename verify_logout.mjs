/**
 * ログアウト機能 + 認証ガードの Playwright 検証
 * - テスト用ユーザーを signup API で作成（wenbinxx77+logout-test@gmail.com）
 * - 前提: localhost:3000 で dev サーバー起動済み
 */
import { chromium } from 'playwright'
import { readFileSync } from 'fs'
import { randomBytes } from 'crypto'

const BASE = 'http://localhost:3000'
const env = Object.fromEntries(
  readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
)
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const TEST_EMAIL = 'wenbinxx77+logout-test@gmail.com'
const TEST_PASSWORD = 'LogoutTest-' + randomBytes(8).toString('hex')

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// ── テストユーザー作成（既存なら signin を試す） ──
async function ensureTestUser() {
  const res = await fetch(`${SB_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  })
  const json = await res.json().catch(() => ({}))
  if (res.ok && json.access_token) return { ok: true, created: true, password: TEST_PASSWORD }
  // 確認メール必須設定 or 既存ユーザーなどのケースを報告
  return { ok: false, created: false, error: JSON.stringify(json).slice(0, 300) }
}

const userResult = await ensureTestUser()
if (!userResult.ok) {
  console.log(`✗ テストユーザー作成不可: ${userResult.error}`)
  console.log('  → メール確認が必須の設定か、signup が無効の可能性。手動のテスト認証情報が必要です。')
  process.exit(2)
}
console.log(`テストユーザー準備OK: ${TEST_EMAIL}`)

const browser = await chromium.launch()
const page = await browser.newPage()

// ── 1. 未ログインで /dashboard 直接アクセス → ログインページへ ──
await page.goto(`${BASE}/dashboard`)
await page.waitForLoadState('networkidle')
check('未ログインで /dashboard 直接アクセス → / へリダイレクト',
  new URL(page.url()).pathname === '/' && await page.getByText('メールアドレス').first().isVisible())

// ── 2. ログイン ──
await page.fill('input[type="email"]', TEST_EMAIL)
await page.fill('input[type="password"]', TEST_PASSWORD)
await page.click('button:has-text("ログイン")')
await page.waitForURL('**/dashboard', { timeout: 15000 })
check('ログイン → /dashboard へ遷移', true)
await page.waitForLoadState('networkidle')

// ── 3. アバターメニューを開き、区切り線とログアウト項目を確認 ──
await page.click('button[aria-label="アカウントメニュー"]')
const settingsBtn = page.locator('button:has-text("設定")').last()
const logoutBtn = page.locator('button:has-text("ログアウト")')
await logoutBtn.waitFor({ state: 'visible', timeout: 5000 })
check('メニュー内に「ログアウト」項目が表示', await logoutBtn.isVisible())

// 設定 → ログアウトの順序（Y座標比較）と間の区切り線
const [sBox, lBox] = [await settingsBtn.boundingBox(), await logoutBtn.boundingBox()]
check('「設定」の下に「ログアウト」が配置', sBox && lBox && lBox.y > sBox.y)
const dividerOk = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')]
  const logout = btns.find(b => b.textContent.trim() === 'ログアウト')
  const prev = logout?.previousElementSibling
  return !!prev && prev.tagName === 'DIV' && getComputedStyle(prev).height === '1px'
})
check('「設定」と「ログアウト」の間に区切り線', dividerOk)
const logoutColor = await logoutBtn.evaluate(el => getComputedStyle(el).color)
check('ログアウトが赤系テキスト (#dc2626)', logoutColor === 'rgb(220, 38, 38)', logoutColor)
await page.screenshot({ path: '/Users/wenbin/trustlayer/screenshot_logout_menu.png' })

// ── 4. ログアウト → ログインページへ ──
await logoutBtn.click()
await page.waitForURL(u => new URL(u).pathname === '/', { timeout: 15000 })
await page.waitForLoadState('networkidle')
check('ログアウト → ログインページ(/) へ遷移',
  await page.getByText('メールアドレス').first().isVisible())
await page.screenshot({ path: '/Users/wenbin/trustlayer/screenshot_logout_after.png' })

// ── 5. ログアウト後、/dashboard へ直接アクセス → リダイレクト ──
await page.goto(`${BASE}/dashboard`)
await page.waitForLoadState('networkidle')
check('ログアウト後の /dashboard 直接アクセス → / へリダイレクト', new URL(page.url()).pathname === '/')

// /employees, /reports/annual, /settings/organization も確認
for (const p of ['/employees', '/reports/annual', '/settings/organization']) {
  await page.goto(`${BASE}${p}`)
  await page.waitForLoadState('networkidle')
  check(`ログアウト後の ${p} 直接アクセス → / へリダイレクト`, new URL(page.url()).pathname === '/')
}

// ── 6. ブラウザバックで保護ページに戻れないか ──
await page.goBack() // 履歴上は /dashboard 等
await page.waitForLoadState('networkidle')
const backPath = new URL(page.url()).pathname
const backHasDashboard = await page.locator('button[aria-label="アカウントメニュー"]').isVisible().catch(() => false)
check('ブラウザバックで保護ページの内容が表示されない', backPath === '/' || !backHasDashboard, `戻り先: ${backPath}`)

await browser.close()

const failed = results.filter(r => !r.ok)
console.log(`\n== 結果: ${results.length - failed.length}/${results.length} 通過 ==`)
console.log(`※ テストユーザー ${TEST_EMAIL} は Supabase Auth に残っています（anon キーでは削除不可）`)
process.exit(failed.length ? 1 : 0)
