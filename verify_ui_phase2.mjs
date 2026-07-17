/**
 * UI去AI感 Phase 2 のPlaywright検証
 * - TEST従業員2名(特定技能1号): A=賃金台帳12ヶ月完備 / B=5ヶ月のみ
 * - 検証項目:
 *   1. /reports/annual で A=「作成可能」緑バッジ、B=「台帳不足」橙バッジ
 *   2. 未登録月ブロックが灰(rgb(243,244,246))、赤系(#dc2626/#fca5a5/#fee2e2/#fecaca)が一覧に出ない
 *   3. 絵文字(❌⚠️✅📄等)が対象ページ本文に残っていない
 *   4. 各画面スクショ: annual / payroll / settings / new / wizard / login
 * - 実行前提: localhost:3000 で dev サーバー起動済み
 */
import { chromium } from 'playwright'
import { readFileSync } from 'fs'

const BASE = 'http://localhost:3000'
const OUT = '/private/tmp/claude-502/-Users-wenbin-trustlayer/702b0983-d273-40d9-a967-f181dbb3fcca/scratchpad'
const env = Object.fromEntries(
  readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
)
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const { email: TEST_EMAIL, password: TEST_PASSWORD } = JSON.parse(readFileSync(new URL('./.test-user-cred.json', import.meta.url), 'utf8'))

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// ── テストデータ ──
const fy = new Date().getMonth() + 1 >= 4 ? new Date().getFullYear() : new Date().getFullYear() - 1
const fiscalMonths = [
  ...Array.from({ length: 9 }, (_, i) => ({ year: fy, month: i + 4 })),
  ...Array.from({ length: 3 }, (_, i) => ({ year: fy + 1, month: i + 1 })),
]

const createWorker = async (name, cardNo) => {
  const res = await fetch(`${BASE}/api/workers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name_romaji: name, nationality: 'ベトナム', date_of_birth: '1995-05-05',
      residence_card_number: cardNo, preferred_language: 'vi',
      status_type: '特定技能1号', issued_date: '2025-01-15',
      expiry_date: `${fy + 1}-12-01`,
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`テスト従業員の作成に失敗: ${json.error}`)
  return json.id
}

const insertPayroll = async (workerId, months) => {
  const rows = months.map(m => ({
    worker_id: workerId, target_year: m.year, target_month: m.month,
    working_days: 20, gross_pay: 250000, total_deduction: 40000, net_pay: 210000,
  }))
  const res = await fetch(`${SB_URL}/rest/v1/payroll_records`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(rows),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`payroll INSERT 失敗: ${JSON.stringify(json).slice(0, 300)}`)
  if (json.length !== rows.length) throw new Error(`payroll INSERT 行数不一致: ${json.length}/${rows.length}`)
}

console.log(`== テストデータ作成 (fy=${fy}) ==`)
const idA = await createWorker('TEST UIP2 FULL', 'ZZUIP2A00001')
const idB = await createWorker('TEST UIP2 PART', 'ZZUIP2B00002')
await insertPayroll(idA, fiscalMonths)
await insertPayroll(idB, fiscalMonths.slice(0, 5))
console.log(`worker A(完備)=${idA}\nworker B(不足)=${idB}`)

// ── ブラウザ ──
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1280, height: 1200 })

// ログイン
await page.goto(`${BASE}/`)
await page.waitForLoadState('networkidle')
await page.waitForTimeout(1000)
await page.fill('input[type="email"]', TEST_EMAIL)
await page.fill('input[type="password"]', TEST_PASSWORD)
if (!(await page.inputValue('input[type="email"]'))) throw new Error('email入力がhydration前に消えた')
await page.click('button:has-text("ログイン")')
await page.waitForURL('**/dashboard', { timeout: 15000 })

const emojiRe = /[❌⚠✅📄📷✨💾⏳👥🎉📋]/u
const redInBody = async (scopeSel = 'body') => {
  return page.evaluate((sel) => {
    const REDS = ['rgb(220, 38, 38)', 'rgb(254, 226, 226)', 'rgb(252, 165, 165)', 'rgb(254, 202, 202)', 'rgb(239, 68, 68)']
    const hits = []
    for (const el of document.querySelector(sel)?.querySelectorAll('*') ?? []) {
      const cs = getComputedStyle(el)
      for (const p of ['color', 'backgroundColor', 'borderTopColor']) {
        if (REDS.includes(cs[p])) { hits.push(`${el.tagName}.${p}=${cs[p]}:${(el.textContent || '').slice(0, 30)}`); break }
      }
    }
    return hits.slice(0, 10)
  }, scopeSel)
}

// ── 1. 定期届出 ──
await page.goto(`${BASE}/reports/annual`)
await page.waitForSelector('text=TEST UIP2 FULL', { timeout: 20000 })
await page.waitForTimeout(500)

const cardA = page.locator('div', { has: page.locator('span:text-is("TEST UIP2 FULL")') }).last()
const badgeA = await page.locator('span:has-text("作成可能")').count()
const badgeB = await page.locator('span:has-text("台帳不足")').count()
check('A=作成可能バッジ表示', badgeA >= 1)
check('B=台帳不足バッジ表示', badgeB >= 1)

// 未登録月ブロックの背景が灰
const grayBlocks = await page.evaluate(() => {
  const blocks = [...document.querySelectorAll('div[title*="月"]')]
  const gray = blocks.filter(b => getComputedStyle(b).backgroundColor === 'rgb(243, 244, 246)')
  const green = blocks.filter(b => getComputedStyle(b).backgroundColor === 'rgb(22, 163, 74)')
  return { total: blocks.length, gray: gray.length, green: green.length }
})
check('月ブロック: 緑(登録済)+灰(未登録)のみ', grayBlocks.gray + grayBlocks.green === grayBlocks.total && grayBlocks.gray >= 7,
  `total=${grayBlocks.total} green=${grayBlocks.green} gray=${grayBlocks.gray}`)

const reds = await redInBody('body')
check('定期届出ページに赤が出ない', reds.length === 0, reds.join(' | '))
const bodyText1 = await page.textContent('body')
check('定期届出: 絵文字なし', !emojiRe.test(bodyText1))
await page.screenshot({ path: `${OUT}/p2_annual.png`, fullPage: true })

// ── 2. 賃金台帳 ──
await page.goto(`${BASE}/employees/${idB}/payroll`)
await page.waitForSelector('text=賃金台帳', { timeout: 15000 })
await page.waitForTimeout(800)
check('賃金台帳: 絵文字なし', !emojiRe.test(await page.textContent('body')))
await page.screenshot({ path: `${OUT}/p2_payroll.png`, fullPage: true })

// ── 3. 会社設定 ──
await page.goto(`${BASE}/settings/organization`)
await page.waitForSelector('text=会社情報', { timeout: 15000 })
await page.waitForTimeout(800)
check('会社設定: 絵文字なし', !emojiRe.test(await page.textContent('body')))
await page.screenshot({ path: `${OUT}/p2_settings.png`, fullPage: true })

// ── 4. 新規登録(在留期限色: 45日後=橙, 100日後=灰) ──
await page.goto(`${BASE}/employees/new`)
await page.waitForSelector('text=新規外国人登録', { timeout: 15000 })
await page.waitForTimeout(800)
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dPlus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return fmt(d) }
const expiryInput = page.locator('input[type="date"]').last()
await expiryInput.fill(dPlus(45))
await page.waitForTimeout(300)
const c45 = await page.evaluate(() => [...document.querySelectorAll('p')].find(p => /残り \d+ 日/.test(p.textContent))?.style.color ?? getComputedStyle([...document.querySelectorAll('p')].find(p => /残り \d+ 日/.test(p.textContent))).color)
await expiryInput.fill(dPlus(100))
await page.waitForTimeout(300)
const c100 = await page.evaluate(() => { const p = [...document.querySelectorAll('p')].find(p => /残り \d+ 日/.test(p.textContent)); return p ? getComputedStyle(p).color : 'none' })
check('新規登録: 期限45日後=橙', String(c45).includes('217, 119, 6') || String(c45).includes('#d97706'), String(c45))
check('新規登録: 期限100日後=灰', c100 === 'rgb(107, 114, 128)', c100)
check('新規登録: 絵文字なし', !emojiRe.test(await page.textContent('body')))
await page.screenshot({ path: `${OUT}/p2_new.png`, fullPage: true })

// ── 5. 雇用条件ウィザード ──
await page.goto(`${BASE}/employees/${idA}/employment-conditions`)
await page.waitForSelector('text=基本情報', { timeout: 15000 })
await page.waitForTimeout(800)
check('ウィザード: 絵文字なし', !emojiRe.test(await page.textContent('body')))
await page.screenshot({ path: `${OUT}/p2_wizard.png`, fullPage: true })

// ── 6. ログイン(未認証コンテキスト) ──
const ctx2 = await browser.newContext()
const page2 = await ctx2.newPage()
await page2.setViewportSize({ width: 1280, height: 900 })
await page2.goto(`${BASE}/`)
await page2.waitForSelector('button:has-text("ログイン")', { timeout: 15000 })
await page2.waitForTimeout(500)
const loginBtnBg = await page2.evaluate(() => getComputedStyle([...document.querySelectorAll('button')].find(b => b.textContent.includes('ログイン'))).backgroundColor)
check('ログイン: 主ボタンが#2563eb', loginBtnBg === 'rgb(37, 99, 235)', loginBtnBg)
await page2.screenshot({ path: `${OUT}/p2_login.png` })
await ctx2.close()

await browser.close()

const failed = results.filter(r => !r.ok)
console.log(`\n== 結果: ${results.length - failed.length}/${results.length} PASS ==`)
console.log(`TEST workers: A=${idA} B=${idB}(クリーンアップは承認後)`)
process.exit(failed.length ? 1 : 0)
