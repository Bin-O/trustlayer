-- ============================================================
-- TrustLayer: employment_conditions テーブルにカラムを追加
-- Ⅳ 労働時間等（変形労働時間制・交代制）および別紙（控除項目）
-- ============================================================

ALTER TABLE public.employment_conditions
  -- Ⅳ (1) 1日の所定労働時間
  ADD COLUMN IF NOT EXISTS daily_scheduled_hours   int,
  ADD COLUMN IF NOT EXISTS daily_scheduled_minutes int DEFAULT 0,
  -- Ⅳ (2) 変形労働時間制
  ADD COLUMN IF NOT EXISTS henkou_roudou_jikan      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS henkou_roudou_jikan_unit text,
  -- Ⅳ (2) 交代制
  ADD COLUMN IF NOT EXISTS kotai_sei              boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS shift1_start_time      text,
  ADD COLUMN IF NOT EXISTS shift1_end_time        text,
  ADD COLUMN IF NOT EXISTS shift1_days            text,
  ADD COLUMN IF NOT EXISTS shift1_daily_hours     int,
  ADD COLUMN IF NOT EXISTS shift1_daily_minutes   int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shift2_start_time      text,
  ADD COLUMN IF NOT EXISTS shift2_end_time        text,
  ADD COLUMN IF NOT EXISTS shift2_days            text,
  ADD COLUMN IF NOT EXISTS shift2_daily_hours     int,
  ADD COLUMN IF NOT EXISTS shift2_daily_minutes   int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shift3_start_time      text,
  ADD COLUMN IF NOT EXISTS shift3_end_time        text,
  ADD COLUMN IF NOT EXISTS shift3_days            text,
  ADD COLUMN IF NOT EXISTS shift3_daily_hours     int,
  ADD COLUMN IF NOT EXISTS shift3_daily_minutes   int DEFAULT 0,
  -- 別紙：諸手当の計算方法
  ADD COLUMN IF NOT EXISTS allowance_1_calc_method text,
  ADD COLUMN IF NOT EXISTS allowance_2_calc_method text,
  ADD COLUMN IF NOT EXISTS allowance_3_calc_method text,
  ADD COLUMN IF NOT EXISTS allowance_4_calc_method text,
  -- 別紙：控除項目
  ADD COLUMN IF NOT EXISTS deduction_tax                   int,
  ADD COLUMN IF NOT EXISTS deduction_social_insurance      int,
  ADD COLUMN IF NOT EXISTS deduction_employment_insurance  int,
  ADD COLUMN IF NOT EXISTS deduction_food                  int,
  ADD COLUMN IF NOT EXISTS deduction_housing               int,
  ADD COLUMN IF NOT EXISTS deduction_utilities             int,
  ADD COLUMN IF NOT EXISTS deduction_other_1_name          text,
  ADD COLUMN IF NOT EXISTS deduction_other_1_amount        int,
  ADD COLUMN IF NOT EXISTS deduction_other_2_name          text,
  ADD COLUMN IF NOT EXISTS deduction_other_2_amount        int;

-- 確認
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'employment_conditions'
  AND column_name LIKE ANY(ARRAY[
    'daily_%', 'henkou_%', 'kotai_%',
    'shift%', 'allowance_%_calc%', 'deduction_%'
  ])
ORDER BY column_name;
