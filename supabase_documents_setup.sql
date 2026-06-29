-- ============================================================
-- TrustLayer: 書類生成機能 DB セットアップ
-- Supabase SQL Editor に貼り付けて実行してください
-- ============================================================

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. organizations テーブルに企業情報カラムを追加
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS address                    text,
  ADD COLUMN IF NOT EXISTS phone                      text,
  ADD COLUMN IF NOT EXISTS representative_title       text DEFAULT '代表取締役',
  ADD COLUMN IF NOT EXISTS representative_name        text,
  ADD COLUMN IF NOT EXISTS tokutei_skills_reg_number  text;

-- デモ株式会社に初期値を設定
UPDATE public.organizations
SET
  address                   = '東京都千代田区丸の内1-1-1',
  phone                     = '03-1234-5678',
  representative_title      = '代表取締役',
  representative_name       = '田中 太郎',
  tokutei_skills_reg_number = '19登-000001'
WHERE name = 'デモ株式会社';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. employment_conditions テーブル作成（従業員単位）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS public.employment_conditions (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid REFERENCES public.foreign_workers(id) ON DELETE CASCADE,

  -- Ⅱ 就業の場所
  workplace_type    text DEFAULT 'direct',
  workplace_name    text,
  workplace_address text,
  workplace_phone   text,

  -- Ⅲ 従事すべき業務の内容
  industry_field text,
  job_category   text,

  -- Ⅳ 労働時間等
  work_start_time            text    DEFAULT '09:00',
  work_end_time              text    DEFAULT '18:00',
  break_minutes              int     DEFAULT 60,
  weekly_scheduled_hours     numeric DEFAULT 40,
  weekly_scheduled_minutes   int     DEFAULT 0,
  monthly_scheduled_hours    numeric,
  annual_scheduled_hours     numeric,
  weekly_scheduled_days      numeric,
  monthly_scheduled_days     numeric,
  annual_scheduled_days      int,
  overtime_exists            boolean DEFAULT true,

  -- Ⅴ 休日
  regular_holiday_days   text DEFAULT '土曜日、日曜日、祝日',
  annual_holiday_days    int  DEFAULT 120,
  irregular_holiday_info text,

  -- Ⅵ 休暇
  annual_paid_leave_days int  DEFAULT 10,
  other_paid_leave       text,
  other_unpaid_leave     text,

  -- Ⅶ 賃金 — 基本賃金
  wage_type  text DEFAULT 'monthly',
  basic_wage int,

  -- Ⅶ 賃金 — 諸手当（別紙(a)〜(d)）
  allowance_1_name   text,
  allowance_1_amount int,
  allowance_2_name   text,
  allowance_2_amount int,
  allowance_3_name   text,
  allowance_3_amount int,
  allowance_4_name   text,
  allowance_4_amount int,

  -- Ⅶ 賃金 — 割増賃金率
  overtime_rate_under60      int DEFAULT 25,
  overtime_rate_over60       int DEFAULT 50,
  overtime_rate_prescribed   int DEFAULT 0,
  holiday_rate_statutory     int DEFAULT 35,
  holiday_rate_non_statutory int DEFAULT 25,
  late_night_rate            int DEFAULT 25,

  -- Ⅶ 賃金 — 締切日・支払日・支払方法
  wage_cutoff_day          int     DEFAULT 25,
  wage_payment_day         int     DEFAULT 25,
  wage_payment_method      text    DEFAULT 'bank',
  wage_deduction_agreement boolean DEFAULT false,

  -- Ⅶ 賃金 — 昇給・賞与・退職金・休業手当
  salary_increase_exists       boolean DEFAULT false,
  salary_increase_details      text,
  bonus_exists                 boolean DEFAULT false,
  bonus_details                text,
  severance_pay_exists         boolean DEFAULT false,
  severance_pay_details        text,
  work_injury_allowance_exists boolean DEFAULT false,
  work_injury_allowance_rate   text,

  -- Ⅸ その他 — 社会保険・労働保険
  insurance_kosei_nenkin   boolean DEFAULT true,
  insurance_kenko          boolean DEFAULT true,
  insurance_koyo           boolean DEFAULT true,
  insurance_rousai         boolean DEFAULT true,
  insurance_kokumin_nenkin boolean DEFAULT false,
  insurance_kokumin_kenko  boolean DEFAULT false,

  -- Ⅸ その他 — 健康診断
  health_checkup_on_hire  text,
  health_checkup_first    text,
  health_checkup_interval text DEFAULT '1年ごと',

  created_at timestamptz DEFAULT now(),
  UNIQUE(worker_id)
);

-- RLS
ALTER TABLE public.employment_conditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for authenticated"
  ON public.employment_conditions
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Enable insert for authenticated"
  ON public.employment_conditions
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Enable update for authenticated"
  ON public.employment_conditions
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Enable read for anon"
  ON public.employment_conditions
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "Enable insert for anon"
  ON public.employment_conditions
  FOR INSERT TO anon
  WITH CHECK (true);

-- デモデータ（従業員1：高賃金・各種手当あり）
INSERT INTO public.employment_conditions (
  worker_id,
  workplace_name, workplace_address, workplace_phone,
  industry_field, job_category,
  work_start_time, work_end_time, break_minutes,
  weekly_scheduled_hours, weekly_scheduled_days, annual_scheduled_days,
  regular_holiday_days, annual_holiday_days, annual_paid_leave_days,
  wage_type, basic_wage,
  allowance_1_name, allowance_1_amount,
  allowance_2_name, allowance_2_amount,
  wage_cutoff_day, wage_payment_day,
  bonus_exists, bonus_details,
  insurance_kosei_nenkin, insurance_kenko, insurance_koyo, insurance_rousai,
  health_checkup_on_hire, health_checkup_first
)
SELECT id,
  'デモ株式会社 本社工場', '東京都千代田区丸の内1-1-1', '03-1234-5678',
  '飲食料品製造業', '飲食料品製造業務',
  '09:00', '18:00', 60, 40, 5, 245,
  '土曜日、日曜日、祝日', 120, 10,
  'monthly', 240000,
  '通勤手当', 15000, '住宅手当', 20000,
  25, 25, true, '年2回（7月・12月）',
  true, true, true, true, '2024-04', '2025-04'
FROM public.foreign_workers ORDER BY created_at ASC LIMIT 1 OFFSET 0;

-- デモデータ（従業員2：標準賃金）
INSERT INTO public.employment_conditions (
  worker_id,
  workplace_name, workplace_address, workplace_phone,
  industry_field, job_category,
  work_start_time, work_end_time, break_minutes,
  weekly_scheduled_hours, weekly_scheduled_days, annual_scheduled_days,
  regular_holiday_days, annual_holiday_days, annual_paid_leave_days,
  wage_type, basic_wage,
  allowance_1_name, allowance_1_amount,
  wage_cutoff_day, wage_payment_day,
  bonus_exists,
  insurance_kosei_nenkin, insurance_kenko, insurance_koyo, insurance_rousai,
  health_checkup_on_hire, health_checkup_first
)
SELECT id,
  'デモ株式会社 第2工場', '東京都千代田区丸の内1-2-3', '03-1234-5679',
  '飲食料品製造業', '飲食料品製造業務',
  '08:30', '17:30', 60, 40, 5, 245,
  '土曜日、日曜日、祝日', 115, 10,
  'monthly', 210000, '通勤手当', 10000,
  20, 20, false,
  true, true, true, true, '2024-05', '2025-05'
FROM public.foreign_workers ORDER BY created_at ASC LIMIT 1 OFFSET 1;

-- デモデータ（従業員3：時給制）
INSERT INTO public.employment_conditions (
  worker_id,
  workplace_name, workplace_address, workplace_phone,
  industry_field, job_category,
  work_start_time, work_end_time, break_minutes,
  weekly_scheduled_hours, weekly_scheduled_days, annual_scheduled_days,
  regular_holiday_days, annual_holiday_days, annual_paid_leave_days,
  wage_type, basic_wage,
  allowance_1_name, allowance_1_amount,
  wage_cutoff_day, wage_payment_day,
  bonus_exists,
  insurance_kosei_nenkin, insurance_kenko, insurance_koyo, insurance_rousai,
  health_checkup_on_hire, health_checkup_first
)
SELECT id,
  'デモ株式会社 本社工場', '東京都千代田区丸の内1-1-1', '03-1234-5678',
  '飲食料品製造業', '飲食料品製造業務',
  '10:00', '19:00', 60, 40, 5, 245,
  '土曜日、日曜日、祝日', 105, 10,
  'hourly', 1100, '通勤手当', 8000,
  25, 25, false,
  true, true, true, true, '2024-06', '2025-06'
FROM public.foreign_workers ORDER BY created_at ASC LIMIT 1 OFFSET 2;

-- デモデータ（従業員4：中賃金・職務手当あり）
INSERT INTO public.employment_conditions (
  worker_id,
  workplace_name, workplace_address, workplace_phone,
  industry_field, job_category,
  work_start_time, work_end_time, break_minutes,
  weekly_scheduled_hours, weekly_scheduled_days, annual_scheduled_days,
  regular_holiday_days, annual_holiday_days, annual_paid_leave_days,
  wage_type, basic_wage,
  allowance_1_name, allowance_1_amount,
  allowance_2_name, allowance_2_amount,
  wage_cutoff_day, wage_payment_day,
  bonus_exists, bonus_details,
  insurance_kosei_nenkin, insurance_kenko, insurance_koyo, insurance_rousai,
  health_checkup_on_hire, health_checkup_first
)
SELECT id,
  'デモ株式会社 第2工場', '東京都千代田区丸の内1-2-3', '03-1234-5679',
  '飲食料品製造業', '飲食料品製造業務',
  '09:00', '18:00', 60, 40, 5, 245,
  '土曜日、日曜日、祝日', 118, 10,
  'monthly', 225000, '通勤手当', 12000, '職務手当', 15000,
  25, 25, true, '年2回（6月・12月）',
  true, true, true, true, '2024-07', '2025-07'
FROM public.foreign_workers ORDER BY created_at ASC LIMIT 1 OFFSET 3;

-- デモデータ（従業員5以降：残り全員を標準条件で一括投入）
INSERT INTO public.employment_conditions (
  worker_id,
  workplace_name, workplace_address, workplace_phone,
  industry_field, job_category,
  work_start_time, work_end_time, break_minutes,
  weekly_scheduled_hours, weekly_scheduled_days, annual_scheduled_days,
  regular_holiday_days, annual_holiday_days, annual_paid_leave_days,
  wage_type, basic_wage,
  allowance_1_name, allowance_1_amount,
  wage_cutoff_day, wage_payment_day,
  bonus_exists,
  insurance_kosei_nenkin, insurance_kenko, insurance_koyo, insurance_rousai,
  health_checkup_on_hire, health_checkup_first
)
SELECT id,
  'デモ株式会社 本社工場', '東京都千代田区丸の内1-1-1', '03-1234-5678',
  '飲食料品製造業', '飲食料品製造業務',
  '09:00', '18:00', 60, 40, 5, 245,
  '土曜日、日曜日、祝日', 110, 10,
  'monthly', 200000, '通勤手当', 10000,
  25, 25, false,
  true, true, true, true, '2024-08', '2025-08'
FROM public.foreign_workers
WHERE id NOT IN (SELECT worker_id FROM public.employment_conditions)
ORDER BY created_at ASC;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. worker_contracts テーブル作成（雇用契約期間・Ⅰ）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS public.worker_contracts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id            uuid REFERENCES public.foreign_workers(id) ON DELETE CASCADE,
  contract_start_date  date,
  contract_end_date    date,
  planned_entry_date   date,
  contract_renewable   boolean DEFAULT true,
  created_at           timestamptz DEFAULT now(),
  UNIQUE(worker_id)
);

-- RLS
ALTER TABLE public.worker_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for authenticated"
  ON public.worker_contracts
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Enable insert for authenticated"
  ON public.worker_contracts
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Enable update for authenticated"
  ON public.worker_contracts
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Enable read for anon"
  ON public.worker_contracts
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "Enable insert for anon"
  ON public.worker_contracts
  FOR INSERT TO anon
  WITH CHECK (true);

-- デモデータ（全従業員に契約期間を投入）
INSERT INTO public.worker_contracts (worker_id, contract_start_date, contract_end_date, planned_entry_date, contract_renewable)
SELECT id, '2024-04-01', '2026-03-31', '2024-03-25', true
FROM public.foreign_workers ORDER BY created_at ASC LIMIT 1 OFFSET 0;

INSERT INTO public.worker_contracts (worker_id, contract_start_date, contract_end_date, planned_entry_date, contract_renewable)
SELECT id, '2023-10-01', '2025-09-30', '2023-09-20', true
FROM public.foreign_workers ORDER BY created_at ASC LIMIT 1 OFFSET 1;

INSERT INTO public.worker_contracts (worker_id, contract_start_date, contract_end_date, planned_entry_date, contract_renewable)
SELECT id, '2024-01-15', '2026-01-14', '2024-01-10', false
FROM public.foreign_workers ORDER BY created_at ASC LIMIT 1 OFFSET 2;

INSERT INTO public.worker_contracts (worker_id, contract_start_date, contract_end_date, planned_entry_date, contract_renewable)
SELECT id, '2023-07-01', '2025-06-30', '2023-06-25', true
FROM public.foreign_workers ORDER BY created_at ASC LIMIT 1 OFFSET 3;

INSERT INTO public.worker_contracts (worker_id, contract_start_date, contract_end_date, planned_entry_date, contract_renewable)
SELECT id, '2024-04-01', '2026-03-31', '2024-03-28', true
FROM public.foreign_workers
WHERE id NOT IN (SELECT worker_id FROM public.worker_contracts)
ORDER BY created_at ASC;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 確認クエリ
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  w.name_kanji,
  ec.wage_type,
  ec.basic_wage,
  ec.work_start_time,
  ec.work_end_time,
  wc.contract_start_date,
  wc.contract_end_date
FROM public.foreign_workers w
LEFT JOIN public.employment_conditions ec ON ec.worker_id = w.id
LEFT JOIN public.worker_contracts wc       ON wc.worker_id = w.id
ORDER BY w.created_at ASC;
