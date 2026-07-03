-- 契約終了・新契約届出用カラム追加 (worker_contracts テーブル)
ALTER TABLE public.worker_contracts
  ADD COLUMN IF NOT EXISTS termination_date   DATE,
  ADD COLUMN IF NOT EXISTS termination_reason TEXT,
  ADD COLUMN IF NOT EXISTS termination_type   TEXT
    CHECK (termination_type IN ('expiry','resignation','dismissal','other')),
  ADD COLUMN IF NOT EXISTS new_contract_date  DATE;
