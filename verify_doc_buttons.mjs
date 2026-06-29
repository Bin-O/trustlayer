/**
 * 書類生成セクションの動作確認
 * - 特定技能1号の従業員で「書類生成」セクションと「雇用条件書」ボタンが表示されるか
 */
import { chromium } from 'playwright'

const BASE = 'http://localhost:3000'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

// 従業員一覧を開く
await page.goto(`${BASE}/employees`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.screenshot({ path: 'screenshot_verify_list.png', fullPage: true })

// 各「詳細 →」ボタンを取得し、ボタンの親カードに「特定技能1号」があるか確認
// employees/page.tsx: カードは display:flex の <div> で、同一 div 内に status_type テキストとボタンがある
const buttonIndex = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button'))
  const detailButtons = buttons.filter(b => b.innerText.includes('詳細'))
  for (let i = 0; i < detailButtons.length; i++) {
    const card = detailButtons[i].parentElement
    if (card && card.innerText.includes('特定技能1号')) return i
  }
  return -1
})

console.log(`特定技能1号カードのボタンインデックス: ${buttonIndex}`)

if (buttonIndex === -1) {
  console.log('特定技能1号の詳細ボタンが見つかりません')
  const allText = await page.locator('body').innerText()
  console.log('ページテキスト抜粋:', allText.slice(0, 300))
  await browser.close()
  process.exit(1)
}

const detailButtons = page.locator('button', { hasText: '詳細' })
await detailButtons.nth(buttonIndex).click()
await page.waitForTimeout(2000)

const bodyText = await page.locator('body').innerText()

// 書類生成セクション確認
const hasSection   = bodyText.includes('書類生成')
const hasButton    = bodyText.includes('雇用条件書')
const hasPreparing = bodyText.includes('準備中')

console.log(`\n=== 確認結果 ===`)
console.log(`書類生成セクション: ${hasSection ? '表示 ✓' : '非表示 ✗'}`)
console.log(`雇用条件書ボタン:   ${hasButton ? '表示 ✓' : '非表示 ✗'}`)
console.log(`準備中タグ:         ${hasPreparing ? '表示 ✓' : '非表示'}`)

await page.screenshot({ path: 'screenshot_verify_doc.png', fullPage: true })
console.log('\nスクリーンショット保存: screenshot_verify_doc.png')

await browser.close()
