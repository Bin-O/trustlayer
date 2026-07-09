/**
 * 機能A（退職処理）・機能B（在留カード更新）のPlaywright検証
 * - テスト用従業員を新規作成して実施（既存の実データは使わない）
 * - 実行前提: localhost:3000 で dev サーバー起動済み
 * - 作成した行のIDを最後に出力（クリーンアップ用）
 */
import { chromium } from 'playwright'
import { readFileSync } from 'fs'

const BASE = 'http://localhost:3000'
const env = Object.fromEntries(
  readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
)
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const sbHeaders = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
}
const sbGet = async (path) => (await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbHeaders })).json()

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// ── テスト用従業員を作成（アプリのAPI経由） ──
const createWorker = async (name_romaji, card_number) => {
  const res = await fetch(`${BASE}/api/workers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name_romaji,
      nationality: 'ベトナム',
      date_of_birth: '1995-05-05',
      residence_card_number: card_number,
      preferred_language: 'vi',
      status_type: '特定技能1号',
      issued_date: '2025-01-15',
      expiry_date: '2026-12-01',
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`テスト従業員の作成に失敗: ${json.error}`)
  return json.id
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

// ============================================================
// 機能A: 退職処理
// ============================================================
console.log('\n== 機能A: 退職処理 ==')
const workerA = await createWorker('TEST TAISHOKU FLOW', 'TA11111111ST')
console.log(`テスト従業員A作成: ${workerA}`)

// 詳細ページで退職処理
await page.goto(`${BASE}/employees/${workerA}`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: '退職処理' }).click()
await page.fill('input[type="date"]', '2026-06-30')
await page.getByRole('button', { name: '退職処理を確定' }).click()
await page.waitForSelector('text=退職処理が完了しました', { timeout: 10000 })
const bannerText = await page.locator('text=参考様式第3-1-2号').count()
check('確定後に3-1-2号届出の案内が表示される', bannerText > 0)
const has312Button = await page.getByRole('button', { name: /3-1-2号届出を作成/ }).count()
check('3-1-2号生成フローへの誘導ボタンが表示される', has312Button > 0)
await page.screenshot({ path: 'screenshot_test_retire_done.png', fullPage: true })

// DB検証
const [wRow] = await sbGet(`foreign_workers?id=eq.${workerA}&select=status`)
check("foreign_workers.status が 'retired' に更新", wRow?.status === 'retired', `status=${wRow?.status}`)
const [cRow] = await sbGet(`worker_contracts?worker_id=eq.${workerA}&select=id,termination_date`)
check('worker_contracts.termination_date に退職日が保存', cRow?.termination_date === '2026-06-30', `termination_date=${cRow?.termination_date}`)

// 一覧: デフォルトで非表示
await page.goto(`${BASE}/employees`, { waitUntil: 'networkidle' })
await page.waitForSelector('text=全選択')
const visibleDefault = await page.locator('text=TEST TAISHOKU FLOW').count()
check('一覧デフォルト表示で退職者が表示されない', visibleDefault === 0)

// トグルON → 表示される + 退職バッジ
await page.getByText('退職者を含む').click()
await page.waitForTimeout(300)
const visibleToggled = await page.locator('text=TEST TAISHOKU FLOW').count()
check('「退職者を含む」トグルONで表示される', visibleToggled > 0)
const rowBadge = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('div'))
  const card = cards.find(d => d.innerText.includes('TEST TAISHOKU FLOW') && d.innerText.includes('退職') && d.querySelector('button'))
  return !!card
})
check('一覧の退職者カードに退職バッジが表示される', rowBadge)
await page.screenshot({ path: 'screenshot_test_retire_list_toggle.png', fullPage: true })

// 詳細ページ: 閲覧可能 + 退職バッジ
await page.goto(`${BASE}/employees/${workerA}`, { waitUntil: 'networkidle' })
await page.waitForSelector('h1:has-text("TEST TAISHOKU FLOW")')
const detailBadge = await page.locator('span', { hasText: /^退職（2026-06-30）$/ }).count()
check('詳細ページのヘッダに退職バッジ（退職日つき）が表示される', detailBadge > 0)
const retireBtnGone = await page.getByRole('button', { name: '退職処理' }).count()
check('退職済みの従業員には退職処理ボタンが表示されない', retireBtnGone === 0)
await page.screenshot({ path: 'screenshot_test_retire_detail.png', fullPage: true })

// ============================================================
// 機能B: 在留カード更新
// ============================================================
console.log('\n== 機能B: 在留カード更新 ==')
const workerB = await createWorker('TEST CARD UPDATE', 'TB22222222ST')
console.log(`テスト従業員B作成: ${workerB}`)

// extract API をモック（実画像・実API呼び出しなしでUI+DBロジックを検証）
await page.route('**/api/residence-card/extract', route =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      extracted: {
        name_romaji: 'TEST CARD UPDATE', name_kanji: null, name_kana: null,
        date_of_birth: '1995-05-05', gender: 'male', nationality: 'ベトナム',
        status_type: '特定技能2号', expiry_date: '2031-07-01',
        residence_card_number: 'XY98765432ZW', issued_date: '2026-07-01',
        work_restriction: '就労制限なし',
      },
    }),
  })
)

await page.goto(`${BASE}/employees/${workerB}`, { waitUntil: 'networkidle' })
const [fileChooser] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.getByRole('button', { name: /新しい在留カードを読み取って更新/ }).click(),
])
await fileChooser.setFiles({ name: 'card.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('dummy') })

// 差分確認モーダル
await page.waitForSelector('text=在留カード読み取り結果の確認', { timeout: 10000 })
const diffOld = await page.locator('text=特定技能1号').count()
const diffNew = await page.locator('text=特定技能2号').count()
check('確認モーダルに現在値と新値の差分が表示される', diffOld > 0 && diffNew > 0)
await page.screenshot({ path: 'screenshot_test_card_diff_modal.png', fullPage: true })

await page.getByRole('button', { name: 'この内容で更新' }).click()
await page.waitForSelector('text=在留カード読み取り結果の確認', { state: 'detached', timeout: 10000 })
await page.waitForTimeout(500)

// DB検証: 2行（新: active / 旧: inactive）
const statuses = await sbGet(`residence_statuses?worker_id=eq.${workerB}&select=id,status_type,expiry_date,card_number,is_active,source&order=created_at.asc`)
check('residence_statuses が2行になる（履歴保持・削除なし）', statuses.length === 2, `rows=${statuses.length}`)
const oldRow = statuses[0]
const newRow = statuses[statuses.length - 1]
check('旧行が is_active=false に切り替わる', oldRow && oldRow.is_active === false && oldRow.status_type === '特定技能1号')
check('新行が is_active=true でINSERTされる', newRow && newRow.is_active === true && newRow.status_type === '特定技能2号' && newRow.card_number === 'XY98765432ZW')
check("新行の source が 'card_update'", newRow?.source === 'card_update')

// 画面検証: 在留情報カードが新値・履歴セクションに2行
const expiryShown = await page.locator('text=2031-07-01').count()
check('在留情報カードが新しい期限に更新される', expiryShown > 0)
await page.waitForSelector('text=在留資格履歴')
const historyCurrent = await page.locator('text=現在').count()
const historyPast = await page.locator('text=過去').count()
check('在留資格履歴セクションに現在行と過去行が表示される', historyCurrent > 0 && historyPast > 0)
await page.screenshot({ path: 'screenshot_test_card_history.png', fullPage: true })

await browser.close()

// ============================================================
// 結果まとめ + クリーンアップ対象
// ============================================================
const failed = results.filter(r => !r.ok)
console.log(`\n結果: ${results.length - failed.length}/${results.length} 件成功`)
console.log(`\nクリーンアップ対象 workerA=${workerA} workerB=${workerB}`)
process.exit(failed.length ? 1 : 0)
