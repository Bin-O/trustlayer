-- ============================================================
-- TrustLayer: 会社情報・設定ページ用スキーマ
-- ============================================================

-- 1. Tab A: organizations に 2 カラム追加（他は既存）
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS corporate_number TEXT,
  ADD COLUMN IF NOT EXISTS industry         TEXT;

-- 2. Tab B: デフォルト設定テーブル新設
CREATE TABLE IF NOT EXISTS public.organization_defaults (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  work_start_time           TIME NOT NULL DEFAULT '09:00',
  work_end_time             TIME NOT NULL DEFAULT '18:00',
  break_minutes             INTEGER NOT NULL DEFAULT 60,
  has_36_agreement          BOOLEAN NOT NULL DEFAULT false,
  has_flex_time             BOOLEAN NOT NULL DEFAULT false,
  social_insurance_enrolled BOOLEAN NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id)
);

-- 3. organization_defaults の RLS
ALTER TABLE public.organization_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_defaults_authenticated_select"
  ON public.organization_defaults FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "org_defaults_authenticated_insert"
  ON public.organization_defaults FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "org_defaults_authenticated_update"
  ON public.organization_defaults FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- 4. 確認
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'organizations'
ORDER BY ordinal_position;

-- ============================================================
-- RLS 診断・修正 (保存が動かない場合に実行)
-- ============================================================

-- A. organizations テーブルのRLS状態とポリシー確認
SELECT relname, relrowsecurity AS rls_enabled
FROM pg_class WHERE relname IN ('organizations', 'organization_defaults');

SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename IN ('organizations', 'organization_defaults')
ORDER BY tablename, cmd;

-- B. organizations に SELECT/UPDATE ポリシーを作成（既存なら削除して再作成）
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_select_anon" ON public.organizations;
CREATE POLICY "org_select_anon" ON public.organizations FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "org_update_anon" ON public.organizations;
CREATE POLICY "org_update_anon" ON public.organizations FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- C. organization_defaults に anon ポリシーを追加
DROP POLICY IF EXISTS "org_defaults_anon_select" ON public.organization_defaults;
CREATE POLICY "org_defaults_anon_select" ON public.organization_defaults FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "org_defaults_anon_insert" ON public.organization_defaults;
CREATE POLICY "org_defaults_anon_insert" ON public.organization_defaults FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "org_defaults_anon_update" ON public.organization_defaults;
CREATE POLICY "org_defaults_anon_update" ON public.organization_defaults FOR UPDATE TO anon USING (true) WITH CHECK (true);
