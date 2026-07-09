/**
 * コンプライアンスダッシュボード・ナビ再編のPlaywright検証
 * - テスト用従業員を新規作成して実施（既存の実データは使わない）
 * - 実行前提: localhost:3000 で dev サーバー起動済み + document_generations テーブル作成済み
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
const sbHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }
const sbGet = async (path) => (await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbHeaders })).json()
const sbWrite = async (method, path, body) => {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method, headers: { ...sbHeaders, Prefer: 'return=representation' }, body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${method} ${path} failed: ${JSON.stringify(json)}`)
  return json
}

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return fmt(d) }

const createWorker = async (name_romaji, card_number, status_type, expiry_date) => {
  const res = await fetch(`${BASE}/api/workers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name_romaji, nationality: 'ベトナム', date_of_birth: '1995-05-05',
      residence_card_number: card_number, preferred_language: 'vi',
      status_type, issued_date: '2025-01-15', expiry_date,
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`テスト従業員の作成に失敗: ${json.error}`)
  return json.id
}

// ============================================================
// テストデータ作成
// ============================================================
console.log('== テストデータ作成 ==')
// W1: 特定技能1号・期限20日後 → 赤バケット+タイムライン
const w1 = await createWorker('TEST DASH EXPIRY RED', 'DA11111111ST', '特定技能1号', daysFromNow(20))
// W2: 技人国・期限50日後 → 黄バケット（共通集計に全在留資格が入ることの確認）
const w2 = await createWorker('TEST DASH EXPIRY YEL', 'DB22222222ST', '技術・人文知識・国際業務', daysFromNow(50))
// W3: 特定技能1号・契約開始6ヶ月前 → 今月の定期面談目安
const w3 = await createWorker('TEST DASH MENDAN', 'DC33333333ST', '特定技能1号', daysFromNow(400))
const mendanStart = new Date(); mendanStart.setMonth(mendanStart.getMonth() - 6); mendanStart.setDate(1)
await sbWrite('POST', 'worker_contracts', { worker_id: w3, contract_start_date: fmt(mendanStart) })
// W4: 特定技能1号・退職済み（5日前）・3-1-2号未生成 → 未対応の届出
const w4 = await createWorker('TEST DASH RETIRE', 'DD44444444ST', '特定技能1号', daysFromNow(300))
await sbWrite('PATCH', `foreign_workers?id=eq.${w4}`, { status: 'retired' })
await sbWrite('POST', 'worker_contracts', { worker_id: w4, termination_date: daysFromNow(-5) })
console.log(`w1=${w1}\nw2=${w2}\nw3=${w3}\nw4=${w4}`)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

// ============================================================
// Part 1: ナビゲーション再編
// ============================================================
console.log('\n== ナビゲーション ==')
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
check('ナビに「従業員管理」が表示される', await page.getByRole('button', { name: '従業員管理' }).count() > 0)
check('ナビに「特定技能」グループラベルが表示される', await page.locator('nav >> text=特定技能').count() > 0)
check('ナビに「定期届出」が表示される', await page.getByRole('button', { name: '定期届出' }).count() > 0)
check('旧ラベル「在留管理」が残っていない', await page.locator('nav >> text=在留管理').count() === 0)

// ============================================================
// Part 1: 設定ページのタブ
// ============================================================
console.log('\n== 設定ページ ==')
await page.goto(`${BASE}/settings/organization`, { waitUntil: 'networkidle' })
check('タブ「会社情報」', await page.getByRole('button', { name: '会社情報', exact: true }).count() > 0)
check('タブ「新規登録時の初期値」', await page.getByRole('button', { name: '新規登録時の初期値' }).count() > 0)
check('タブ「支援計画テンプレート（特定技能）」', await page.getByRole('button', { name: '支援計画テンプレート（特定技能）' }).count() > 0)
check('会社情報タブに説明文がある', await page.locator('text=生成する書類に記載される会社の基本情報').count() > 0)
await page.getByRole('button', { name: '新規登録時の初期値' }).click()
check('初期値タブに説明文がある', await page.locator('text=自動で入力される初期値です').count() > 0)
await page.getByRole('button', { name: '支援計画テンプレート（特定技能）' }).click()
check('支援計画タブに説明文がある', await page.locator('text=支援計画書（参考様式第1-17号）に自動反映される').count() > 0)
await page.screenshot({ path: 'screenshot_test_settings_tabs.png', fullPage: false })

// ============================================================
// Part 2: ダッシュボード
// ============================================================
console.log('\n== ダッシュボード ==')
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="card-expiry"]', { timeout: 15000 })

check('制度改正お知らせバーが表示される', await page.locator('text=定期届出は2026年4月より年1回提出に変更されました').count() > 0)
check('アラートカード4枚が表示される',
  await page.locator('[data-testid="card-expiry"]').count() === 1 &&
  await page.locator('[data-testid="card-todoke"]').count() === 1 &&
  await page.locator('[data-testid="card-mendan"]').count() === 1 &&
  await page.locator('[data-testid="card-payroll"]').count() === 1)

// タイムライン内容
check('タイムラインに期限20日のW1が表示される', await page.locator('text=TEST DASH EXPIRY REDさんの在留期限').count() > 0)
check('タイムラインに技人国のW2も表示される（共通集計）', await page.locator('text=TEST DASH EXPIRY YELさんの在留期限').count() > 0)
check('タイムラインにW4の3-1-2号届出が表示される', await page.locator('text=TEST DASH RETIREさんの契約終了届出（3-1-2号）').count() > 0)
check('タイムラインにW3の定期面談（目安）が表示される', await page.locator('text=TEST DASH MENDANさんの定期面談（目安）').count() > 0)
check('タイムラインに定期届出（2025年度分）が表示される', await page.locator('text=定期届出（2025年度分・参考様式第3-6号）').count() > 0)
await page.screenshot({ path: 'screenshot_test_dashboard_full.png', fullPage: true })

// カードクリック → タイムラインのフィルタ
const todokeCountBefore = parseInt(await page.locator('[data-testid="card-todoke"] div').nth(2).innerText(), 10)
await page.locator('[data-testid="card-todoke"]').click()
await page.waitForTimeout(400)
const expiryRowsAfterFilter = await page.locator('[data-testid="tl-expiry"]').count()
const todokeRowsAfterFilter = await page.locator('[data-testid="tl-todoke"]').count()
check('未対応の届出カードのクリックで届出のみに絞り込まれる', expiryRowsAfterFilter === 0 && todokeRowsAfterFilter >= 2,
  `expiry=${expiryRowsAfterFilter} todoke=${todokeRowsAfterFilter}`)
await page.screenshot({ path: 'screenshot_test_dashboard_filter.png', fullPage: false })

// ============================================================
// 3-1-2号生成 → 未対応の届出から消えることを確認（document_generations 連動）
// ============================================================
console.log('\n== 生成履歴との連動 ==')
const genRes = await fetch(`${BASE}/api/documents/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    documentId: 'todoke_keiyaku_shuryo', workerId: w4,
    termination: { date: daysFromNow(-5), type: 'resignation', reason: null },
    newContract: null,
  }),
})
check('W4の3-1-2号がAPIで生成できる', genRes.ok, `status=${genRes.status}`)
const genRows = await sbGet(`document_generations?worker_id=eq.${w4}&select=id,document_id`)
check('document_generations に生成記録が残る', Array.isArray(genRows) && genRows.length === 1 && genRows[0]?.document_id === 'todoke_keiyaku_shuryo')

await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="card-todoke"]', { timeout: 15000 })
check('生成後はW4の3-1-2号がタイムラインから消える', await page.locator('text=TEST DASH RETIREさんの契約終了届出').count() === 0)
const todokeCountAfter = parseInt(await page.locator('[data-testid="card-todoke"] div').nth(2).innerText(), 10)
check('未対応の届出カードの件数が1減る', todokeCountAfter === todokeCountBefore - 1, `before=${todokeCountBefore} after=${todokeCountAfter}`)

// ============================================================
// 空状態: フィルタで0件の場合のメッセージ（面談フィルタ→W3のみ想定なので全体空は作れない。
// 代わりにローディング後のレンダリングと空状態文言の存在をコード上のフィルタ操作で確認）
// ============================================================
await browser.close()

const failed = results.filter(r => !r.ok)
console.log(`\n結果: ${results.length - failed.length}/${results.length} 件成功`)
console.log(`\nクリーンアップ対象 w1=${w1} w2=${w2} w3=${w3} w4=${w4}`)
process.exit(failed.length ? 1 : 0)
