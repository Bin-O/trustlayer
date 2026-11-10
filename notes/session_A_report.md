# セッションA 報告書：義務マスタ（obligations / obligation_instances）

- 作成日：2026-11-10
- 対象仕様：`lib/documents/templates/運送業対応_変更仕様書_v4.md`（第2章・2.2.1・2.3・6.1）
- 成果物：`create_obligations_master.sql`（2026-11-10 WB が SQL Editor で実行済み）、`lib/obligationMaster.ts`（新規）、
  `app/employees/[id]/page.tsx`・`lib/industry/{types.ts,packages/manufacturing.ts,packages/transport.ts}`（変更）、
  `verify_obligations_migration.mjs`（画面検証スクリプト・新規）
- 状態：**SQL 実行済み → コード移行済み → データ同値 PASS → 画面検証 (a)(b) PASS → コミット 2e3efaa・afddb89（資産3ファイル）→ push 済み（2026-11-11 WB）**

---

## 1. 調査で分かった事実

### 1.1 ハードコードの所在

| # | 事実 | 場所 |
|---|---|---|
| F1 | ハードコードされている作業資格ルールは **フォークリフト1t以上（`forklift_1t`）の1件のみ** | `lib/industry/packages/manufacturing.ts:16-24` |
| F2 | **玉掛けは未実装**。コメントで「段Bで追加」とあるのみ | `lib/industry/packages/manufacturing.ts:25` |
| F3 | ルールの型 `WorkQualRule`（work / label / requiredQualType / requiredLevel / legalBasis / penalty） | `lib/industry/types.ts`（`WorkQualRule` 定義） |
| F4 | 判定は純関数 `computeQualGap`。業界名の分岐なし。`qualifications.type` と `level` の一致で充足判定 | `lib/qualGap.ts:24-37`（一致条件 `:33`） |
| F5 | 従業員詳細画面がパッケージから rules を取得し、その場で判定（保存しない） | `app/employees/[id]/page.tsx:235-243`（取得）、`:251-256`（判定） |
| F6 | rules が空の業界（運送）は作業資格セクションごと非表示 | `app/employees/[id]/page.tsx:1211`、`lib/industry/packages/transport.ts:57` |
| F7 | 「作業を追加」の選択肢は未割当の workQualRules から生成 | `app/employees/[id]/page.tsx:1213`、`:1256` |
| F8 | 叙事層の表示専用行 `qual_gap`（判定には不使用） | `lib/industry/packages/manufacturing.ts:31` |
| F9 | 共通義務側の表示行 `skill_training` | `lib/obligations.ts:58` |
| F10 | デモ用シード：従業員⑤に `forklift_1t` を割当（資格なし＝橙カード） | `seed_arch_demo.sql:249` |
| F11 | 作業割当テーブル定義（`UNIQUE(worker_id, work_key)`・DELETE ポリシーなし） | `create_industry_package.sql:15-26` |

### 1.2 関連テーブル

| # | 事実 | 場所 |
|---|---|---|
| F12 | `qualifications.type` のコメントは `'jlpt' \| 'skill_exam' \| 'other'` だが、コードは `'skill_training'` を使用（コメントが実態と不一致） | `trust_score_setup.sql:14` |
| F13 | `support_records` に `completed boolean` あり（evidence 検証で使用） | `trust_score_setup.sql:44-52` |
| F14 | `document_generations` に `organization_id` なし。かつ「生成した」記録であり「届け出た」証拠ではない | `create_document_generations.sql:8-13` |
| F15 | 健診記録のテーブルは存在しない。雇用条件の `health_checkup_interval` は既定値 `'1年ごと'`（仕様書 3.3 のバグ候補と一致） | `supabase_documents_setup.sql:115` |
| F16 | `establishments` テーブルは存在しない | リポジトリ全体を grep して確認 |

---

## 2. 判断とその理由

| # | 判断 | 理由 |
|---|---|---|
| D1 | 移行対象はフォークリフトのみ。玉掛けは入れない | F2 の通り玉掛けは未実装。追加すると「作業を追加」の選択肢が増え、機能変更になる（WB 裁定済み） |
| D2 | 閾値ごとに1行（`MFG_FORKLIFT_GE1T`） | 仕様書の `CARGO_FORKLIFT` は1t以上／未満を1義務にまとめているが、1つの trigger_condition で閾値の段階を表せない。CSV も段階ごとに1行 |
| D3 | trigger_condition は `work_key` ＋ `required.qual_type / level` で持つ | 仕様書の例は日本語の作業名だが、システムの照合キーは `worker_work_assignments.work_key`（F11） |
| D4 | `industry_fields = {manufacturing}` | 法令上は全業種だが、現状は製造のみ表示（F6）。機能を変えないため |
| D5 | `valid_from = 1972-10-01` | 労働安全衛生法の施行日 |
| D6 | `obligations` は SELECT ポリシーのみ | クライアントから規則を書き換えられないようにする。新テーブルの3点セット原則からの意図的な例外 |
| D7 | `obligation_instances` の RLS は既存と同じ方針（USING (true)・anon 書込可） | WB 指示。RLS 方針は別途まとめて扱う |
| D8 | 完了は CHECK＋トリガーで強制（done には evidence 必須・evidence 実在・同一主体） | 「完了にする」ボタンで緑にできる経路を DB レベルで塞ぐ |
| D9 | evidence_type は qualification / support_record のみ | トリガーで実在を検証できるものだけ。document_generations は F14 の理由で除外 |
| D10 | `cycle_key text NOT NULL DEFAULT ''` を UNIQUE に含める | 循環型（半年・年1）の履歴保持。NULL だと UNIQUE が効かず単発型の一意性が壊れる（WB 指摘） |
| D11 | establishment / company の done を CHECK で明示禁止 | 証拠層が未実装で、黙って完了不能になるのを防ぐ（GAP-1 / GAP-2） |
| D12 | 依存は `depends_on_code`（code 参照） | version が上がっても依存先が旧版に固定されない。code は一意でないため FK は張れず、末尾の確認クエリで参照切れを検出 |
| D13 | トリガーで subject_id の実在を検証（worker / company）。establishment はスキップ | 多態参照のため FK を張れない。establishments テーブルが未作成（F16） |
| D14 | トリガーに ELSE で RAISE | CHECK に種別を足してトリガーを忘れた場合に、検証なしで通さない |
| D15 | DROP POLICY IF EXISTS で冪等化 | WB が手で流すため |
| D16 | obligation_instances は今回空のまま | 行を書き込む判定エンジンはセッションB。現状の判定はその場で計算し保存しない（F5） |
| D17 | 移行後のコード方針：DB から読んだ obligations を `WorkQualRule` 形へ変換し、`computeQualGap` と UI は不変 | 「構造だけ変える」 |

---

## 3. 不明点・確認できなかったこと

| # | 内容 |
|---|---|
| U1 | **SQL は一度も実行していない。** ローカルに Postgres がなく、`.env.local` に `SUPABASE_PAT` もない（WB の指示で追加しない）。構文は目視のみ |
| U2 | 本番 DB の現状（`worker_work_assignments` / `qualifications` の実データ、`obligations` が既にあるか）を SELECT で確認できていない |
| U3 | `foreign_workers` / `organizations` の主キー列名が `id` であることは、他の SQL の FK 定義から推定した（直接は未確認） |
| U4 | テールゲートリフターの「6か月経験」が全部免除か一部省略か。仕様書 3.4.1 は「一部省略可」。一次資料は未確認 |
| U5 | はい作業主任者は「作業ごとに選任」か。1事業所1件で足りるかは未確認 |
| U6 | 認証・協議会が本社一括か事業所単位か（仕様書 第7章 #7）。GAP-2 を解除する前提 |
| U7 | コード側の移行（ローダー追加・manufacturing.ts からの削除・Playwright 検証）は未着手。SQL 実行後に行う |

---

## 4. 紙上検証（入庫せず schema への格納可否を確認）

| 件名 | 結果 | 入らなかったカラム |
|---|---|---|
| フォークリフト1t以上（移行対象） | 全部入る | — |
| a. テールゲートリフター特別教育 | 一部入る | `exemption_condition`（部分免除）、`progress_*`（2系統の積み上げ） |
| b. はい作業主任者の選任 | 入らない | `trigger_type`（事業所単位の集計発火）、evidence（選任記録）、subject_id の参照先（establishments） |
| c. 特定業務従事者健診 | 一部入る（cycle_key で履歴は入るようになった） | `trigger_type / trigger_condition`（発火の2種併用）、`evidence_type`（健診記録） |
| d. 在留期限更新 | 一部入る（cycle_key で2回目以降の更新は入るようになった） | `evidence_type`（residence_status）、`status`（申請済）、`window_start / window_end`（人ごとの相対的な期間） |

---

## 5. 既知の欠口（GAP）一覧

SQL ファイル冒頭にも同じ内容を記載済み。

| GAP | 内容 | 入らないカラム | 該当例 | 解除するセッション・方法 | 解除時に DROP |
|---|---|---|---|---|---|
| GAP-1 | establishment 主体の義務は done にできない（証拠層が未実装） | evidence_type／トリガー | はい作業主任者 | C：establishments＋選任記録テーブルを新設し、CHECK とトリガーを拡張 | `chk_oi_no_done_establishment` |
| GAP-2 | company 主体の義務は done にできない（証拠層が未実装） | evidence_type／トリガー | TRANS_CERT / TRANS_COUNCIL | C：企業単位の記録テーブル（認証・協議会）を新設し、CHECK とトリガーを拡張 | `chk_oi_no_done_company` |
| GAP-3 | 部分免除（時間短縮）を表現できない | `obligations.exemption_condition` | テールゲートリフター | B：effect（exempt / reduce）を定義し、progress_required を減算 | — |
| GAP-4 | 積み上げ進捗が1系統のみ | `obligation_instances.progress_*` | テールゲートリフター（学科＋実技） | B：progress を JSONB 配列にするか、code を分割 | — |
| GAP-5 | 1義務に発火は1種類のみ | `obligations.trigger_type / trigger_condition` | 特定業務健診（定期＋配置替え） | B：composite 発火、または前回実施日の共有 | — |
| GAP-6 | 健診記録を証拠にできない | `obligation_instances.evidence_type` | 定期健診・特定業務健診 | 健診を投入するセッション：health_checkups を新設し、CHECK とトリガーを拡張 | — |
| GAP-7 | 在留資格の行を証拠にできない | `obligation_instances.evidence_type` | 在留期限更新 | B：'residence_status' を追加し、トリガーで検証 | — |
| GAP-8 | 「申請済・結果待ち」の状態がない | `obligation_instances.status` | 在留期限更新（特例期間） | B：'filed' を追加、または申請受付の記録を証拠化 | — |
| GAP-9 | 人ごとの相対的な提出期間を表現できない | `obligations.window_start / window_end` | 在留期限更新（3か月前から申請可） | B：window_offset_days 等を追加 | — |
| GAP-10 | 事業所単位の集計発火を表現できない | `obligations.trigger_type` | はい作業主任者 | C：'establishment_activity' を追加。作業割当と事業所の紐付けが前提 | — |
| GAP-11 | 適用対象者の条件に専用カラムがない（格納は可能） | なし（trigger_condition 内の JSON） | 特定業務健診、フォークリフトの work_key | B：applicability 列を分けるか判断 | — |

---

## 6. SQL 実行結果（2026-11-10）

| 確認項目 | 結果 | 確認方法 |
|---|---|---|
| CHECK 制約 | 8件：`chk_oi_no_done_company`、`chk_oi_no_done_establishment`、`obligation_instances_check`／`check1`／`check2`（完了には証拠必須・証拠の片方だけ不可・対象外は理由必須）、`evidence_type_check`、`status_check`、`subject_type_check`。想定どおり | WB の SQL Editor のスクリーンショット |
| フォークリフト行 | `MFG_FORKLIFT_GE1T` v1 が1行。全カラムが投入値と一致 | anon キーで SELECT |
| obligation_instances | 0行（想定どおり。書き込みはセッションB） | anon キーで count |
| obligations への anon の書き込み | `42501 new row violates row-level security policy` で拒否（読取専用の設計どおり） | anon キーで INSERT を試行（拒否されたため行は作られていない） |
| ポリシー一覧・依存先の参照切れ確認クエリ | **未確認**（SQL Editor は最後の結果だけを表示するため、スクリーンショットには含まれていない） | — |

## 7. コード移行（2026-11-10）

| # | 変更 | 場所 |
|---|---|---|
| C1 | `loadWorkQualRules(supabase, industry, asOf)` を新設。obligations の資格型・worker 主体の行を、業界（NULL＝全分野）と有効期間で絞り込み、code ごとに最新の有効版を採用して `WorkQualRule` 形へ変換 | `lib/obligationMaster.ts` |
| C2 | 従業員詳細画面のルール取得元を、業界パッケージから `loadWorkQualRules` に変更。`computeQualGap` と UI は変更なし | `app/employees/[id]/page.tsx:251-264` |
| C3 | `workQualRules` を業界パッケージの型と両パッケージから削除（正本を1つにするため） | `lib/industry/types.ts`、`lib/industry/packages/manufacturing.ts`、`lib/industry/packages/transport.ts` |

判断：
- D18：業界・有効期間の絞り込みはクライアント側で行う。PostgREST の `or` 条件を2つ重ねたときの挙動が曖昧なのを避けるため（マスタは小規模）
- D19：取得に失敗した場合は `console.error` を出し、ルール0件（＝セクション非表示）として扱う。**移行前には無かった失敗経路**であり、119条リスクの表示が黙って消える可能性がある。エラー表示を出すと UI 変更になるため、本セッションでは入れていない（→ U9）

## 8. 検証結果

| 検証 | 結果 |
|---|---|
| `tsc --noEmit` | PASS（exit 0） |
| ルールの同値：DB から読んだルール vs 移行前のハードコード（製造・運送） | PASS（deep-equal で一致。運送はどちらも0件） |
| 有効期間：基準日 1972-09-30（valid_from の前日）では0件 | PASS |
| 判定結果の同値：業界を判定できる全従業員8名について、旧ルールと新ルールの `computeQualGap` 結果 | PASS（8名すべて一致。⑤ は forklift_1t＝未充足で移行前と同じ） |
| 画面（Playwright：①〜⑧ の作業資格セクション・カード・「作業を追加」の選択肢） | **未実施**。`.test-user-cred.json` が存在せずログインできない（U8） |

## 9. 追加の不明点

| # | 内容 |
|---|---|
| U8 | 画面検証用のテストユーザー情報（`.test-user-cred.json`）がリポジトリに無い。既存の verify_*.mjs も同じファイルを前提にしている |
| U9 | obligations の取得に失敗した場合のエラー表示（D19）。UI 変更が必要なため、別セッションで扱うか判断が必要 |
| U10 | `lib/qualGap.ts:4,21` のコメントに「パッケージの workQualRules」という旧称が残っている（動作には影響なし） |

## 10. WB レビュー指摘への対応（静かに失敗する経路）

**指摘**：移行で「読み込みに失敗するとセクションが黙って消える」経路が新しくできた。移行前はハードコードのため、この失敗モード自体が存在しなかった。119条リスクは過検知より見落としの方が致命的。→ 移行の未完了部分として本セッションで塞ぐ。

| # | 修正 | 場所 |
|---|---|---|
| R1 | 有効なルールが0件のとき、obligations 全体の件数を確認する。全体0件（未投入／RLS 拒否＝error:null＋空配列）なら throw。件数確認自体の失敗も throw。「業界に該当ルールが無い」（運送の現状）だけが空配列を返す | `lib/obligationMaster.ts`（末尾の空結果チェック） |
| R2 | catch で握りつぶさず `qualRulesError` を立てる。失敗時はセクションを消さず、同じ位置に赤字1行「作業資格ルールを読み込めませんでした。この欄の表示は不完全です。」を表示する（`data-testid="qual-rules-error"`、`role="alert"`）。失敗時は割当一覧と「作業を追加」を描かない（不完全なルールで「登録済みの作業はありません」等を出すと誤読を招くため） | `app/employees/[id]/page.tsx`（state 定義、ロード処理、作業資格セクション直前のエラーブロック） |
| R3 | 「懲役」→「拘禁刑」（2025年6月施行の改正刑法）。UI コード側には該当なし（旧ハードコードは削除済み）。型のコメント例のみ修正 | `lib/industry/types.ts:41` |

判断：
- D19 を撤回：失敗時は「セクション非表示」ではなく、エラー行を表示する（R2）
- D20：読込失敗時は割当一覧・「作業を追加」も出さない。ルールが不完全な状態で描くと「作業なし」「追加できる対象作業はありません」と表示され、それ自体が誤った安心を与えるため
- D21：読込失敗は業界を問わずエラー行を表示する（運送の従業員でも出る）。読めていない以上、該当ルールが無いとは言えないため

### 「懲役」表記が残っている箇所（DB は未更新・承認待ち）

| 箇所 | 現在の値 |
|---|---|
| DB `public.obligations`（code `MFG_FORKLIFT_GE1T`, version 1, id `80d140a5-a2bf-408c-be0f-ac4a4b33baba`）の `penalty_detail` | `労安衛法119条（6月以下の懲役 or 50万円以下の罰金）` |
| `create_obligations_master.sql:277`（同じ行の INSERT 文） | 同上 |

この値はそのまま従業員詳細の橙カード「無資格での従事は罰則対象 — …」に表示される（`app/employees/[id]/page.tsx` の `g.rule.penalty`）。DB を直すまで、画面には「懲役」が出続ける。

更新方法は2案を提示した：
- 案1：その場で UPDATE（v1 の文言を直す）
- 案2：版を上げる（v1 に `valid_to = 2025-05-31` を設定し、v2 を `valid_from = 2025-06-01`・拘禁刑表記で追加）

**裁定（2026-11-10 WB）：案1（v1 を直接修正）**

理由：懲役→拘禁刑は、2025年6月施行の刑法改正による刑名の統一である。実体（6月以下・50万円以下）も判定挙動も変わらない。version を分けるのは判定挙動が変わる改正に限る。表記の修正で版を増やすと、運送業の規則を投入する際に判定結果が同一の版が大量に生まれ、マスタが肥大化する。

**version の運用ルール**（`create_obligations_master.sql` 冒頭にも同文を記載）：
> version を上げるのは判定挙動が変わる改正のみ。
> 法令名・刑名・条文番号の表記修正は同一 version を直接修正する。
> 判断に迷う場合は版を上げる側に倒し、理由をコメントに残す。

対応：
- `create_obligations_master.sql` の INSERT 文を「拘禁刑」表記に修正済み（テーブルを作り直したときに旧表記へ戻らないように）
- DB は、WB が SQL Editor で次の1行を実行する（**未実行**）：

```sql
UPDATE public.obligations
   SET penalty_detail = '労安衛法119条（6月以下の拘禁刑 or 50万円以下の罰金）',
       updated_at = now()
 WHERE code = 'MFG_FORKLIFT_GE1T' AND version = 1;
```

- UPDATE の実行後に確認すること：①更新行数が1行 ②anon キーで SELECT した penalty_detail が新しい文字列 ③データ同値検証の比較対象（旧ハードコードの転記）も同じ文字列にして再実行し、PASS すること（旧ハードコードは「懲役」表記のため、そのままでは penalty だけが DIFF になる）

## 11. 検証結果（修正後）

| 検証 | 結果 |
|---|---|
| `tsc --noEmit` | PASS（exit 0） |
| ルール・判定の同値（8名、§8 と同じ検証を再実行） | PASS。運送は例外を投げずに空配列（＝セクション非表示のまま）で、移行前と同じ |
| ローダーの失敗経路（偽クライアントでの単体確認） | PASS 4/4：取得エラー→throw／空配列＋全体0件→throw／件数確認エラー→throw／空配列＋全体1件（該当業界なし）→空配列 |
| (a) 正常時の画面（Playwright） | **PASS**（§13） |
| (b) 異常時の画面（Playwright） | **PASS 6/6**（§13） |

## 13. 画面検証の結果（2026-11-10・WB の UPDATE 実行後）

前提：
- DB：UPDATE が反映済み。anon キーの SELECT で penalty_detail＝「労安衛法119条（6月以下の拘禁刑 or 50万円以下の罰金）」、updated_at＝2026-11-10T14:41:06Z を確認（1行）
- データ同値検証（期待値を拘禁刑表記に更新済み）を再実行し PASS
- ログイン：WB が用意した `.test-user-cred.json`
- ブラウザ：Playwright 同梱ブラウザが未ダウンロードのため、インストール済みの Google Chrome を使用（`PW_CHANNEL=chrome`。ダウンロードはしていない）

### (a) 正常時：移行前と同じ作業資格セクションが表示される → PASS

手順：変更した4ファイルだけを `git stash` して移行前の状態に戻す → `baseline`（①〜⑧）→ `git stash pop` → `compare`

| 従業員 | 移行前 | 移行後 |
|---|---|---|
| ①〜④（運送等） | セクションなし | セクションなし（同じ） |
| ⑤（製造・forklift_1t 割当・資格なし） | 橙カード「技能講習 未修了」＋罰則文＋従事予定 2026-08-01＋根拠／「追加できる対象作業はありません。」 | 同じ。**ただし罰則文が「懲役」→「拘禁刑」**（裁定どおりの意図した差分） |
| ⑥〜⑧（製造・割当なし） | 「登録済みの作業はありません。」＋「作業を追加」の選択肢＝[選択してください, フォークリフト運転（最大荷重1t以上）] | 同じ |

- 厳密比較：⑤ の1行のみ差分（懲役→拘禁刑）
- 正規化比較（移行前の「6月以下の懲役」を「6月以下の拘禁刑」に置換してから比較）：**8名すべて完全一致**
- 正常時に dev overlay の Issue バッジは出ていない（`notes/session_A_screens/a_normal_worker8.png`）

### (b) 異常時：セクションが消えずにエラー行が表示される → PASS 6/6

再現方法：ブラウザ内で `rest/v1/obligations` への通信を差し替えた（DB は変更していない）
- empty：200＋空配列（RLS 拒否・マスタ未投入と同じ応答。error:null で throw されない経路）
- abort：通信遮断（throw される経路）

| 差し替え | ①（運送） | ⑤（製造・割当あり） | ⑥（製造・割当なし） |
|---|---|---|---|
| empty | OK | OK | OK |
| abort | OK | OK | OK |

各ケースで確認したこと：①セクションが1つ存在する ②エラー行の文言が「作業資格ルールを読み込めませんでした。この欄の表示は不完全です。」と完全一致する ③割当カード・「作業を追加」が描画されていない（不完全な描画が0）。
スクリーンショット：`notes/session_A_screens/b_error_empty_worker5.png`、`b_error_abort_worker5.png`

補足：
- 初回の実行では abort の3件が NG（section=0）になった。これはスクリプト側の待ち合わせの問題だった。abort 時は失敗が確定するまで時間がかかり描画が遅れるが、`count()` は待たずに評価するため、描画前に数えていた。エラー行の文言は同じ実行で取得できていた。セクションの出現を待ってから数えるように修正し、6/6 PASS
- 異常時は `console.error` が出るため、dev overlay に「1 Issue」バッジが出る（開発時のみの表示で、意図した挙動）
- 正常時の比較は描画待ちを固定 1.5 秒にしている。製造の従業員ではセクションが毎回描画されており、待ち時間は足りていた

## 12. 次の手順

1. ~~ログイン手段の用意~~ 完了（WB）
2. ~~Playwright で (a)・(b)~~ 完了（§13）
3. ~~「懲役」の DB 更新~~ 完了：WB が UPDATE を実行 → anon キーの SELECT と画面の橙カードで拘禁刑表記を確認
4. コミット（push はしない）。コミット対象外：`lib/documents/templates/` の仕様書 v4・anzen_shikaku_master.csv/json（本セッション開始前から未追跡の WB の資料のため）
5. 残り：U9（エラー表示）は R2 で解決済み。U10（qualGap.ts のコメントの旧称）は未対応・軽微
