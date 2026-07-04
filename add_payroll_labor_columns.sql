-- 定期届出（参考様式第3-6号）の集計に必要なカラムを追加
-- (1) 実労働日数、(2) 所定内実労働時間、(3) 超過実労働時間、(5) 賞与等

ALTER TABLE payroll_records
  ADD COLUMN IF NOT EXISTS working_days    SMALLINT,      -- 実労働日数（日）
  ADD COLUMN IF NOT EXISTS scheduled_hours NUMERIC(6,2),  -- 所定内実労働時間（時間）
  ADD COLUMN IF NOT EXISTS overtime_hours  NUMERIC(6,2),  -- 超過実労働時間（時間）
  ADD COLUMN IF NOT EXISTS bonus_pay       INTEGER;       -- 賞与等特別給与額（円）

-- 確認用
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'payroll_records'
ORDER BY ordinal_position;
