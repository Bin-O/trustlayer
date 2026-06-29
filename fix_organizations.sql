-- ============================================================
-- TrustLayer: organizations RLS + データ修正
-- ============================================================

-- 1. カラム追加（未実行の場合に備えて）
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS address                    text,
  ADD COLUMN IF NOT EXISTS phone                      text,
  ADD COLUMN IF NOT EXISTS representative_title       text DEFAULT '代表取締役',
  ADD COLUMN IF NOT EXISTS representative_name        text,
  ADD COLUMN IF NOT EXISTS tokutei_skills_reg_number  text;

-- 2. RLS 有効化
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 3. anon 読み取りポリシー（DROP→CREATE で冪等に）
DROP POLICY IF EXISTS "Enable read for anon" ON public.organizations;

CREATE POLICY "Enable read for anon"
  ON public.organizations
  FOR SELECT TO anon
  USING (true);

-- 4. authenticated 読み取りポリシー
DROP POLICY IF EXISTS "Enable read for authenticated" ON public.organizations;

CREATE POLICY "Enable read for authenticated"
  ON public.organizations
  FOR SELECT TO authenticated
  USING (true);

-- 5. デモ株式会社データを確保（org_id = '11111111-...' に対応）
INSERT INTO public.organizations (
  id,
  name,
  address,
  phone,
  representative_title,
  representative_name,
  tokutei_skills_reg_number
)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'デモ株式会社',
  '東京都千代田区丸の内1-1-1',
  '03-1234-5678',
  '代表取締役',
  '田中 太郎',
  '19登-000001'
)
ON CONFLICT (id) DO UPDATE
  SET
    name                      = EXCLUDED.name,
    address                   = EXCLUDED.address,
    phone                     = EXCLUDED.phone,
    representative_title      = EXCLUDED.representative_title,
    representative_name       = EXCLUDED.representative_name,
    tokutei_skills_reg_number = EXCLUDED.tokutei_skills_reg_number;

-- 6. 確認
SELECT id, name, address, phone, representative_title, representative_name
FROM public.organizations;
