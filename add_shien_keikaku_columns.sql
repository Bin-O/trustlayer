-- ============================================================
-- TrustLayer: 支援計画書(参考様式第1-17号)対応カラム追加
-- ============================================================

-- 1. foreign_workers: 氏名ふりがな・性別
ALTER TABLE public.foreign_workers
  ADD COLUMN IF NOT EXISTS name_kana TEXT,
  ADD COLUMN IF NOT EXISTS gender    TEXT
    CHECK (gender IN ('male', 'female'));

-- 2. organizations: 支援計画書記載項目
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS name_kana                TEXT,
  ADD COLUMN IF NOT EXISTS support_office_address   TEXT,
  ADD COLUMN IF NOT EXISTS support_office_phone     TEXT,
  ADD COLUMN IF NOT EXISTS support_supervisor_name  TEXT,
  ADD COLUMN IF NOT EXISTS support_supervisor_kana  TEXT,
  ADD COLUMN IF NOT EXISTS support_supervisor_title TEXT,
  ADD COLUMN IF NOT EXISTS support_staff_name       TEXT,
  ADD COLUMN IF NOT EXISTS support_staff_kana       TEXT,
  ADD COLUMN IF NOT EXISTS support_staff_title      TEXT;

-- 3. 確認
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('foreign_workers', 'organizations')
  AND column_name IN (
    'name_kana', 'gender',
    'support_office_address', 'support_office_phone',
    'support_supervisor_name', 'support_supervisor_kana', 'support_supervisor_title',
    'support_staff_name', 'support_staff_kana', 'support_staff_title'
  )
ORDER BY table_name, column_name;
