# デモデータ: 株式会社アーチ（投資家デモ用）

投入日 2026-07-13 / スクリプト: [`seed_arch_demo.sql`](../seed_arch_demo.sql) / コミット `fcaf189`

## 前提・不変条件
- **org_id はコード固定** `11111111-1111-1111-1111-111111111111`（[api/workers](../app/api/workers/route.ts)・[EmploymentConditionsWizard](../components/EmploymentConditionsWizard.tsx)・[AppHeader](../components/AppHeader.tsx) 等がハードコード参照）。新規orgは不可。既存org行を「株式会社アーチ」へ **UPDATE** して再利用している。
- **バッジ色（緑/橙/灰）は保存カラムでなく導出値**。[lib/trustScore.ts](../lib/trustScore.ts)（data_sufficiency<0.5 で「実績蓄積中」）+ [app/dashboard/page.tsx](../app/dashboard/page.tsx)（届出・面談・在留期限アラート）+ support_tasks から実行時計算。データを正しく形作ることで状態を再現している。
- **定期届出 3-6号（`teiki_hokoku`）は機関単位で1件判定**（worker_id 無関係）。全1号の届出遵守が機関で1件生成すれば緑になる。個々人の緑/橙の差は per-worker の `koyou_joken` / 面談生成の有無で表現。
- **support_tasks はレイジー生成**。[ensureQuarterlyInterviewTasks](../lib/supportTasks.ts) が閲覧時に在職1号の当四半期分を自動 upsert（UNIQUE で重複防止）。seedでは③④⑤=完了で先置き（=面談リストから除外）、⑥=過去Q(2026-Q2)未完了で期限超過催促。

## 8名の脚本と再現手段
| # | 氏名(romaji) | 国籍 | 資格/業界 | 状態 | 主な裏付けデータ |
|---|---|---|---|---|---|
| ① | NGUYEN VAN MINH | ベトナム | 特定活動※/運送 | 在留期限残30日(赤) | residence expiry 2026-08-12。特定活動=特定技能集計外 |
| ② | LE VAN HUNG | ベトナム | 1号/運送 | 入社2週間 | contract 2026-06-29、koyou_joken生成、面談Q3緑(初回9/29) |
| ③ | AUNG KO KO | ミャンマー | 1号/運送 | **模範=緑(94/100)** | 賃金台帳12ヶ月(昇給+賞与)、面談5件、評価高、資格N2確認、更新契約、koyou+mendan生成 |
| ④ | PHAM VAN DUNG | ベトナム | 1号/運送 | 在留期限残23日(赤) | expiry 2026-08-05、面談Q3完了で非表示 |
| ⑤ | SANTOS MARIA ROSA | フィリピン | 1号/工業製品 | 標準 | 賃金台帳6ヶ月、面談Q1+Q3、資格N3申告 |
| ⑥ | SARI DEWI | インドネシア | 1号/工業製品 | **面談Q2超過催促(赤・主役)** | 過去Q未完了タスク seed、Q3はengine緑 |
| ⑦ | PUTRI AYU | インドネシア | 1号/工業製品 | **新入社=灰(充足度20%)** | contract 2026-07-01のみ、他ほぼ空 |
| ⑧ | REYES ANGELO | フィリピン | 1号/工業製品 | 届出未対応(データ上) | contract+疎な賃金台帳+**document_generations 0件** |

※①「特定活動55号相当・免許取得中」は在留資格の選択肢に無く `特定活動` で近似。業界特有状態は業界パッケージ実装後に対応。

## 既知のギャップ（未実装・別タスク）
- **⑧の「届出未対応 橙バッジ」は現行UIに未実装**。⑧(契約義務あり×0件生成)と⑦(新入社・データ皆無)が、詳細ページでどちらも「実績蓄積中」に collapse され視覚的に区別できない。データは差別化済み。→ **別タスク**（task_17851dae）で「在職1号×契約あり×生成0件→橙バッジ」を実装予定。
- **詳細ページ上部アバターの国旗辞書が 🇲🇲🇮🇩 未対応**（一覧の [getFlag](../app/employees/page.tsx) には追加済）。上記 別タスクに同梱。

## 投入後の件数（検証済・RLSサイレント失敗なし）
foreign_workers 8 / residence_statuses 8 / worker_contracts 8 / employment_conditions 8 / payroll_records 27 / support_records 12 / evaluations 12 / qualifications 4 / document_generations 13(内 機関teiki 1) / support_tasks 8(seed)→閲覧で計10表示 / organization_defaults 1。

## 再構築・クリーンアップ手順
[`seed_arch_demo.sql`](../seed_arch_demo.sql) は冪等再実行可（固定UUID）。STEP1で旧データ削除（**residence_statuses を先に**削除→foreign_workers CASCADE。residence_statuses のみ FK が NO ACTION）。Management API 経由で実行（サービスロール＝RLSバイパス）。各DELETE/INSERT後に行数検証すること。

## ログイン（Playwright/ブラウザ検証時）
`@supabase/ssr` はセッションをCookie保存（localStorageは空が正常）。ログインフォームは React 制御入力のため、`computer type`/`form_input` が state に反映されないことがある。ネイティブ setter + `input` イベントで値を設定→`button.click()` で確実に発火する。テスト認証情報は [.test-user-cred.json](../.test-user-cred.json)。
