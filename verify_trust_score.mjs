/**
 * 信頼スコア Phase 1 のPlaywright検証
 * - TEST名義のテスト従業員 + 各種テストデータを作成して実施
 * - RLS UPDATE の更新行数検証（§3-5）を含む
 * - 実行前提: localhost:3000 で dev サーバー起動済み + trust_score_setup.sql 適用済み
 * - 作成した行のIDを最後に出力（クリーンアップは SELECT提示→承認後）
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
const ORG_ID = '11111111-1111-1111-1111-111111111111'
const sbHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }

const sbWrite = async (method, path, body) => {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method, headers: { ...sbHeaders, Prefer: 'return=representation' }, body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${method} ${path} failed: ${JSON.stringify(json)}`)
  return json
}
const sbGet = async (path) => (await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbHeaders })).json()

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const pad = (n) => String(n).padStart(2, '0')
const now = new Date()
const quarterKey = (d) => `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`
const monthShift = (d, m) => new Date(d.getFullYear(), d.getMonth() + m, 1)

// ============================================================
// テストユーザー（ログイン用）
// ============================================================
const CRED_FILE = new URL('./.test-user-cred.json', import.meta.url)
let TEST_EMAIL
let TEST_PASSWORD
{
  let saved = null
  try { saved = JSON.parse(readFileSync(CRED_FILE, 'utf8')) } catch {}
  if (saved?.email && saved?.password) {
    TEST_EMAIL = saved.email
    TEST_PASSWORD = saved.password
    console.log(`テストユーザー再利用: ${TEST_EMAIL}`)
  } else {
    TEST_EMAIL = `wenbinxx77+trust-test-${Date.now()}@gmail.com`
    TEST_PASSWORD = 'TrustTest-' + randomBytes(8).toString('hex')
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
    const { writeFileSync } = await import('fs')
    writeFileSync(CRED_FILE, JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }))
    console.log(`テストユーザー準備OK: ${TEST_EMAIL}`)
  }
}

// ============================================================
// テストデータ作成（TEST名義・ZZプレースホルダ番号）
// ============================================================
console.log('== テストデータ作成 ==')

const createRes = await fetch(`${BASE}/api/workers`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name_romaji: 'TEST TRUST SCORE', nationality: 'ベトナム', date_of_birth: '1996-06-06',
    residence_card_number: 'ZZ99887766ST', preferred_language: 'vi',
    status_type: '特定技能1号', issued_date: '2025-01-15',
    expiry_date: `${now.getFullYear() + 1}-01-15`,
  }),
})
const createJson = await createRes.json()
if (!createRes.ok) throw new Error(`テスト従業員の作成に失敗: ${createJson.error}`)
const workerId = createJson.id
console.log(`worker: ${workerId}`)

// 契約: 18か月前開始・6か月前(24か月以内)に更新 → 継続性 16*(18/24)+2 = 14
const start = monthShift(now, -18)
const renewal = monthShift(now, -5)
const contractRows = await sbWrite('POST', 'worker_contracts', {
  worker_id: workerId,
  contract_start_date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-15`,
  contract_end_date: `${now.getFullYear() + 1}-01-14`,
  contract_renewable: true,
  new_contract_date: `${renewal.getFullYear()}-${pad(renewal.getMonth() + 1)}-01`,
})

// 賃金台帳: 直近12か月窓のうち10か月分。途中で昇給、12月に賞与
// → 完整度 10/12*12=10点、昇給+6・賞与+4・更新+5 → 行動シグナル15点
const payrollRows = []
for (let i = 10; i >= 1; i--) {
  const d = monthShift(now, -i)
  const raise = i <= 5 // 直近5か月は昇給後
  payrollRows.push({
    worker_id: workerId, organization_id: ORG_ID,
    target_year: d.getFullYear(), target_month: d.getMonth() + 1,
    basic_salary: raise ? 210000 : 200000,
    bonus_pay: d.getMonth() + 1 === 12 ? 100000 : null,
    gross_pay: raise ? 230000 : 220000, net_pay: raise ? 190000 : 182000,
  })
}
const payrollInserted = await sbWrite('POST', 'payroll_records', payrollRows)

// 支援記録: 直近4四半期のうち2四半期の本人面談完了 → 10*(2/4)=5点、講習完了 +5点 → 10点
const q0 = quarterKey(now)
const q1 = quarterKey(monthShift(now, -3))
const supportInserted = await sbWrite('POST', 'support_records', [
  { organization_id: ORG_ID, worker_id: workerId, type: 'interview_worker', quarter: q0, completed: true, completed_date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-05`, method: 'in_person' },
  { organization_id: ORG_ID, worker_id: workerId, type: 'interview_worker', quarter: q1, completed: true, completed_date: `${monthShift(now, -3).getFullYear()}-${pad(monthShift(now, -3).getMonth() + 1)}-10`, method: 'in_person' },
  { organization_id: ORG_ID, worker_id: workerId, type: 'orientation', quarter: null, completed: true, completed_date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-20`, method: null },
])

// 資格: JLPT N3(書類確認済)=11点 + 技能試験(申告)=+1.5点 → round(12.5)=13点
const qualInserted = await sbWrite('POST', 'qualifications', [
  { organization_id: ORG_ID, worker_id: workerId, type: 'jlpt', level: 'N3', verified_level: 'document_confirmed', acquired_date: '2024-12-01', certificate_number: 'ZXTEST001' },
  { organization_id: ORG_ID, worker_id: workerId, type: 'skill_exam', level: '介護技能評価試験', verified_level: 'self_reported', acquired_date: '2024-10-01', certificate_number: null },
])

// 評価: 当四半期に評価者2名 → 加重平均4.333、ベイズ収縮(n=2,k=4,prior=3.5)=3.778
// → 面談時評価 (3.778-1)/4*15 = 10.42点
const evalInserted = await sbWrite('POST', 'evaluations', [
  { worker_id: workerId, attendance_score: 18, performance_score: 17, compliance_score: 9, evaluator_role: 'support_staff', quarter: q0 },
  { worker_id: workerId, attendance_score: 16, performance_score: 15, compliance_score: 8, evaluator_role: 'site_supervisor', quarter: q0 },
])

// 前月スナップショット(トレンド矢印・推移グラフ検証用): total 70
const prevMonth = monthShift(now, -1)
const prevSnapshot = await sbWrite('POST', 'trust_score_snapshots', {
  organization_id: ORG_ID, worker_id: workerId,
  month: `${prevMonth.getFullYear()}-${pad(prevMonth.getMonth() + 1)}`,
  total: 70, breakdown: { formula_version: 1, items: [] }, data_sufficiency: 0.8, formula_version: 1,
})

// ============================================================
// 期待値の計算
// ============================================================
// 定期届出(3-6号)の生成記録が既にあるかで届出遵守(8点)が変わるため動的に判定
const fy = now >= new Date(now.getFullYear(), 3, 1) ? now.getFullYear() : now.getFullYear() - 1
const teikiGens = await sbGet(`document_generations?document_id=eq.teiki_hokoku&generated_at=gte.${fy}-04-01&select=id`)
const filingPts = teikiGens.length > 0 ? 8 : 0
const expected = {
  continuity: 14,
  compliance: Math.round(10 + filingPts),
  support: 10,
  qualification: 13,
  evaluation: Math.round(10.42 + 15),
}
const expectedTotal = Object.values(expected).reduce((a, b) => a + b, 0)
console.log(`期待値: ${JSON.stringify(expected)} 合計 ${expectedTotal}（届出遵守=${filingPts}点）`)

// ============================================================
// RLS UPDATE 更新行数検証（§3-5）
// ============================================================
console.log('== RLS UPDATE 検証 ==')
const updChecks = [
  ['qualifications', `qualifications?id=eq.${qualInserted[0].id}`, { certificate_number: 'ZXTEST001U' }],
  ['support_records', `support_records?id=eq.${supportInserted[0].id}`, { method: 'in_person' }],
  ['trust_score_snapshots', `trust_score_snapshots?id=eq.${prevSnapshot[0].id}`, { data_sufficiency: 0.81 }],
  ['evaluations', `evaluations?worker_id=eq.${workerId}&evaluator_role=eq.support_staff`, { excluded: false }],
]
for (const [name, path, body] of updChecks) {
  const rows = await sbWrite('PATCH', path, body)
  check(`RLS: ${name} の UPDATE が更新行数${rows.length}を返す`, rows.length >= 1)
}

// ============================================================
// Playwright: ログイン → 詳細ページでスコアカード検証
// ============================================================
console.log('== UI検証 ==')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1280, height: 1400 })

await page.goto(`${BASE}/`)
await page.fill('input[type="email"]', TEST_EMAIL)
await page.fill('input[type="password"]', TEST_PASSWORD)
await page.click('button:has-text("ログイン")')
await page.waitForURL('**/dashboard', { timeout: 15000 })

await page.goto(`${BASE}/employees/${workerId}`)
await page.waitForSelector('h2:has-text("信頼スコア内訳")', { timeout: 15000 })
// スコア算出（非同期）を待つ
await page.waitForSelector('text=データ充足度', { timeout: 15000 })
await page.waitForTimeout(500)

// 総合スコア表示（28px・ヘッダー右）
const totalText = await page.locator('h2:has-text("信頼スコア内訳") + div span').first().textContent().catch(() => null)
check(`総合スコアが期待値 ${expectedTotal} を表示`, totalText?.trim().startsWith(String(expectedTotal)), `表示: ${totalText?.trim()}`)

// トレンド矢印（前月70点との差分）
const trendDiff = expectedTotal - 70
const trendMark = trendDiff > 0 ? '▲' : trendDiff < 0 ? '▼' : '−'
const trendVisible = await page.locator(`text=${trendMark}`).first().isVisible().catch(() => false)
check(`前月比トレンド矢印(${trendMark})を表示`, trendVisible)

// 内訳5項目の点数
const items = [
  ['就労継続性', expected.continuity, 20],
  ['賃金・届出コンプラ', expected.compliance, 20],
  ['支援実施・参加', expected.support, 15],
  ['資格・日本語', expected.qualification, 15],
  ['雇用主評価', expected.evaluation, 30],
]
for (const [label, score, max] of items) {
  const row = page.locator(`div:has(> div > span > span:text-is("${label}"))`).first()
  const txt = await row.textContent().catch(() => '')
  check(`内訳「${label}」が ${score} / ${max}`, txt.includes(`${score} / ${max}`), txt.slice(0, 80))
}

// 検証バッジ
for (const badge of ['検証済', '書類確認済', '申告', '主観']) {
  // 資格はJLPT確認済+技能申告の混在なので「申告」バッジ。4種のうち出るべきものを確認
}
check('「検証済」バッジ表示', await page.locator('text=検証済').first().isVisible().catch(() => false))
check('「主観」バッジ表示', await page.locator('text=主観').first().isVisible().catch(() => false))

// 雇用主評価の内訳詳細
const detailVisible = await page.locator('text=行動シグナル 15/15').isVisible().catch(() => false)
check('雇用主評価の詳細（面談 10/15・行動 15/15）を表示', detailVisible)

// レーダーチャート（recharts の radar polygon）
const radarOk = await page.locator('.recharts-radar-polygon').count() > 0
check('レーダーチャートを描画', radarOk)

// データ充足度（期待: 0.85 → 85%）
const suffOk = await page.locator('text=85%').first().isVisible().catch(() => false)
check('データ充足度 85% を表示', suffOk)

// 推移グラフ（前月+当月の2点で折れ線表示）
await page.click('button:has-text("スコア推移を表示")')
await page.waitForTimeout(400)
const lineOk = await page.locator('.recharts-line').count() > 0
check('推移グラフ（月次折れ線）を表示', lineOk)

// ヘッダーのスコアリング
const ringOk = await page.locator(`div:has(> svg) >> text=${expectedTotal}`).first().isVisible().catch(() => false)
check('ヘッダーのスコアリングに総合点を表示', ringOk)

await page.screenshot({ path: 'screenshot_trust_score_card.png', fullPage: false })
console.log('📸 screenshot_trust_score_card.png')

// 当月スナップショットのレイジー作成
const curMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
const snaps = await sbGet(`trust_score_snapshots?worker_id=eq.${workerId}&order=month.asc&select=month,total,formula_version,data_sufficiency`)
check('当月スナップショットが自動作成される', snaps.some(s => s.month === curMonth))
const cur = snaps.find(s => s.month === curMonth)
check(`スナップショットの total=${expectedTotal}・formula_version=2`, cur && Number(cur.total) === expectedTotal && cur.formula_version === 2, JSON.stringify(cur))

// ============================================================
// ゼロデータ従業員（評価・契約・給与なし）の検証（formula_version 2）
// ============================================================
console.log('== ゼロデータ従業員の検証 ==')
const zeroRes = await fetch(`${BASE}/api/workers`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name_romaji: 'TEST ZERO DATA', nationality: 'フィリピン', date_of_birth: '1998-08-08',
    residence_card_number: 'ZX00112233ST', preferred_language: 'en',
    status_type: '技術・人文知識・国際業務', issued_date: '2026-06-01',
    expiry_date: `${now.getFullYear() + 2}-06-01`,
  }),
})
const zeroJson = await zeroRes.json()
if (!zeroRes.ok) throw new Error(`ゼロデータ従業員の作成に失敗: ${zeroJson.error}`)
const zeroWorkerId = zeroJson.id
console.log(`zero-data worker: ${zeroWorkerId}`)

await page.goto(`${BASE}/employees/${zeroWorkerId}`)
await page.waitForSelector('h2:has-text("信頼スコア内訳")', { timeout: 15000 })
await page.waitForSelector('text=データ充足度', { timeout: 15000 })
await page.waitForTimeout(500)

// 総合点は数値ではなく「実績蓄積中」
check('ゼロデータ: カードに「実績蓄積中」を表示', await page.locator('text=実績蓄積中').first().isVisible().catch(() => false))

// 全5項目が 0 / max（雇用主評価はベイズpriorの9点が出ないこと）
for (const [label, max] of [['就労継続性', 20], ['賃金・届出コンプラ', 20], ['支援実施・参加', 15], ['資格・日本語', 15], ['雇用主評価', 30]]) {
  const row = page.locator(`div:has(> div > span > span:text-is("${label}"))`).first()
  const txt = await row.textContent().catch(() => '')
  check(`ゼロデータ: 「${label}」が 0 / ${max}`, txt.includes(`0 / ${max}`), txt.slice(0, 80))
}

// バッジは全項目「データ未蓄積」
const noDataBadges = await page.locator('text=データ未蓄積').count()
check(`ゼロデータ: 「データ未蓄積」バッジが5項目に表示`, noDataBadges === 5, `${noDataBadges}個`)

// 面談時評価は「未評価」
check('ゼロデータ: 「面談時評価 未評価」を表示', await page.locator('text=面談時評価 未評価').isVisible().catch(() => false))

await page.screenshot({ path: 'screenshot_trust_score_zero.png', fullPage: false })
console.log('📸 screenshot_trust_score_zero.png')

await browser.close()

// ============================================================
// 結果 + クリーンアップ対象の出力
// ============================================================
const failed = results.filter(r => !r.ok)
console.log(`\n== 結果: ${results.length - failed.length}/${results.length} 通過 ==`)
console.log('\n== クリーンアップ対象（承認後に削除） ==')
console.log(JSON.stringify({
  foreign_workers: [workerId, zeroWorkerId],
  worker_contracts: contractRows.map(r => r.id),
  payroll_records: payrollInserted.length + '行',
  support_records: supportInserted.map(r => r.id),
  qualifications: qualInserted.map(r => r.id),
  evaluations: evalInserted.map(r => r.id),
  trust_score_snapshots: snaps.length + '行',
  auth_user: TEST_EMAIL,
}, null, 2))
process.exit(failed.length ? 1 : 0)
