-- 支援計画書テンプレート用カラム追加 (organizations テーブル)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS shien_jizen_guidance    TEXT,
  ADD COLUMN IF NOT EXISTS shien_housing           TEXT,
  ADD COLUMN IF NOT EXISTS shien_life_support      TEXT,
  ADD COLUMN IF NOT EXISTS shien_japanese          TEXT,
  ADD COLUMN IF NOT EXISTS shien_consultation      TEXT,
  ADD COLUMN IF NOT EXISTS shien_japanese_contact  TEXT,
  ADD COLUMN IF NOT EXISTS shien_job_change        TEXT,
  ADD COLUMN IF NOT EXISTS shien_regular_meeting   TEXT;
