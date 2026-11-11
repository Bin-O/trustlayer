# セッションB1 報告書：RLS テナント分離の事前調査

- 作成日：2026-11-11
- 種別：**調査のみ**（コード変更なし・SELECT/GET 以外の DB 操作なし）
- 状態：**報告済み → WB 承認待ち**（実装は別セッション）

---

## 0. 調査方法と限界（最初に必読）

| 項目 | 内容 |
|---|---|
| DB 直接接続 | **不可**。`.env.local` には `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` の2つだけで、`run_sql.mjs` が要求する `SUPABASE_PAT` も `SERVICE_ROLE_KEY` も無い |
| そのため pg_policies / information_schema / auth.users | **直接 SELECT できていない**。PostgREST の OpenAPI も service_role 専用（HTTP 401） |
| 代わりに行ったこと | ① anon キーで REST の **GET のみ**（現状 RLS が USING(true) なので読める）→ テーブル存在・列・行数・org 分布を確認 ② `/auth/v1/settings`（公開エンドポイント）で signup 設定を確認 ③ リポジトリ内の全 `*.sql` からポリシー定義を復元 ④ アプリコード全体の grep |
| 未確認を埋めるには | **§7 の読取専用 SQL を WB が SQL Editor で実行**し、結果を貼ってもらう必要がある（特に (1)(4) のアカウント紐付け） |

---

## 1. auth.users と organizations の関連

### 結論：**アプリとして機能している紐付けの仕組みは「無い」**

| # | 事実 | 根拠 |
|---|---|---|
| F1 | コードは **組織IDを5箇所でハードコード**（`11111111-…`）。ログインユーザーから組織を引く処理は1つも無い | [settings/organization/page.tsx:7](app/settings/organization/page.tsx:7)、[api/workers/route.ts:4](app/api/workers/route.ts:4)、[api/documents/generate/route.ts:16](app/api/documents/generate/route.ts:16)、[AppHeader.tsx:8](components/AppHeader.tsx:8)、[EmploymentConditionsWizard.tsx:8](components/EmploymentConditionsWizard.tsx:8) |
| F2 | 認証は「ログインしているか」だけを見る。`user.id`・`app_metadata`・`user_metadata` を参照する箇所はゼロ | [proxy.ts:29](proxy.ts:29)（`getUser()` → 未ログインなら `/` へ） |
| F3 | `profiles` / `memberships` / `organization_members` / `user_organizations` テーブルは **存在しない**（PGRST205） | anon GET |
| F4 | ただし **`public.users` テーブルが存在する**（列：`id, email, org_id, role, name, created_at`）。anon からは **0行に見える**。リポジトリに定義 SQL が無く（ダッシュボードで作成されたと推定）、コードからも一切参照されていない | anon GET（列は存在確認で判定） |
| F5 | JWT カスタムクレーム（Custom Access Token Hook）を使うコード・SQL は無い。Hook の設定有無はダッシュボード側なので **未確認** | grep |
| F6 | **signup が誰でも可能**：`disable_signup: false`、`mailer_autoconfirm: true`（メール確認なしで即ログイン可） | `/auth/v1/settings` |

F6 の意味：現状のポリシーを「authenticated のみ許可」に変えるだけでは**分離にならない**。誰でも自分でアカウントを作って authenticated になれるため。

### 作る必要があるもの（提案）

1. **ユーザー→組織マッピング**：既存の `public.users`（`id, org_id, role` を持つ）を流用するのが最小。
   ただし `id` が `auth.users(id)` を FK 参照しているか・RLS 状態が不明なので §7 の Q3 で確認してから決める。
   不適切なら `organization_members(user_id → auth.users, organization_id → organizations, role, PK(user_id, organization_id))` を新設。
2. **ヘルパー関数** `public.current_org_id()`：`SECURITY DEFINER STABLE`、`SELECT org_id FROM public.users WHERE id = auth.uid()`。
   ポリシー内で毎回マッピング表を JOIN すると、マッピング表自身の RLS と再帰・性能問題が出るため関数に閉じ込める。
   （代替：`auth.users.raw_app_meta_data` に `org_id` を入れて `auth.jwt()->'app_metadata'->>'org_id'` で読む方式。テーブル不要だが、変更後は再ログインまでトークンに反映されない）
3. **signup の無効化**（Dashboard → Auth → `disable_signup`）。マッピング未登録ユーザーは何も見えない設計にするので必須ではないが、閉じるべき。

---

## 2. 全テーブルと organization への到達経路

> テーブル一覧は **名前を推測して存在確認した結果**（information_schema を読めないため）。漏れがあり得る → §7 Q1 で確定させる。
> ポリシーは **リポジトリの SQL から復元したもの**。実DB と一致するかは §7 Q2 で確認が必要。

| # | テーブル | org 列を直接持つか | 持たない場合の経路 | 現在のポリシー（cmd / roles）※repo SQL より | 行数(anon) |
|---|---|---|---|---|---|
| 1 | organizations | —（自身が org。`id`） | — | SELECT: anon,authenticated ／ UPDATE: anon,authenticated（`settings_org_setup.sql:63,66`）。旧 `fix_organizations.sql:19,27` の SELECT 2本も残存の可能性 | 1 |
| 2 | organization_defaults | ✅ `organization_id` | — | SELECT/INSERT/UPDATE: authenticated & anon（`settings_org_setup.sql:28-76`） | 1 |
| 3 | foreign_workers | ✅ **`org_id`**（名前が他と違う） | — | **ALL（DELETE含む）: 全ロール(PUBLIC)** USING(true) WITH CHECK(true)（`fix_foreign_workers_rls.sql:12`） | **10** |
| 4 | residence_statuses | ❌ | worker_id → foreign_workers.org_id | **ALL: 全ロール**（`fix_residence_statuses_rls.sql:16`） | 10 |
| 5 | worker_contracts | ❌ | worker_id → foreign_workers.org_id | SELECT/INSERT: auth & anon、UPDATE: auth（`supabase_documents_setup.sql:297-321`）。DELETE なし | 8 |
| 6 | employment_conditions | ❌ | worker_id → foreign_workers.org_id | SELECT/INSERT: auth & anon、UPDATE: auth（`supabase_documents_setup.sql:124-148`） | 8 |
| 7 | employment_condition_history | ❌ | worker_id → foreign_workers.org_id | SELECT/INSERT/UPDATE: **authenticated のみ**（`history_table_setup.sql:17,22`、`add_todoke_tracking_to_ech.sql:31`） | 0（anon には見えない＝整合） |
| 8 | evaluations | ❌ | worker_id → foreign_workers.org_id（support_record_id → support_records.organization_id でも可） | SELECT/INSERT/UPDATE: auth & anon（`supabase_setup.sql:21-37`、`trust_score_setup.sql:94`） | 12 |
| 9 | payroll_records | ✅ `organization_id`（**NULL 許容、実際に3行 NULL**） | NULL 行は worker_id → foreign_workers.org_id | **ALL: 全ロール**（`fix_payroll_rls.sql:4`） | 30 |
| 10 | document_generations | ❌ | worker_id → foreign_workers.org_id。**ただし定期届出の行は worker_id=NULL で経路なし**（実データ1行） | SELECT/INSERT: auth & anon（`create_document_generations.sql:24-42`） | 18 |
| 11 | qualifications | ✅ `organization_id` NOT NULL | — | SELECT/INSERT/UPDATE: auth & anon（`trust_score_setup.sql:30-41`） | 4 |
| 12 | support_records | ✅ `organization_id` NOT NULL | — | SELECT/INSERT/UPDATE: auth & anon（`trust_score_setup.sql:68-79`） | 14 |
| 13 | support_tasks | ✅ `organization_id` NOT NULL | — | SELECT/INSERT/UPDATE: auth & anon（`create_support_tasks.sql:34-45`） | 30 |
| 14 | trust_score_snapshots | ✅ `organization_id` NOT NULL | — | SELECT/INSERT/UPDATE: auth & anon（`trust_score_setup.sql:117-128`） | 19 |
| 15 | worker_work_assignments | ✅ `organization_id` NOT NULL | — | SELECT/INSERT/UPDATE: auth & anon（`create_industry_package.sql:35-46`） | 1 |
| 16 | obligations | —（全社共通マスタ） | 分離不要 | SELECT: auth & anon のみ（`create_obligations_master.sql:143-147`） | 1 |
| 17 | obligation_instances | ✅ `organization_id` NOT NULL | — | SELECT/INSERT/UPDATE: auth & anon（`create_obligations_master.sql:255-271`） | 0 |
| 18 | users | ✅ `org_id` | — | **repo に定義なし・不明** | 0（空か非表示か不明） |
| 19 | documents | ✅ `org_id`（＋worker_id） | — | **repo に定義なし・不明**。コード未使用 | 0（同上） |
| 20 | notifications | ❌ | worker_id → foreign_workers.org_id | **repo に定義なし・不明**。コード未使用 | 0（同上） |
| 21 | audit_logs | ✅ `org_id`（＋user_id） | — | **repo に定義なし・不明**。コード未使用 | 0（同上） |

補足：
- 直接 org 列を持つ子テーブルも全て `worker_id` を持つ。`organization_id` と `worker.org_id` の不一致チェックは未実施（現状 org が1社しかないので不一致は起こり得ない）。
- `organizations`・`foreign_workers`・`residence_statuses` の CREATE TABLE はリポジトリに無い（ダッシュボード作成）。
- トリガー関数 `obligation_instances_verify_evidence()` は SECURITY DEFINER ではない（`create_obligations_master.sql:203-204`）→ RLS 下では呼出ユーザー権限で証拠行を探す。同一組織なら問題なし。

---

## 3. anon（未ログイン）のまま読み書きしている箇所

### 3.1 アプリ本体

| # | 箇所 | 内容 | RLS 後の影響 |
|---|---|---|---|
| A1 | **`/api/*` は認証ガードの対象外** | `proxy.ts` の matcher は `/dashboard /employees /reports /settings` のみ（[proxy.ts:42-46](proxy.ts:42)）。API は未ログインでも叩ける | — |
| A2 | [api/workers/route.ts:7](app/api/workers/route.ts:7) | `SUPABASE_SERVICE_ROLE_KEY ?? ANON_KEY` で **cookie を渡さない** supabase-js クライアントを作成 → ローカルでは **anon で** foreign_workers / residence_statuses に INSERT（失敗時 DELETE） | service_role が無い環境では **従業員登録が壊れる** |
| A3 | [api/documents/generate/route.ts:111](app/api/documents/generate/route.ts:111) | 同上。anon で organizations / foreign_workers / employment_conditions / worker_contracts / payroll_records / support_records を読み、document_generations に INSERT。定期届出は **org 絞り込みなしで全従業員を読む**（:130-136） | **全帳票生成が壊れる**（デモの中心機能） |
| A4 | [api/notifications/check-expiry/route.ts:38](app/api/notifications/check-expiry/route.ts:38) | 同上。全 active 従業員を org 絞り込みなしで読む。アプリ内に呼出元なし（手動/外部 cron 想定） | 通知が0件になる |
| A5 | ログイン画面 [app/page.tsx:18](app/page.tsx:18) | `signInWithPassword` のみ。**ログイン前にデータを読むページは無い** | 影響なし |
| A6 | 画面（dashboard / employees / reports / settings / 各 lib） | すべてブラウザクライアント（[lib/supabase/client.ts](lib/supabase/client.ts)）経由で、ログイン後は **authenticated ロール** | anon ポリシー削除の影響なし。org 絞り込みの影響のみ |
| A7 | Edge Function | `supabase/` ディレクトリ無し。**存在しない** | — |
| A8 | [lib/supabase/server.ts](lib/supabase/server.ts) | cookie を使う正しいサーバークライアントが **既にあるが未使用** | A2-A4 の修正に流用可能 |

**未確認（重要）**：本番 Vercel に `SUPABASE_SERVICE_ROLE_KEY` が設定されているか。
- 設定あり → A2-A4 は RLS を**バイパス**する（壊れないが、他社データも読む＝分離にならない）
- 設定なし → A2-A4 は anon で動いており、anon を閉じた瞬間に**壊れる**
→ どちらでも A2-A4 の改修は必須。WB に Vercel の Environment Variables を確認してもらう必要あり。

### 3.2 スクリプト（検証用）

| ファイル | anon での書込 |
|---|---|
| `verify_trust_score.mjs` | REST に anon で qualifications / support_records / evaluations 等を INSERT・PATCH |
| `verify_ui_phase2.mjs` | anon で payroll_records を INSERT |
| `verify_compliance_dashboard.mjs` / `verify_retire_and_card_update.mjs` | anon で REST 読み書き＋`/api/workers` |
| `verify_logout.mjs` / `verify_dashboard_timeline.mjs` / `verify_trust_score.mjs` | **signup API でテストユーザーを作成**（`wenbinxx77+logout-test@…`、`+tl-test-<時刻>@…`、`+trust-test-<時刻>@…`）→ auth.users に複数のテストアカウントが溜まっている可能性 |

RLS 後はこれらの検証スクリプトは anon 部分が動かなくなる（本番機能には影響しない）。

### 3.3 org_id を入れずに書き込んでいる箇所（RLS 後に「消える」行を作る）

| # | 箇所 | 事実 |
|---|---|---|
| W1 | [employees/[id]/payroll/page.tsx:160](app/employees/[id]/payroll/page.tsx:160) | payroll_records の upsert に `organization_id` を入れていない → 実データで **3行が NULL**（worker 3・2・TURNER の各1件） |
| W2 | [api/documents/generate/route.ts:206](app/api/documents/generate/route.ts:206) | 定期届出の生成履歴を `worker_id=NULL` で INSERT。document_generations に org 列が無いので **どの組織の行か判別不能** |

---

## 4. 現在のデモデータの所属

| 項目 | 結果 |
|---|---|
| organizations | **1件のみ**：`11111111-1111-1111-1111-111111111111`「株式会社アーチ」（industry: 自動車運送業・工業製品製造業） |
| 従業員 | **8名ではなく10名**、全員 `org_id = 1111…`、全員 `status='active'` |
| 内訳 | デモ8名（`a1000000-…-000000000001`〜`008`、2026-07-21 作成、`seed_arch_demo.sql` 由来） ＋ **「TURNER ELIZABETH」2名**（`6b61a5e0-…` 2026-07-26 作成、`8077a698-…` 2026-10-16 作成） |
| 子テーブル | 直接 org 列を持つテーブルはすべて `1111…`（payroll_records の NULL 3行を除く） |

**TURNER ELIZABETH 2名について**：TEST 名義ではなく、出自不明（在留カード OCR の試験登録か？）。実在人物かテストか WB に確認が必要。今回は一切触っていない。

### 3アカウントの紐付け

| アカウント | 結果 |
|---|---|
| WB 普段使いアカウント | **未確認**（メールアドレス不明・auth.users を読めない） |
| wenbinxx77+tltest@gmail.com | **未確認**（`.test-user-cred.json` に登録されているアカウントと一致することは確認） |
| demo3@trustlayer.com | **未確認**（`docs/demo-runbook.md:5,91` で当日用と明記） |

確実に言えること：
- コード上は**どのアカウントも組織に紐づいていない**。全員が F1 のハードコードにより `1111…` のデータを見ている。
- DB 上の唯一の候補 `public.users` は anon から0行。中身・RLS は §7 Q3/Q5 で確認が必要。

---

## 5. 移行案

### 前提作業（どの案でも必要・先にやる「Phase 0」）

この段階では**画面の見え方は一切変わらない**ことが条件。

| # | 作業 | 種別 |
|---|---|---|
| P1 | マッピング整備（`public.users` 流用 or 新設）＋ `current_org_id()` 関数 | DB スキーマ変更（要承認） |
| P2 | demo3 / tltest / WB 普段使いの3アカウントを `1111…` に登録。スクリプトが作った不要テストアカウントは削除候補として一覧提示 | DB INSERT（要承認） |
| P3 | A2-A4 の API ルートを「ログインユーザーの cookie で動く」[lib/supabase/server.ts](lib/supabase/server.ts) に切替＋未ログインは 401 | コード |
| P4 | W1：payroll upsert に `organization_id` を追加＋既存 NULL 3行を worker の org で埋める | コード＋DB UPDATE（要承認） |
| P5 | W2：document_generations に `organization_id` 列追加＋既存行を埋める | DB スキーマ変更＋UPDATE（要承認） |
| P6 | signup 無効化 | Supabase 設定（WB 操作） |
| P7 | **ロールバック用 SQL の事前生成**：§7 Q6 で現ポリシーを `CREATE POLICY …` 文として書き出し保存 | SELECT のみ |

**安心材料**：組織が1社しか無く、デモで使う全アカウントを `1111…` に登録すれば、組織絞り込み後も**見えるデータは理論上いまと同じ**。事故が起きるのは「アカウント登録漏れ」「関数・ポリシーの書き損じ」「anon で動いている A2-A4」の3パターンに限られる。

---

### 案A：一括切替（全テーブルを1トランザクションで）

- 内容：Phase 0 の後、全 21 テーブルの既存ポリシーを DROP し、組織絞り込みポリシー（直接型 `organization_id = current_org_id()`／経由型 `EXISTS (SELECT 1 FROM foreign_workers fw WHERE fw.id = worker_id AND fw.org_id = current_org_id())`）を1本の SQL で作成。anon ポリシーは作らない。
- 壊れるリスク：**高**。1箇所の書き損じ・登録漏れで、ダッシュボード・従業員詳細・帳票など**複数画面が同時に空になる**。RLS は失敗してもエラーにならず空配列を返す（既知の落とし穴）ので、気付きにくい。
- 戻し方：P7 で保存した旧ポリシー SQL を一括実行（数秒）。ただし新ポリシーの DROP も要るので「新ポリシー DROP → 旧ポリシー CREATE」の対で用意する。
- 長所：中途半端な状態が存在しない。作業回数1回。

### 案B：段階的切替（推奨）

| 段階 | 内容 | 壊れるリスク | 戻し方 |
|---|---|---|---|
| B-1 | **anon ポリシーだけ削除**（authenticated の USING(true) は残す）。FOR ALL TO PUBLIC の3テーブル（foreign_workers / residence_statuses / payroll_records）は `TO authenticated` に作り直す | 低（P3 済みなら）。未ログインアクセスが閉じるだけで、ログイン後の画面は変化なし | 削除した anon ポリシーを再作成 |
| B-2 | 末端テーブルから1〜数テーブルずつ組織絞り込みへ（例：organization_defaults → trust_score_snapshots / obligation_instances / worker_work_assignments → qualifications / support_* → 経由型の子テーブル群 → **最後に foreign_workers と organizations**） | 中→低。壊れても**その画面の一部だけ**。各段階で Playwright 確認 | そのテーブルの旧ポリシーだけ復元 |
| B-3 | 未使用テーブル（users / documents / notifications / audit_logs）の扱いを決める | 低 | — |

- 長所：事故の影響範囲が小さく、原因の特定が容易。
- 短所：作業回数が多い。途中は「一部だけ絞り込み済み」の状態になる（ただし1社しか無いので実害なし）。

### 案C：RESTRICTIVE ポリシーの上乗せ

- 内容：既存の USING(true) ポリシー（PERMISSIVE）は**一切触らず**、各テーブルに `AS RESTRICTIVE … USING (組織条件)` のポリシーを1本ずつ足す。Postgres は PERMISSIVE を OR、RESTRICTIVE を AND で評価するので、結果的に組織絞り込みが効く。
- 壊れるリスク：案Bと同程度（テーブル単位で足せる）。RESTRICTIVE を `TO public` にすれば anon（`auth.uid()` が NULL）も自動的に0行になる → P3 未完了だと A2-A4 が壊れる点は同じ。
- 戻し方：**そのテーブルの RESTRICTIVE ポリシー1本を DROP するだけ**。旧ポリシーを復元する必要がないので、戻しが最も速く確実。
- 短所：USING(true) の古いポリシーが残り続けて見通しが悪い。デモ後に整理（PERMISSIVE も正規化）する二度手間が出る。

### 進め方の推奨

- **案B の段階分けで、各段階の実装手段は案C（RESTRICTIVE 上乗せ）**にする組み合わせを推奨。戻しが「DROP 1本」で済むため、デモ前でも安全に進めやすい。
- 日程：本日 11/11、デモ 11/20。**Phase 0 と B-1 はデモ前に完了させる価値が高い**（未ログインで全データが読み書きできる状態は最優先で閉じるべき）。B-2 は 11/17 までに終わらなければ**デモ後に回す**判断基準を推奨（最終変更からデモまで最低2日の確認期間を確保）。
- 各段階の完了条件：demo3 でログイン → ダッシュボード・従業員一覧（10名）・従業員詳細・帳票生成（雇用条件書・定期届出）・設定画面が表示できることを Playwright で確認＋「マッピング未登録ユーザーでは0件」の否定テスト。

---

## 6. 判断とその理由

| # | 判断 | 理由 |
|---|---|---|
| D1 | DB 確認は anon の GET で代替し、未確認部分は SQL を WB に渡す | PAT/service_role が無く、CLAUDE.md で認証情報・env の変更は要承認のため勝手に取得・追加しない |
| D2 | テストアカウントでのログイン（パスワード使用）による user.id 取得はしない | 本番 Supabase への認証になるうえ、取得できるのは1件のみで (4) を埋めきれない |
| D3 | 書込系の検証（anon で DELETE が本当に通るか等）は行わない | タスク制約（SELECT 以外禁止） |
| D4 | TURNER ELIZABETH 2名は出自不明として報告のみ | 実在かテストか判断できない |

---

## 7. WB に実行してほしい読取専用 SQL（Supabase SQL Editor）

すべて SELECT のみ。結果を貼ってもらえれば (1)(2)(4) の未確認部分を確定できる。

```sql
-- Q1: public スキーマの全テーブルと RLS 有効状態
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY 1;

-- Q2: 実際のポリシー一覧（cmd / roles）
SELECT tablename, policyname, permissive, cmd, roles, qual, with_check
FROM pg_policies WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;

-- Q3: public.users の定義と FK
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users' ORDER BY ordinal_position;

SELECT conrelid::regclass AS tbl, conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE contype = 'f' AND connamespace = 'public'::regnamespace
ORDER BY 1, 2;

-- Q4: org への列（到達経路の確定用）
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('org_id', 'organization_id', 'worker_id', 'user_id')
ORDER BY 1, 2;

-- Q5: アカウントと組織の紐付け（パスワードハッシュは含まない）
SELECT u.id, u.email, u.created_at, u.last_sign_in_at,
       u.raw_app_meta_data, u.raw_user_meta_data,
       pu.org_id AS users_org_id, pu.role AS users_role
FROM auth.users u
LEFT JOIN public.users pu ON pu.id = u.id
ORDER BY u.last_sign_in_at DESC NULLS LAST;

SELECT * FROM public.users;

-- Q6: ロールバック用：現ポリシーを CREATE 文として書き出す（結果を保存しておく）
SELECT format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;',
  policyname, schemaname, tablename, permissive, cmd,
  array_to_string(roles, ', '),
  CASE WHEN qual IS NOT NULL THEN ' USING (' || qual || ')' ELSE '' END,
  CASE WHEN with_check IS NOT NULL THEN ' WITH CHECK (' || with_check || ')' ELSE '' END) AS ddl
FROM pg_policies WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Q7: anon に付与されているテーブル権限
SELECT table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privs
FROM information_schema.role_table_grants
WHERE grantee = 'anon' AND table_schema = 'public'
GROUP BY table_name ORDER BY 1;
```

---

## 8. 未確認事項

| # | 内容 | 確認方法 |
|---|---|---|
| U1 | 実 DB のポリシー（repo SQL からの復元と一致するか。ダッシュボードで手作業追加されたものが無いか） | Q2 |
| U2 | テーブル一覧の完全性（名前推測で21件発見） | Q1 |
| U3 | `public.users` / `documents` / `notifications` / `audit_logs` が空なのか RLS で見えないだけなのか | Q1・Q2・Q5 |
| U4 | 3アカウントの user.id と組織紐付け／WB 普段使いアカウントのメール | Q5 |
| U5 | 本番 Vercel の `SUPABASE_SERVICE_ROLE_KEY` 設定有無 | Vercel ダッシュボード（WB） |
| U6 | Custom Access Token Hook の設定有無 | Supabase Dashboard → Auth → Hooks（WB） |
| U7 | TURNER ELIZABETH 2名の出自 | WB |
| U8 | anon で DELETE が実際に通るか（FOR ALL の3テーブル） | 制約により未検証。ポリシー定義上は通る |

## 9. GAP 一覧

| # | GAP |
|---|---|
| GAP-1 | ユーザー→組織マッピングが機能していない（F1-F4） |
| GAP-2 | signup が開放＋メール確認なし（F6）→ authenticated 限定だけでは分離にならない |
| GAP-3 | `/api/*` が認証ガード外で、DB アクセスが anon or service_role（A1-A4） |
| GAP-4 | 定期届出・期限通知が org 絞り込みなしで全従業員を読む（A3・A4） |
| GAP-5 | payroll_records の organization_id NULL 書込（W1、実データ3行） |
| GAP-6 | document_generations に org 列が無く、worker_id=NULL 行は帰属不明（W2） |
| GAP-7 | foreign_workers / residence_statuses / payroll_records は anon でも DELETE 可能なポリシー |
| GAP-8 | 組織ID ハードコード5箇所（RLS 移行後も1社前提のまま。複数社対応時に要置換） |
| GAP-9 | 検証スクリプトが anon で REST 書込・signup している（RLS 後に動かなくなる） |

---

## 10. 中文摘要（给 WB）

**① 这次在问什么**
调查已完成（没有改任何代码和数据）。需要 WB 做两件事：
- 在 Supabase SQL Editor 里执行第7节的只读 SQL（Q1〜Q7），把结果贴回来。因为本地没有管理员密钥，我无法直接读取账号表（auth.users）和策略表（pg_policies），所以3个账号属于哪个公司目前**无法确认**。
- 确认 Vercel 上是否设置了 `SUPABASE_SERVICE_ROLE_KEY`，以及两名“TURNER ELIZABETH”员工是真实数据还是测试数据（数据库里实际有10名员工，不是8名）。

**主要发现**：
- 目前**没有**“用户属于哪个公司”的机制，代码把公司ID写死了5处。数据库里有一张 `public.users` 表（有 org_id 列），但没人用，内容未知。
- 任何人都可以自己注册账号并立刻登录 → 只改成“登录用户才能看”并不能隔离。
- 3个后台接口（员工登记、文书生成、期限通知）不经过登录检查，并以匿名身份访问数据库 → 如果直接关掉匿名权限，**文书生成等核心功能会坏**，必须先改这3个接口。

**② 方案区别**
- 方案A：所有表一次性切换。次数少，但写错一处就会多个页面同时变空白。回滚：执行事先保存的旧策略SQL。
- 方案B（推荐）：分阶段。先只关闭匿名访问，再一张表一张表地加公司过滤。出问题只影响一部分页面，容易定位。
- 方案C：不动旧策略，在上面“叠加”一条限制策略。回滚最简单——删掉那一条即可。
- 推荐：**B 的分阶段 + C 的叠加方式**。11/20 演示前先完成“准备工作 + 关闭匿名访问”；公司过滤如果 11/17 前做不完，就放到演示之后。

**③ 风险**
- 本次调查本身：零风险（只读）。
- 将来实施时：因为目前只有1家公司，只要把演示用的3个账号都登记到该公司，看到的数据理论上和现在一样。真正的风险只有三种：账号漏登记、策略写错、上述3个接口没先改好。每一步都会准备回滚SQL，并用 demo3 账号做页面验证。
