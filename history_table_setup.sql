CREATE TABLE IF NOT EXISTS public.employment_condition_history (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id         UUID        NOT NULL
                    REFERENCES public.foreign_workers(id) ON DELETE CASCADE,
  changed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  change_reason     TEXT,
  snapshot_data     JSONB       NOT NULL,
  contract_snapshot JSONB
);

CREATE INDEX IF NOT EXISTS idx_ech_worker_changed
  ON public.employment_condition_history (worker_id, changed_at DESC);

ALTER TABLE public.employment_condition_history
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ech_select"
  ON public.employment_condition_history
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "ech_insert"
  ON public.employment_condition_history
  FOR INSERT TO authenticated
  WITH CHECK (true);
