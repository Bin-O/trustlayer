/**
 * セッションA: 義務マスタ移行（workQualRules ハードコード → obligations テーブル）の機能不変検証
 * - デモ従業員①〜⑧の詳細画面で、作業資格チェックセクションの
 *   {表示有無・カード(testid/本文)・「作業を追加」の選択肢} を取得し、移行前後で完全一致を確認する
 * - 読取のみ（「作業を追加」フォームは開いて選択肢を読むだけで、保存せずキャンセルする）
 * - 使い方:
 *     node verify_obligations_migration.mjs baseline  → スナップショット保存
 *     node verify_obligations_migration.mjs compare   → 再取得して baseline と比較
 *     node verify_obligations_migration.mjs error     → obligations への通信を差し替え、読込失敗時に
 *                                                       セクションが消えずエラー行が出ることを確認
 *         差し替え2種: empty = 200＋空配列（RLS拒否・未投入と同じ応答）／ abort = 通信遮断
 *         DB は変更しない（ブラウザ内の通信だけを差し替える）
 * - 実行前提: BASE_URL（既定 http://localhost:3000）で dev サーバー起動済み
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { isDeepStrictEqual } from 'util'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const OUT = process.env.OBLIG_SNAPSHOT_DIR || '/tmp/oblig-verify'
const MODE = ['compare', 'error'].includes(process.argv[2]) ? process.argv[2] : 'baseline'
const WORKERS = [1, 2, 3, 4, 5, 6, 7, 8].map(n => `a1000000-0000-4000-8000-00000000000${n}`)

const { email: TEST_EMAIL, password: TEST_PASSWORD } = JSON.parse(
  readFileSync(new URL('./.test-user-cred.json', import.meta.url), 'utf8'))

mkdirSync(OUT, { recursive: true })
// PW_CHANNEL=chrome でインストール済みの Google Chrome を使用（Playwright 同梱ブラウザ未ダウンロード時）
const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

await page.goto(`${BASE}/`)
await page.waitForLoadState('networkidle')
await page.waitForTimeout(1000)
await page.fill('input[type="email"]', TEST_EMAIL)
await page.fill('input[type="password"]', TEST_PASSWORD)
if (!(await page.inputValue('input[type="email"]'))) throw new Error('email入力がhydration前に消えた')
await page.click('button:has-text("ログイン")')
await page.waitForURL('**/dashboard', { timeout: 15000 })

if (MODE === 'error') {
  // 製造⑤(割当あり)・製造⑥(割当なし)・運送①(該当ルール0件の業界) で確認
  const targets = WORKERS.filter((_, i) => [0, 4, 5].includes(i))
  const ERROR_TEXT = '作業資格ルールを読み込めませんでした。この欄の表示は不完全です。'
  let fail = 0
  for (const mode of ['empty', 'abort']) {
    await page.route('**/rest/v1/obligations*', route => mode === 'abort'
      ? route.abort()
      : route.fulfill({ status: 200, contentType: 'application/json',
          headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }, body: '[]' }))
    for (const id of targets) {
      await page.goto(`${BASE}/employees/${id}`)
      await page.waitForLoadState('networkidle')
      // abort 時は失敗確定まで時間がかかり描画が遅れるため、セクション出現を待ってから数える（count() は待たない）
      await page.waitForSelector('[data-testid="qual-gap-section"]', { timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(500)
      const section = await page.locator('[data-testid="qual-gap-section"]').count()
      const errText = await page.locator('[data-testid="qual-rules-error"]').innerText().catch(() => null)
      const leaked = await page.locator('[data-testid="add-assignment-open"], [data-testid^="qual-gap-forklift"]').count()
      const ok = section === 1 && errText?.trim() === ERROR_TEXT && leaked === 0
      if (!ok) fail++
      console.log(`${ok ? 'OK ' : 'NG '} [${mode}] ${id} section=${section} error="${errText}" 不完全な描画=${leaked}`)
      if (id.endsWith('5')) await page.screenshot({ path: `${OUT}/error_${mode}_w5.png`, fullPage: true })
    }
    await page.unroute('**/rest/v1/obligations*')
  }
  await browser.close()
  console.log(fail ? `FAIL (${fail})` : 'PASS: 読込失敗時はセクションが消えずエラー行が表示される')
  process.exit(fail ? 1 : 0)
}

const snapshot = {}
for (const id of WORKERS) {
  await page.goto(`${BASE}/employees/${id}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)
  const section = page.locator('[data-testid="qual-gap-section"]')
  const present = (await section.count()) > 0
  const entry = { present, cards: [], addOptions: null, addFooter: null }
  if (present) {
    entry.cards = await section.locator('[data-testid^="qual-gap-"]').evaluateAll(els =>
      els.map(e => ({ testid: e.getAttribute('data-testid'), text: e.innerText.trim() })))
    const openBtn = section.locator('[data-testid="add-assignment-open"]')
    if (await openBtn.count()) {
      await openBtn.click()
      entry.addOptions = await section.locator('[data-testid="add-assignment-work"] option').evaluateAll(els =>
        els.map(o => ({ value: o.value, label: o.textContent })))
      await section.locator('button:has-text("キャンセル")').click()
    } else {
      entry.addFooter = (await section.innerText()).split('\n').pop()
    }
  }
  snapshot[id] = entry
}
if (MODE !== 'baseline') await page.screenshot({ path: `${OUT}/normal_last.png`, fullPage: true })
await browser.close()
const file = `${OUT}/baseline.json`
if (MODE === 'baseline') {
  writeFileSync(file, JSON.stringify(snapshot, null, 2))
  console.log(JSON.stringify(snapshot, null, 2))
  console.log(`baseline saved: ${file}`)
} else {
  const base = JSON.parse(readFileSync(file, 'utf8'))
  writeFileSync(`${OUT}/after.json`, JSON.stringify(snapshot, null, 2))
  const diffs = WORKERS.filter(id => !isDeepStrictEqual(base[id], snapshot[id]))
  for (const id of diffs) console.log('DIFF', id, '\n before:', JSON.stringify(base[id]), '\n after: ', JSON.stringify(snapshot[id]))
  console.log(diffs.length === 0 ? `PASS: ${WORKERS.length}名すべて移行前と一致` : `FAIL: ${diffs.length}名で差分`)
  process.exit(diffs.length === 0 ? 0 : 1)
}
