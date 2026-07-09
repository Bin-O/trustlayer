/**
 * 退職処理の届出案内が在留資格で分岐することのPlaywright検証
 * - ケースA: 特定技能1号 → 3-1-2号届出の案内 + 生成モーダル誘導
 * - ケースB: 技術・人文知識・国際業務 → 汎用案内のみ（3-1-2号への誘導なし）
 * - テスト用従業員を新規作成して実施（既存の実データは使わない）
 * - 実行前提: localhost:3000 で dev サーバー起動済み
 * - 作成した行のIDを最後に出力（クリーンアップ用）
 */
import { chromium } from 'playwright'

const BASE = 'http://localhost:3000'

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const createWorker = async (name_romaji, card_number, status_type) => {
  const res = await fetch(`${BASE}/api/workers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name_romaji,
      nationality: 'ベトナム',
      date_of_birth: '1995-05-05',
      residence_card_number: card_number,
      preferred_language: 'vi',
      status_type,
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

const retireFlow = async (workerId, screenshotPrefix) => {
  await page.goto(`${BASE}/employees/${workerId}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '退職処理' }).click()
  await page.waitForSelector('h3:has-text("退職処理")')
  const modalNotice312 = await page.locator('text=参考様式第3-1-2号').count()
  const modalNoticeGeneric = await page.locator('text=退職時の届出義務は在留資格により異なります').count()
  await page.screenshot({ path: `${screenshotPrefix}_modal.png`, fullPage: true })
  await page.fill('input[type="date"]', '2026-06-30')
  await page.getByRole('button', { name: '退職処理を確定' }).click()
  await page.waitForSelector('text=退職処理が完了しました', { timeout: 10000 })
  const banner312 = await page.locator('text=参考様式第3-1-2号').count()
  const bannerGeneric = await page.locator('text=退職時の届出義務は在留資格により異なります').count()
  const bannerHellowork = await page.locator('text=ハローワークへの外国人雇用状況届出').count()
  const button312 = await page.getByRole('button', { name: /3-1-2号届出を作成/ }).count()
  await page.screenshot({ path: `${screenshotPrefix}_done.png`, fullPage: true })
  return { modalNotice312, modalNoticeGeneric, banner312, bannerGeneric, bannerHellowork, button312 }
}

// ============================================================
// ケースA: 特定技能1号 → 3-1-2号案内
// ============================================================
console.log('\n== ケースA: 特定技能1号の退職 ==')
const workerA = await createWorker('TEST RETIRE TOKUTEI', 'RA11111111ST', '特定技能1号')
console.log(`テスト従業員A作成: ${workerA}`)

const a = await retireFlow(workerA, 'screenshot_test_retire_notice_tokutei')
check('【モーダル】3-1-2号の事前案内が表示される', a.modalNotice312 > 0)
check('【モーダル】汎用案内は表示されない', a.modalNoticeGeneric === 0)
check('【完了バナー】3-1-2号届出の案内が表示される', a.banner312 > 0)
check('【完了バナー】3-1-2号届出を作成ボタンが表示される', a.button312 > 0)
check('【完了バナー】汎用案内は表示されない', a.bannerGeneric === 0)

// 誘導ボタン → 生成モーダルが開くこと
await page.getByRole('button', { name: /3-1-2号届出を作成/ }).click()
const keiyakuModalOpen = await page.locator('text=契約終了・新契約締結 届出情報').count()
check('【完了バナー】ボタンから3-1-2号生成モーダルが開く', keiyakuModalOpen > 0)

// ============================================================
// ケースB: 技術・人文知識・国際業務 → 汎用案内のみ
// ============================================================
console.log('\n== ケースB: 技術・人文知識・国際業務の退職 ==')
const workerB = await createWorker('TEST RETIRE GIJINKOKU', 'RB22222222ST', '技術・人文知識・国際業務')
console.log(`テスト従業員B作成: ${workerB}`)

const b = await retireFlow(workerB, 'screenshot_test_retire_notice_gijinkoku')
check('【モーダル】汎用案内（ハローワーク届出）が表示される', b.modalNoticeGeneric > 0)
check('【モーダル】3-1-2号の案内は表示されない', b.modalNotice312 === 0)
check('【完了バナー】汎用案内（在留資格により異なる）が表示される', b.bannerGeneric > 0)
check('【完了バナー】ハローワークへの外国人雇用状況届出の案内が表示される', b.bannerHellowork > 0)
check('【完了バナー】3-1-2号の案内は表示されない', b.banner312 === 0)
check('【完了バナー】3-1-2号届出を作成ボタンは表示されない', b.button312 === 0)

await browser.close()

// ============================================================
// 結果まとめ + クリーンアップ対象
// ============================================================
const failed = results.filter(r => !r.ok)
console.log(`\n結果: ${results.length - failed.length}/${results.length} 件成功`)
console.log(`\nクリーンアップ対象 workerA=${workerA} workerB=${workerB}`)
process.exit(failed.length ? 1 : 0)
