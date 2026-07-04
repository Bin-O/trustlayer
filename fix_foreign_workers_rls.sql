-- foreign_workers テーブルの既存 RLS ポリシーを確認してから全操作を許可するポリシーに統一
DROP POLICY IF EXISTS "Enable read for authenticated" ON public.foreign_workers;
DROP POLICY IF EXISTS "Enable insert for authenticated" ON public.foreign_workers;
DROP POLICY IF EXISTS "Enable update for authenticated" ON public.foreign_workers;
DROP POLICY IF EXISTS "Enable delete for authenticated" ON public.foreign_workers;
DROP POLICY IF EXISTS "Enable read for anon" ON public.foreign_workers;
DROP POLICY IF EXISTS "Enable insert for anon" ON public.foreign_workers;
DROP POLICY IF EXISTS "Enable update for anon" ON public.foreign_workers;
DROP POLICY IF EXISTS "Enable delete for anon" ON public.foreign_workers;
DROP POLICY IF EXISTS "foreign_workers_all" ON public.foreign_workers;

CREATE POLICY "foreign_workers_all" ON public.foreign_workers
  FOR ALL
  USING (true)
  WITH CHECK (true);
