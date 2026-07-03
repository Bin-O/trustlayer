CREATE TABLE public.payroll_records (
  id                   UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id            UUID         REFERENCES public.foreign_workers(id) ON DELETE CASCADE,
  organization_id      UUID         REFERENCES public.organizations(id)   ON DELETE CASCADE,
  target_year          INTEGER      NOT NULL,
  target_month         INTEGER      NOT NULL,
  basic_salary         INTEGER,
  overtime_pay         INTEGER,
  late_night_pay       INTEGER,
  commuting_allowance  INTEGER,
  other_allowance      INTEGER,
  gross_pay            INTEGER,
  health_insurance     INTEGER,
  pension              INTEGER,
  employment_insurance INTEGER,
  income_tax           INTEGER,
  resident_tax         INTEGER,
  other_deduction      INTEGER,
  total_deduction      INTEGER,
  net_pay              INTEGER,
  raw_text             TEXT,
  created_at           TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(worker_id, target_year, target_month)
);

ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_records_all" ON public.payroll_records
  FOR ALL USING (true);
