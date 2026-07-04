-- residence_statuses テーブルの RLS ポリシーを確認
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'residence_statuses';

-- 既存ポリシーを全削除して再作成
DROP POLICY IF EXISTS "Enable read for authenticated" ON public.residence_statuses;
DROP POLICY IF EXISTS "Enable insert for authenticated" ON public.residence_statuses;
DROP POLICY IF EXISTS "Enable update for authenticated" ON public.residence_statuses;
DROP POLICY IF EXISTS "Enable delete for authenticated" ON public.residence_statuses;
DROP POLICY IF EXISTS "Enable read for anon" ON public.residence_statuses;
DROP POLICY IF EXISTS "Enable insert for anon" ON public.residence_statuses;
DROP POLICY IF EXISTS "Enable update for anon" ON public.residence_statuses;
DROP POLICY IF EXISTS "residence_statuses_all" ON public.residence_statuses;

CREATE POLICY "residence_statuses_all" ON public.residence_statuses
  FOR ALL
  USING (true)
  WITH CHECK (true);
