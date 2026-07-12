-- ============================================================
-- TrustLayer: support_tasks（タスクエンジン基盤・Phase 2 面談タスク様板）
-- 実行方法: node run_sql.mjs create_support_tasks.sql
--           または Supabase SQL Editor に貼り付けて実行
-- ============================================================

CREATE TABLE IF NOT EXISTS public.support_tasks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id),
  worker_id         uuid NOT NULL REFERENCES public.foreign_workers(id) ON DELETE CASCADE,
  task_type         text NOT NULL,        -- 'quarterly_interview'（今回はこの1種のみ。
                                          --  将来: 業界パッケージがここに種別を追加）
  period_key        text NOT NULL,        -- '2026-Q3' 形式（trustScore.ts の quarterKey と同一）
  due_date          date NOT NULL,
  status            text NOT NULL DEFAULT 'pending',  -- 'pending' | 'completed'
  completed_at      timestamptz,
  record            jsonb,                -- 三段式「記録する」フォームの生データ
  support_record_id uuid REFERENCES public.support_records(id),
                                          -- 完了時に生成した法定記録への参照
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  UNIQUE (worker_id, task_type, period_key)   -- レイジー生成の重複防止
);

CREATE INDEX IF NOT EXISTS idx_support_tasks_status_due
  ON public.support_tasks (status, due_date);
CREATE INDEX IF NOT EXISTS idx_support_tasks_worker
  ON public.support_tasks (worker_id, task_type);

-- RLS（anon / authenticated 両方に SELECT / INSERT / UPDATE。
-- UPDATE ポリシー漏れによるサイレント失敗の既知パターン対策）
ALTER TABLE public.support_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_tasks_select_authenticated" ON public.support_tasks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "support_tasks_insert_authenticated" ON public.support_tasks
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "support_tasks_update_authenticated" ON public.support_tasks
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "support_tasks_select_anon" ON public.support_tasks
  FOR SELECT TO anon USING (true);
CREATE POLICY "support_tasks_insert_anon" ON public.support_tasks
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "support_tasks_update_anon" ON public.support_tasks
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- 確認クエリ
SELECT tablename, policyname, roles, cmd
FROM pg_policies WHERE tablename = 'support_tasks'
ORDER BY policyname;
