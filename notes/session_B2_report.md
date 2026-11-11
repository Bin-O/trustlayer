# セッションB2 報告書：最小限のセキュリティ封鎖（3テーブル＋/api 3ルート）

- 作成日：2026-11-11
- 前提資料：`notes/session_B1_report.md`
- 状態：
  - **コード変更（/api 3ルート）：実施済み → tsc PASS → ローカル Playwright PASS → コミット → push（WB 承認済み）**
  - **DB ポリシー変更（3テーブル）：未実施**。WB の SQL 結果（Q1/Q2/Q6/Q7）待ち＋本番デプロイ確認待ち

---

## 1. WB の裁定（2026-11-11）

| 論点 | 裁定 | 理由（WB） |
|---|---|---|
| ① SERVICE_ROLE_KEY フォールバック | **外す** | 環境変数の有無でまったく違う権限で動き、ローカルと本番で挙動が変わる。cookie 方式なら不要。現ポリシーは USING(true) なので外しても本番は壊れない |
| ② 適用順序 | **コード先行** | 逆だと本番コードが anon のまま残って即座に壊れる。push 承認。push 後に Vercel デプロイ完了と本番のログイン・従業員一覧表示を確認してから DB に進む |
| ③ DELETE の扱い | **★外さない。TO authenticated への変更のみ★**（当初提案と異なる） | 塞ぎたい脅威は「未ログインの誰もがデータを消せる」ことで、TO authenticated だけで解消する。DELETE を外すと登録失敗時のロールバックが効かず、在留資格の無い従業員が残る（データ汚染）。正しく直すにはトランザクション/RPC が必要で範囲外。**ロールバック処理には一切手を入れない** |
| check-expiry の外部 cron | **無しとして進める** | リポジトリに `vercel.json`・`.github/` 無し、アプリ内呼び出し元なし（下記 F4） |

### ★残存リスク（明記事項）★

**ログインユーザーは、3テーブルを含む全データを DELETE できる状態が続く。**
- 今回の封鎖で塞がるのは「未ログイン（anon）による読み書き・削除」のみ。
- ログインできるのは WB が発行したアカウントのみ（signup 無効化済み：F2）なので、現時点の脅威は限定的。
- **テナント分離と論理削除を入れる回で解消する**（組織による絞り込み＋DELETE ポリシー撤去＋削除系のトランザクション化）。

---

## 2. 事実確認

| # | 事実 | 根拠 |
|---|---|---|
| F1 | /api 3ルートの呼び出し元はすべてログイン必須ページ配下：`/api/workers` ← [employees/new/page.tsx:164](app/employees/new/page.tsx:164)、`/api/documents/generate` ← [employees/[id]/page.tsx:323,421,464](app/employees/[id]/page.tsx:323)・[reports/annual/page.tsx:107](app/reports/annual/page.tsx:107)・[InterviewTaskModal.tsx:181](components/InterviewTaskModal.tsx:181)・[EmploymentConditionsWizard.tsx:566](components/EmploymentConditionsWizard.tsx:566)（いずれも `/employees/*`・`/reports/*` で使用、proxy で保護） | grep |
| F2 | **signup 無効化を確認**：`disable_signup: true`（B1 時点では false） | `/auth/v1/settings`（GET） |
| F3 | 画面からの `fetch('/api/...')` は同一オリジンなのでログイン cookie が自動送信される | — |
| F4 | `/api/notifications/check-expiry` はアプリ内に呼び出し元なし。`vercel.json`・`.github/` も無い | ls / grep |
| F5 | `lib/supabase/server.ts` は Next 16 の async `cookies()` に対応済み（`await cookies()`）。今回変更なし | [lib/supabase/server.ts](lib/supabase/server.ts)、`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md` |

---

## 3. コード変更（実施済み）

3ルート共通の変更：

```ts
// 変更前
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY ?? ANON_KEY, { auth: { persistSession: false } })

// 変更後
import { createClient } from '@/lib/supabase/server'
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
```

| ファイル | 変更 |
|---|---|
| [app/api/workers/route.ts](app/api/workers/route.ts) | 上記。**ロールバックの DELETE（:53 付近）は変更なし** |
| [app/api/documents/generate/route.ts](app/api/documents/generate/route.ts) | 上記。認証チェックを body 解析より前に移動（未ログインは入力検証より先に 401） |
| [app/api/notifications/check-expiry/route.ts](app/api/notifications/check-expiry/route.ts) | 上記 |
| [verify_api_auth.mjs](verify_api_auth.mjs)（新規） | 検証スクリプト。Playwright 同梱ブラウザが未導入のためシステム Chrome（`channel: 'chrome'`）で起動 |

- `SUPABASE_SERVICE_ROLE_KEY` への参照はアプリから消えた（grep 0件）。
- proxy.ts の matcher には `/api` を足していない（足すと 401 ではなくログイン画面への HTML リダイレクトになり、fetch 側のエラー処理が崩れるため）。
- `app/employees/[id]/page.tsx:671` のロールバック DELETE も変更なし（裁定③）。

---

## 4. 検証結果（ローカル・旧ポリシーのまま）

`npx tsc --noEmit`：**PASS**

`node verify_api_auth.mjs`（localhost:3000、テスト用アカウントでログイン）：

| # | 確認 | 結果 |
|---|---|---|
| V1 | 未ログインで `/api/workers` POST | **PASS** 401 |
| V1 | 未ログインで `/api/documents/generate` POST | **PASS** 401 |
| V1 | 未ログインで `/api/notifications/check-expiry` POST | **PASS** 401 |
| V2 | ログイン後 `/api/workers` で TEST 従業員作成 | **PASS** 200 |
| V2 | 作成した従業員の詳細画面に名前と「特定技能1号」 | **PASS** |
| V3 | `/api/documents/generate`（koyou_joken）を TEST 従業員で生成 | **PASS** 200・docx 36,699 bytes |
| V4 | 従業員一覧にデモ従業員と TEST 従業員 | **PASS** |
| V4 | ダッシュボード表示で console error なし | **FAIL** → 今回の変更とは無関係（下記 G1） |

- check-expiry のログイン後呼び出しは**意図的に未実施**（LINE 通知が実送信されるため）。
- 定期届出（teiki_hokoku）の生成は未実施（document_generations に worker_id=NULL の行が増え、クリーンアップ対象がデモの既存行と紛れるため）。読み取るテーブル（organizations / foreign_workers / payroll_records / employment_conditions）は V2-V4 で authenticated での読取を確認済み。

### G1：既存の不具合（今回の範囲外・要報告）

ダッシュボードの `employment_condition_history?…&todoke_status=eq.pending` が **HTTP 400**（`column employment_condition_history.todoke_status does not exist`）。
- 原因：`add_todoke_tracking_to_ech.sql`（コミット 854174c で追加）が**実DB に未適用**。
- 影響：随時届出（3-1-1号）の未対応がダッシュボードに出ない。今回の変更前から発生している（ブラウザから Supabase へ直接送るクエリで、/api を通らない）。
- 対応：DB スキーマ変更のため今回は触らない。デモ前に適用するかは WB 判断。

### テストデータ（クリーンアップ待ち）

| テーブル | 行 |
|---|---|
| foreign_workers | `7d78dd14-1ada-4cbf-95e4-c7c515ad94a5`（TEST B2 AUTHCHECK、カード番号 ZZ00000002ZZ） |
| residence_statuses | 上記 worker_id の1行 |
| document_generations | 上記 worker_id の koyou_joken 1行 |
| trust_score_snapshots | 詳細画面表示時に作られた可能性あり（上記 worker_id） |

完了時に SELECT 提示 → 承認 → 削除する（residence_statuses を先に削除 → foreign_workers。document_generations / trust_score_snapshots は CASCADE）。

---

## 5. DB ポリシー変更（未実施・Q2 確定後に実行）

裁定③により、**ポリシーの中身（FOR ALL・USING(true)・WITH CHECK(true)）は変えず、対象ロールだけ PUBLIC → authenticated に変える**。
`ALTER POLICY … TO` を使うので、USING / WITH CHECK はそのまま残り、ポリシー名も変わらない。

| テーブル | 旧（repo SQL より推定・Q2 で確定） | 新 |
|---|---|---|
| foreign_workers | `foreign_workers_all` FOR ALL TO **public** | `foreign_workers_all` FOR ALL TO **authenticated**（DELETE 含む） |
| residence_statuses | `residence_statuses_all` FOR ALL TO **public** | `residence_statuses_all` FOR ALL TO **authenticated** |
| payroll_records | `payroll_records_all` FOR ALL TO **public** | `payroll_records_all` FOR ALL TO **authenticated** |

### 適用 SQL（案）

```sql
BEGIN;
ALTER POLICY "foreign_workers_all"    ON public.foreign_workers    TO authenticated;
ALTER POLICY "residence_statuses_all" ON public.residence_statuses TO authenticated;
ALTER POLICY "payroll_records_all"    ON public.payroll_records    TO authenticated;

-- 確認（3行・roles={authenticated}・cmd=ALL であること）
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('foreign_workers', 'residence_statuses', 'payroll_records')
ORDER BY tablename;
COMMIT;
```

### ロールバック SQL

```sql
BEGIN;
ALTER POLICY "foreign_workers_all"    ON public.foreign_workers    TO public;
ALTER POLICY "residence_statuses_all" ON public.residence_statuses TO public;
ALTER POLICY "payroll_records_all"    ON public.payroll_records    TO public;
COMMIT;
```

### Q2 で必ず確認すること（確認できるまで適用しない）

| # | 確認点 | 食い違った場合 |
|---|---|---|
| C1 | 3テーブルのポリシーが `*_all` の **1本ずつだけ**か | ダッシュボード作成の別ポリシー（例「Enable read access for all users」TO public）が残っていると、OR 評価で anon に開いたまま → そのポリシーも TO authenticated にする SQL を追加提示 |
| C2 | 3本の roles が `{public}` か | `{anon,authenticated}` 等なら同じ ALTER で問題ない |
| C3 | 3テーブルの RLS が有効か（Q1） | 無効ならポリシー変更は無意味 → 別途 ENABLE を提案 |
| C4 | ポリシー名が repo と一致するか | 不一致なら ALTER の名前を差し替え |

実行者：ローカルに PAT が無いので **WB が SQL Editor で実行**。

### 適用後の確認

1. anon キーで3テーブルを GET → **0件**（現在は 10 / 10 / 30 件見えている）
2. `node verify_api_auth.mjs` を再実行 → V1〜V4 が同じ結果
3. 給与画面での upsert（INSERT＋UPDATE 経路）を画面で確認

---

## 6. 検証スクリプトで壊れるもの（今回は壊れてよい）

| スクリプト | 壊れる時点 | 理由 |
|---|---|---|
| `verify_compliance_dashboard.mjs` | コード変更後（今） | `/api/workers`・`/api/documents/generate` を cookie なしで呼ぶ → 401 |
| `verify_dashboard_timeline.mjs` | 今 | `/api/workers` → 401 |
| `verify_retire_notice_by_status.mjs` | 今 | `/api/workers` → 401 |
| `verify_retire_and_card_update.mjs` | 今＋ポリシー後 | `/api/workers` → 401。anon で foreign_workers / residence_statuses を GET → 0件 |
| `verify_trust_score.mjs` | 今＋ポリシー後 | `/api/workers` ×2 → 401。anon で payroll_records を POST → RLS 違反 |
| `verify_ui_phase2.mjs` | 今＋ポリシー後 | `/api/workers` → 401。anon で payroll_records を POST → RLS 違反 |
| 影響なし | — | `verify_logout.mjs`・`verify_obligations_migration.mjs`・`verify_support_matrix.mjs`・`verify_doc_buttons.mjs`・`screenshot_trust_score.mjs`、新規 `verify_api_auth.mjs` |

テストデータのクリーンアップは従来通り SQL Editor（RLS 対象外）で行うので影響なし。

---

## 7. 残りの手順

1. ~~コード変更 → tsc → ローカル Playwright~~ 完了
2. コミット → **push（WB 承認済み）** → Vercel デプロイ完了の確認
   - 確認方法：本番 `/api/documents/generate` に未ログインで空 body を POST。旧コードは入力検証で **400**（DB 書込なし）、新コードは **401** を返すので、401 になればデプロイ完了と判断できる
3. **WB が本番で demo3 ログイン → 従業員一覧表示を確認**（本番環境へのログインは Claude からは行わない）
4. WB が Q1/Q2/Q6/Q7 を貼る → C1〜C4 を確認 → 必要なら §5 の SQL を修正して再提示
5. WB 承認 → WB が SQL Editor で §5 を実行 → 適用後の確認
6. テストデータの SELECT 提示 → 承認 → クリーンアップ

## 未確認事項

| # | 内容 |
|---|---|
| U1 | 実DB ポリシー（Q1/Q2/Q6/Q7）— **これが無いと §5 を実行できない** |
| U2 | Vercel の `SUPABASE_SERVICE_ROLE_KEY` 設定有無（フォールバックを外したので結論には影響しない） |

## GAP

| # | GAP |
|---|---|
| GAP-1 | ログインユーザーは全データを DELETE 可能（裁定③の残存リスク）→ テナント分離＋論理削除の回で解消 |
| GAP-2 | `/api/workers` のロールバックが非トランザクション（DELETE 依存）→ RPC/トランザクション化が必要 |
| GAP-3 | `add_todoke_tracking_to_ech.sql` が実DB に未適用（G1） |
| GAP-4 | 検証スクリプト6本が anon 前提のまま（§6） |

## 中文摘要（给 WB）

**① 进展和需要你做的事**
- 3个接口已改为“必须登录才能用”，并去掉了管理员密钥的后备逻辑。本地测试全部通过：未登录返回401；登录后员工登记、文书生成、员工列表都正常。
- 按你的批准，接下来提交并 push。push 后我会确认 Vercel 部署完成。之后**请你在正式环境用 demo3 登录，看一下员工列表是否正常**（我不登录正式环境）。
- 然后请贴 Q1、Q2、Q6、Q7 的结果。确认数据库实际规则后，才执行权限修改的 SQL（由你在 SQL Editor 里执行）。

**② 方案（已按你的决定修改）**
- 不去掉删除权限，只把3张表的规则从“所有人”改成“登录用户”。每张表一句 SQL，规则内容不变。回滚也是每张表一句。
- 报告已写明残存风险：登录用户仍可删除所有数据，留到做公司隔离和逻辑删除时解决。

**③ 风险和其他发现**
- 本次代码改动对登录后的功能没有影响（已测试）。
- **另发现一个旧问题（与本次无关）：** 首页（仪表盘）有一个查询报错，因为之前写好的“随时届出跟踪”数据库脚本没有在数据库里执行。结果是首页不会显示待办的变更届出。演示前要不要补执行，由你决定。
- 测试时创建了1个 TEST 员工，最后会先列给你看，你批准后再删除。
