-- INSERTにはWITH CHECKが必要なため既存ポリシーを作り直す
DROP POLICY IF EXISTS "payroll_records_all" ON public.payroll_records;

CREATE POLICY "payroll_records_all" ON public.payroll_records
  FOR ALL
  USING (true)
  WITH CHECK (true);
