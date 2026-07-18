/**
 * 支援マトリクス改修(総控台化)の判定不変検証
 * - スナップショット比較: {従業員 × 業務key → 状態} と実施率が改修前後で完全一致すること
 *   (testid `cell-{workerId}-{key}` は key 基準のため列の並べ替えに依存しない)
 * - 状態の読取は data-status 属性を優先し、無ければ title(STATUS_LABEL)にフォールバック
 *   (改修前DOMには data-status が無いため。記号・文言の変更に影響されない)
 * - 使い方:
 *     node verify_support_matrix.mjs baseline  → スナップショットを scratchpad に保存
 *     node verify_support_matrix.mjs compare   → 再取得して baseline と deep-equal 比較
 * - 実行前提: localhost:3000 で dev サーバー起動済み
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'

const BASE = 'http://localhost:3000'
const OUT = process.env.MATRIX_SNAPSHOT_DIR || '/tmp/matrix-verify'
const MODE = process.argv[2] === 'compare' ? 'compare' : 'baseline'

const { email: TEST_EMAIL, password: TEST_PASSWORD } = JSON.parse(
  readFileSync(new URL('./.test-user-cred.json', import.meta.url), 'utf8'))

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

// ログイン(hydration待ち → fill → 入力残存を確認)
await page.goto(`${BASE}/`)
await page.waitForLoadState('networkidle')
await page.waitForTimeout(1000)
await page.fill('input[type="email"]', TEST_EMAIL)
await page.fill('input[type="password"]', TEST_PASSWORD)
if (!(await page.inputValue('input[type="email"]'))) throw new Error('email入力がhydration前に消えた')
await page.click('button:has-text("ログイン")')
await page.waitForURL('**/dashboard', { timeout: 15000 })

await page.goto(`${BASE}/reports/support-matrix`)
await page.waitForSelector('[data-testid^="cell-"]', { timeout: 20000 })
await page.waitForTimeout(500)

const snapshot = await page.evaluate(() => {
  const titleToStatus = { 実施済: 'done', 要対応: 'due', 未実施: 'not_yet', 該当なし: 'not_applicable' }
  const cells = {}
  // workerId は UUID(ハイフン含む)のため、既知の業務 key 末尾でマッチさせる
  const keys = ['guidance', 'airport_pickup', 'housing', 'life_orientation', 'accompaniment',
    'japanese', 'consultation', 'exchange', 'job_change', 'interview']
  for (const el of document.querySelectorAll('[data-testid^="cell-"]')) {
    const tid = el.getAttribute('data-testid').slice('cell-'.length)
    const key = keys.find(k => tid.endsWith(`-${k}`))
    if (!key) continue
    const workerId = tid.slice(0, tid.length - key.length - 1)
    const status = el.getAttribute('data-status')
      || titleToStatus[(el.getAttribute('title') || '').split(/\s|—/)[0]] || 'unknown'
    ;(cells[workerId] ||= {})[key] = status
  }
  const rates = {}
  for (const row of document.querySelectorAll('[data-testid="matrix-worker-row"]')) {
    const name = row.querySelector('td button')?.textContent?.trim()
    const rate = row.querySelector('td:last-child')?.textContent?.trim()
    if (name) rates[name] = rate
  }
  const totalRate = document.querySelector('[data-testid="total-rate"]')?.textContent?.trim() ?? null
  return { cells, rates, totalRate }
})

await browser.close()

mkdirSync(OUT, { recursive: true })
const file = `${OUT}/support_matrix_snapshot.json`
if (MODE === 'baseline') {
  writeFileSync(file, JSON.stringify(snapshot, null, 2))
  const nWorkers = Object.keys(snapshot.cells).length
  console.log(`BASELINE saved: ${file} (${nWorkers}名 / 全体率 ${snapshot.totalRate})`)
} else {
  const baseline = JSON.parse(readFileSync(file, 'utf8'))
  // 列の並べ替えでDOM順(=キー挿入順)が変わるため、キーを整列して「状態の集合」として比較する
  const canonical = (obj) => {
    if (Array.isArray(obj)) return obj.map(canonical)
    if (obj && typeof obj === 'object')
      return Object.fromEntries(Object.keys(obj).sort().map(k => [k, canonical(obj[k])]))
    return obj
  }
  const same = JSON.stringify(canonical(baseline)) === JSON.stringify(canonical(snapshot))
  if (same) {
    console.log(`PASS 判定不変: ${Object.keys(snapshot.cells).length}名 × 10業務の状態・実施率・全体率が改修前と完全一致`)
  } else {
    console.log('FAIL スナップショット不一致:')
    console.log('--- baseline ---'); console.log(JSON.stringify(baseline, null, 1))
    console.log('--- current ---'); console.log(JSON.stringify(snapshot, null, 1))
    process.exit(1)
  }
}
