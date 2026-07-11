# 信頼スコア内訳 実装仕様書

作成日: 2026-07-10 / 対象: TrustLayer (Next.js 15 + TypeScript + Supabase)

---

## 0. 背景・目的

- 信頼スコアは「Portable Digital Identity」の中核。外国人労働者が雇用主をまたいで持ち運べる、検証可能な実績記録。
- 設計原則: **客観(システム自動算出)70点 + 主観(雇用主評価)30点**。公信力の根拠は「評価データは合規業務の副産物であり、アンケートではない」こと。
- 企業側の新規負担は「四半期1回の面談記録入力 + 評価者2名×各1分の採点」のみに抑える。それ以外は既存データから自動算出。

---

## 1. スコア構成(100点満点)

| # | 構成項目 | 配点 | 性質 | 主なデータソース |
|---|---|---|---|---|
| 1 | 就労継続性 | 20 | 客観 | `worker_contracts`, `employment_condition_history` |
| 2 | 賃金・届出コンプライアンス | 20 | 客観 | `payroll_records`, `documents` |
| 3 | 支援実施・参加 | 15 | 客観 | `support_records`(新設) |
| 4 | 資格・日本語 | 15 | 客観 | `qualifications`(新設) |
| 5 | 雇用主評価 | 30 | 主観+行動 | `evaluations`(拡張), `payroll_records`, `worker_contracts` |

補助指標(得点外): **データ充足度**(0–100%)。算出に必要なデータの存在率。低い場合はスコア数値ではなく「実績蓄積中」と表示する(コールドスタート対策)。

検証バッジ3段階(内訳の各項目に付与):
- `検証済` — システム内の業務データから自動算出
- `書類確認済` — 証明書画像を保存し AI 抽出済み(例: JLPT合格証)
- `申告` — 自己申告のみ

---

## 2. 各構成項目の算出ロジック

### 2-1. 就労継続性(20点)
- 在籍月数スコア: `min(在籍月数 / 24, 1) × 16点`
- 契約更新ボーナス: 更新1回につき +2点(上限4点)
- 在籍月数は `worker_contracts` の雇用開始日から現在(または契約終了日)まで。
- v1では転職回数によるペナルティは設けない。

### 2-2. 賃金・届出コンプライアンス(20点)
- 賃金台帳完整度: `直近12か月の payroll_records 登録月数 / 12 × 12点`(既存の completeness checker ロジックを再利用)
- 届出期限遵守: `期限内提出された届出数 / 提出義務のあった届出数 × 8点`(`documents` の生成・提出タイムスタンプから算出)
- 対象期間のデータが12か月未満の場合は存在する月数で按分し、データ充足度に反映。

> **実装(v1簡略版・formula_version 2 で確定)**: 提出日トラッキングは将来対応とし、
> `document_generations` の生成記録を根拠に以下の3分岐で算出する。
> 1. 届出義務 ≥1件 → `生成済み届出数 / 義務数 × 8点`
> 2. 義務0件 かつ 在職実データあり(`worker_contracts` または `payroll_records` が1行以上)
>    → 8点(在職中で違反なしの扱い)
> 3. 義務0件 かつ 在職実データなし → 0点(判定基礎が無いため加点しない)
>
> 項目全体の hasData は「契約≥1行 or 賃金台帳≥1行 or 義務≥1件」。false のとき
> UIはグレーの「データ未蓄積」バッジを表示する。

### 2-3. 支援実施・参加(15点)
- 定期面談実施率: `直近4四半期の面談実施四半期数 / 4 × 10点`
- 生活オリエンテーション・講習等の完了: 完了で5点(`support_records` の type: orientation 等)
- 入社1年未満は経過四半期数で按分。

### 2-4. 資格・日本語(15点)
- JLPT: N4=8点 / N3=11点 / N2以上=15点(最高位のみ採用)
- 技能試験合格: +3点(合計上限15点)
- `verified_level` が `書類確認済` 以上のもののみ満額。`申告` のみの場合は表示するが得点は50%に減額。
- 証明書画像アップロード → 既存 Claude Vision パイプライン再利用で合格証番号・級・氏名を抽出(賃金台帳リーダーと同一アーキテクチャ)。

### 2-5. 雇用主評価(30点) = 面談時評価15点 + 行動シグナル15点

**(a) 面談時評価(15点)**
- 定期面談(四半期)に組み込む。評価者2名: 支援担当者(中立立場・法定)+ 現場責任者。
- 設問は3〜5問、5段階評価。1名1分以内で完了するUI(モバイル対応)。
- 設問例: 業務遂行 / 勤怠・時間 / 職場コミュニケーション / 安全衛生遵守 / 総合。
- 集計:
  - 時間加重平均: 直近の四半期ほど重み大(例: 直近4期の重み 4:3:2:1)
  - ベイズ収縮: `調整後平均 = (n × 実平均 + k × prior) / (n + k)`、`k = 4`、`prior = 3.5`(5段階)。サンプル数が少ないうちは全体平均に寄せ、入社直後の満点/最低点を防ぐ。
  - **ベイズ収縮は有効評価 ≥1件のときのみ適用**(formula_version 2)。有効評価0件の場合は
    prior による中間点(9.375点)を与えず **0点** とし、UIは「面談時評価 未評価」と表示する。
  - 15点換算: `(調整後平均 − 1) / 4 × 15`
- 単一評価者の影響上限: 1評価者の全評価が総合点に与える影響は面談時評価15点の50%まで。

**(b) 行動シグナル(15点)** — 全自動算出、入力不要
- 直近24か月に昇給あり: +6点(`payroll_records` の基本給の上昇を検出)
- 直近24か月に賞与支給あり: +4点(`payroll_records` の賞与項目)
- 直近24か月に契約更新あり: +5点(`worker_contracts`)
- 合計上限15点。雇用主が「金銭で投票した」行動ベースの評価であり、主観採点より偽装しにくい。

---

## 3. DB変更(★実行前に必ず承認を取ること)

### 3-1. 新規テーブル: `qualifications`
```sql
create table qualifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  worker_id uuid not null references foreign_workers(id),
  type text not null,              -- 'jlpt' | 'skill_exam' | 'other'
  level text,                      -- 'N1'..'N5', 試験名等
  acquired_date date,
  verified_level text not null default 'self_reported',
    -- 'self_reported'(申告) | 'document_confirmed'(書類確認済)
  certificate_number text,
  evidence_url text,               -- Supabase Storage の証明書画像パス
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 3-2. 新規テーブル: `support_records`(面談・講習記録)
```sql
create table support_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  worker_id uuid not null references foreign_workers(id),
  type text not null,              -- 'interview_worker'(外国人本人面談)
                                   -- 'interview_supervisor'(監督者面談)
                                   -- 'orientation' | 'training'
  quarter text,                    -- '2026-Q3' 形式(面談の場合必須)
  scheduled_date date,
  completed boolean default false,
  completed_date date,
  method text,                     -- 'in_person' | 'online'
  online_consent boolean,          -- オンライン面談の場合の本人同意
  recording_url text,              -- 録画ファイル参照(オンラインの場合)
  recording_retention_until date,  -- 契約終了日 + 1年(自動計算)
  notes jsonb,                     -- 面談確認項目チェック結果(参考様式第5-5/5-6号準拠)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 3-3. `evaluations` テーブル拡張
```sql
alter table evaluations add column evaluator_role text;
  -- 'support_staff'(支援担当者) | 'site_supervisor'(現場責任者)
alter table evaluations add column quarter text;          -- '2026-Q3'
alter table evaluations add column support_record_id uuid references support_records(id);
alter table evaluations add column locked_at timestamptz; -- 四半期クローズ後ロック
alter table evaluations add column excluded boolean default false;
alter table evaluations add column excluded_reason text;
  -- 'post_resignation'(退職確定後提出) | 'outlier_review'(乖離レビュー中) 等
```

### 3-4. 新規テーブル: `trust_score_snapshots`
```sql
create table trust_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  worker_id uuid not null references foreign_workers(id),
  calculated_at timestamptz not null default now(),
  month text not null,             -- '2026-07' 形式、worker_id + month で unique
  total numeric not null,
  breakdown jsonb not null,        -- 下記 §4 の breakdown 形式
  data_sufficiency numeric not null,
  formula_version int not null,
  unique (worker_id, month)
);
```

### 3-5. RLS 注意事項
- 全新規テーブルに SELECT / INSERT / **UPDATE** ポリシーを必ず作成すること(UPDATE ポリシー漏れによる「error: null + data: [] のサイレント失敗」が既知パターン)。
- 実装後、実際に UPDATE して更新行数が1以上であることをテストで確認すること。

---

## 4. 計算モジュール

- 単一モジュール `lib/trustScore.ts` に全ロジックを集約。定数 `FORMULA_VERSION`(現行 2、変更履歴は文末 §10)をエクスポート。
- `calculateTrustScore(workerId): Promise<TrustScoreResult>` — リアルタイム算出。
- breakdown の JSON 形式(スナップショットにもこのまま保存):
```json
{
  "formula_version": 1,
  "total": 82,
  "data_sufficiency": 0.88,
  "items": [
    { "key": "continuity",     "label": "就労継続性",       "score": 18, "max": 20, "badge": "verified" },
    { "key": "compliance",     "label": "賃金・届出コンプラ", "score": 19, "max": 20, "badge": "verified" },
    { "key": "support",        "label": "支援実施・参加",     "score": 11, "max": 15, "badge": "verified" },
    { "key": "qualification",  "label": "資格・日本語",       "score": 8,  "max": 15, "badge": "self_reported" },
    { "key": "evaluation",     "label": "雇用主評価",         "score": 26, "max": 30, "badge": "subjective",
      "detail": { "interview": 12, "behavioral": 14 } }
  ]
}
```
- 全表示数値は丸め処理(整数)を通すこと。
- **月次スナップショット**: cron は使わない。スコア閲覧時に「当月のスナップショットが未作成なら作成する」レイジー方式(`getOrCreateMonthlySnapshot`)。Vercel 無料枠 + Supabase 無料枠の制約に適合。

---

## 5. 防作弊・公正性ルール

1. **退職確定後評価の排除**: 契約終了日確定後に提出された評価は自動で `excluded = true, excluded_reason = 'post_resignation'`(報復的低評価の防止)。
2. **評価ロック**: 四半期終了後30日で `locked_at` をセットし、以降の変更は不可。変更履歴は `audit_logs` に記録。
3. **乖離検知**: 単一四半期の評価が本人の履歴平均から大きく乖離(±1.5以上)した場合、フラグを立てて内訳画面に「レビュー中」表示(v1は表示のみ、自動処理なし)。
4. **本人開示原則**(将来の外国人向けAppで実装): 本人は自分のスコアと内訳を閲覧でき、異議申立てができる。v1ではデータ構造のみこれを妨げない設計とする。
5. **他社への開示**: 本人同意がある場合のみ(同意記録を保存)。v1では実装対象外、設計上の前提として記載。

---

## 6. UI仕様

### 6-1. 従業員詳細ページ: 信頼スコアカード
- 総合スコア(28px・大)+ 前月比トレンド矢印
- レーダーチャート5軸: 継続性 / 評価 / コンプラ / 支援参加 / 資格
- 内訳リスト: 各項目に `点数/満点` + 検証バッジ(検証済=緑 / 書類確認済=青 / 申告=グレー / 主観=黄)
- データ充足度バー(%)
- 推移グラフ: `trust_score_snapshots` から月次折れ線(カード下部に折りたたみ表示で可)

### 6-2. 面談記録入力画面(四半期ごと)
- 場所: 従業員詳細ページ内タブ、または `/workers/[id]/interviews`
- 対象四半期の選択 → 外国人本人面談 / 監督者面談 の2レコードを作成
- 面談確認項目チェックリスト(参考様式第5-5/5-6号の確認事項に準拠: 業務内容 / 待遇 / 保護 / 生活 / その他。問題ありの場合は発生日・詳細・対応を記録)
- 実施方法選択: 対面 / オンライン
  - オンライン選択時: 本人同意チェック(未同意ならブロック)+ 録画ファイル登録欄 + 保存期限の自動表示(契約終了+1年)
- 評価入力セクション: 評価者2名(支援担当者・現場責任者)がそれぞれ3〜5問を5段階で採点。1名1分以内で完了するシンプルなUI。モバイル対応。
- ダッシュボード連携: 当四半期の面談が未実施の従業員をコンプライアンスダッシュボードに警告表示(第2優先機能との統合ポイント)。

### 6-3. 資格登録UI
- 従業員詳細ページに資格セクション追加。企業側が証明書画像をアップロード → Vision API で抽出 → 確認・保存 → `書類確認済` バッジ。画像なし手入力は `申告` 扱い。

### UX共通原則
- サブコンポーネントは必ずモジュールスコープで定義(フォーカス喪失バグの既知パターン回避)。
- 非IT人材が迷わないウィザード式・条件付き表示・必須項目バリデーション。

---

## 7. 法的前提(2026年7月時点で確認済み)

- 定期面談: **3か月に1回以上**(2025年4月改正後も頻度変更なし)。外国人本人と監督者それぞれに実施。支援責任者・担当者は中立立場(直属上司・代表取締役は不可)。
- オンライン面談: 2025年4月から可能。本人同意(支援計画書 参考様式第1-17号に記載)+ 録画を契約終了後1年以上保管 + 初回は対面原則 + 年1回以上の対面推奨。
- 定期届出: 年1回、毎年4月1日〜5月31日提出。新ルール初回提出は2026年4月〜。`/reports/annual` の提出期間表示を要確認。

---

## 8. 実装フェーズ分割(推奨)

| Phase | 内容 | 備考 |
|---|---|---|
| 1 | DB変更(§3)+ 計算モジュール(§4)+ 詳細ページのスコアカード(§6-1) | デモの核心。行動シグナルは既存データで即動作 |
| 2 | 面談記録入力画面 + 評価入力フロー(§6-2) | コンプラダッシュボードと統合ポイントあり |
| 3 | 資格登録UI(§6-3)+ 推移グラフ + 防作弊ルールの自動処理(§5) | Vision パイプライン再利用 |

- 現行優先順位(在留カードAIリーダー → コンプライアンスダッシュボード)との調整は WB が判断。Phase 2 はダッシュボードと同時実装が効率的。

---

## 9. Claude Code への約束事(再掲)

- `CREATE/ALTER TABLE` 等の DB 変更は**実行前に必ず確認を取る**。
- RLS ポリシーは SELECT / INSERT / UPDATE をセットで作成し、UPDATE 後の行数検証テストを必ず書く。
- 数値表示は必ず丸め処理を通す。
- git push 前に確認を取る。

---

## 10. FORMULA_VERSION 変更履歴

| version | 日付 | 変更概要 |
|---|---|---|
| 1 | 2026-07-11 | Phase 1 初期実装。届出遵守は v1 簡略版(`document_generations` の生成割合 × 8点)、`evaluator_role` が NULL の既存 evaluations は面談時評価の集計から除外 |
| 2 | 2026-07-11 | ①有効評価0件のとき面談時評価を0点に変更(ベイズ prior による中間点9.375の付与を廃止、UIは「未評価」表示) ②届出義務0件かつ在職実データ(契約・賃金台帳とも0行)無しの場合は届出遵守8点を与えない ③各内訳項目に hasData を追加し、根拠データが無い項目はグレーの「データ未蓄積」バッジを表示 |
