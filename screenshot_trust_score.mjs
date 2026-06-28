import { chromium } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  // ── 従業員一覧 ──────────────────────────────────────
  console.log('1. 従業員一覧ページへ移動...');
  await page.goto(`${BASE_URL}/employees`, { waitUntil: 'domcontentloaded' });

  // Supabaseからデータが返るまで待つ（最大15秒）
  try {
    await page.waitForSelector('button:has-text("詳細")', { timeout: 15000 });
    console.log('   ✅ 従業員データ読み込み完了');
  } catch {
    console.log('   ⚠️  従業員データが読み込めませんでした（Supabase接続確認が必要）');
    await page.screenshot({ path: 'screenshot_employees_list.png' });
    await browser.close();
    process.exit(1);
  }

  await page.screenshot({ path: 'screenshot_employees_list.png' });
  console.log('   📸 screenshot_employees_list.png');

  // ── 各従業員の詳細ページを確認 ──────────────────────
  const results = [];

  for (let i = 0; i < 5; i++) {
    await page.goto(`${BASE_URL}/employees`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button:has-text("詳細")', { timeout: 10000 });

    const btns = page.locator('button:has-text("詳細")');
    const count = await btns.count();
    if (i >= count) break;

    await btns.nth(i).click();
    await page.waitForURL(/\/employees\/.+/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('text=信頼スコア内訳', { timeout: 10000 });

    // 少し待ってevaluationsデータが反映されるのを確認
    await page.waitForTimeout(1000);

    const uninputCount = await page.locator('text=未入力').count();
    const scoreText = await page.locator('text=信頼スコア内訳').locator('..').locator('..').textContent().catch(() => '');

    const filename = `screenshot_employee${i + 1}_trust_score.png`;
    await page.screenshot({ path: filename, fullPage: true });

    results.push({ employee: i + 1, uninputCount, filename });
    console.log(`2.${i + 1} 従業員${i + 1}: 未入力=${uninputCount}件 → 📸 ${filename}`);
  }

  // ── 結果サマリー ────────────────────────────────────
  console.log('\n=== 信頼スコア内訳 確認結果 ===');
  let allGood = true;
  for (const r of results) {
    if (r.uninputCount === 0) {
      console.log(`✅ 従業員${r.employee}: 全5項目に数値表示`);
    } else {
      console.log(`⚠️  従業員${r.employee}: 「未入力」が${r.uninputCount}件残っています`);
      allGood = false;
    }
  }
  console.log(allGood ? '\n🎉 全員の信頼スコア内訳が正しく表示されています！' : '\n❌ 一部「未入力」が残っています');

  await browser.close();
})();
