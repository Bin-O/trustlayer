-- ============================================================
-- TrustLayer: 雇用条件書 令和6年4月改正 新設項目カラム追加
-- 対象: worker_contracts（Ⅰ 契約更新系）/ employment_conditions（Ⅱ Ⅲ Ⅶ Ⅸ）
-- 方針: すべて ADD COLUMN IF NOT EXISTS（非破壊）。UPDATE・回填は行わない。
--       contract_renewal_type は NULL のままとし、次回編集時にユーザーが選択する。
-- ============================================================

-- ── 表1: worker_contracts（グループ 1〜4）──────────────────
ALTER TABLE public.worker_contracts
  -- 1. 契約更新の有無（3択）: auto=自動更新 / possible=更新する場合があり得る / none=更新しない
  ADD COLUMN IF NOT EXISTS contract_renewal_type text
    CHECK (contract_renewal_type IN ('auto','possible','none')),
  -- 2. 更新の判断基準（6項目 + その他自由記述）
  ADD COLUMN IF NOT EXISTS renewal_criteria_workload    boolean DEFAULT false,  -- 業務量
  ADD COLUMN IF NOT EXISTS renewal_criteria_performance boolean DEFAULT false,  -- 勤務成績・態度
  ADD COLUMN IF NOT EXISTS renewal_criteria_ability     boolean DEFAULT false,  -- 業務遂行能力
  ADD COLUMN IF NOT EXISTS renewal_criteria_company     boolean DEFAULT false,  -- 会社の経営状況
  ADD COLUMN IF NOT EXISTS renewal_criteria_progress    boolean DEFAULT false,  -- 業務の進捗状況
  ADD COLUMN IF NOT EXISTS renewal_criteria_other       boolean DEFAULT false,  -- その他
  ADD COLUMN IF NOT EXISTS renewal_criteria_other_text  text,                   -- その他の内容
  -- 3. 更新上限の有無（無/有・更新回数上限・通算契約期間上限）
  ADD COLUMN IF NOT EXISTS renewal_limit_exists boolean DEFAULT false,          -- false=無 / true=有
  ADD COLUMN IF NOT EXISTS renewal_limit_count  int,                            -- 更新回数の上限
  ADD COLUMN IF NOT EXISTS renewal_limit_years  int,                            -- 通算契約期間の上限（整数年）
  -- 4. 無期転換（転換日・無期転換後の労働条件の変更の有無）
  ADD COLUMN IF NOT EXISTS muki_tenkan_date               date,                 -- 無期転換日
  ADD COLUMN IF NOT EXISTS muki_conditions_change_exists  boolean DEFAULT false;-- false=無 / true=有

-- 旧カラムは残すが今後は書き込まない（deprecated）。正本は contract_renewal_type。
COMMENT ON COLUMN public.worker_contracts.contract_renewable IS
  'DEPRECATED (令和6年4月改正): 契約更新の有無は contract_renewal_type を正本とする。本カラムには今後書き込まない。';

-- ── 表2: employment_conditions（グループ 5〜9）─────────────
ALTER TABLE public.employment_conditions
  -- 5. 就業場所の変更の範囲（令和6年4月新設）
  ADD COLUMN IF NOT EXISTS workplace_change_none    boolean DEFAULT false,      -- 変更の可能性なし
  ADD COLUMN IF NOT EXISTS workplace_change_name    text,                       -- 変更範囲：事業所名
  ADD COLUMN IF NOT EXISTS workplace_change_address text,                       -- 変更範囲：所在地
  ADD COLUMN IF NOT EXISTS workplace_change_phone   text,                       -- 変更範囲：連絡先
  -- 6. 従事すべき業務の変更の範囲（令和6年4月新設）
  ADD COLUMN IF NOT EXISTS job_change_none     boolean DEFAULT false,           -- 変更の可能性なし
  ADD COLUMN IF NOT EXISTS job_change_field    text,                            -- 変更範囲：分野
  ADD COLUMN IF NOT EXISTS job_change_category text,                            -- 変更範囲：業務区分
  -- 7. 固定残業代（手当(a)〜(d)とは別枠。割増賃金は除く旨に準拠）
  ADD COLUMN IF NOT EXISTS fixed_overtime_exists          boolean DEFAULT false,-- 有無
  ADD COLUMN IF NOT EXISTS fixed_overtime_name            text,                 -- 手当名称
  ADD COLUMN IF NOT EXISTS fixed_overtime_amount          int,                  -- 金額（円）※ basic_wage(integer) と型を揃える
  ADD COLUMN IF NOT EXISTS fixed_overtime_hours           numeric,              -- 何時間分か
  ADD COLUMN IF NOT EXISTS fixed_overtime_threshold_hours numeric,              -- 超過分を追加支給する基準時間
  -- 8. 雇用管理の改善等に関する相談窓口（令和6年4月新設）
  ADD COLUMN IF NOT EXISTS consultation_desk_dept    text,                      -- 部署名
  ADD COLUMN IF NOT EXISTS consultation_desk_person  text,                      -- 担当者職氏名
  ADD COLUMN IF NOT EXISTS consultation_desk_contact text,                      -- 連絡先
  -- 9. 就業規則を確認できる場所や方法（令和6年4月新設）
  ADD COLUMN IF NOT EXISTS work_rules_location text;
