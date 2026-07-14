-- ============================================================
-- TrustLayer 段1: 業界パッケージ基盤スキーマ
--   1) residence_statuses.status_subtype 追加（論点1-A: 55号を明示）
--   2) worker_work_assignments 新規（論点2: 作業割当 → 資格ギャップ判定）
-- 実行方法: node run_sql.mjs create_industry_package.sql
-- ============================================================

-- ── 1) 55号識別列（自由テキスト。status_type='特定活動' の細分） ──
ALTER TABLE public.residence_statuses
  ADD COLUMN IF NOT EXISTS status_subtype text;
COMMENT ON COLUMN public.residence_statuses.status_subtype IS
  '在留資格の細分。例: 特定活動55号(自動車運送)。NULL=細分なし。更新不可判定・業界パッケージ解決に使用';

-- ── 2) 作業割当（作業 × 必要資格マッチングの「要求層」） ──
CREATE TABLE IF NOT EXISTS public.worker_work_assignments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id),
  worker_id          uuid NOT NULL REFERENCES public.foreign_workers(id) ON DELETE CASCADE,
  work_key           text NOT NULL,                     -- 'forklift_1t' 等（業界パッケージの WorkQualRule.work と対応）
  planned_start_date date,                              -- 従事予定日（未従事=予定、⑤の「作業予定」）
  status             text NOT NULL DEFAULT 'planned',   -- 'planned' | 'active' | 'ended'
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),
  UNIQUE (worker_id, work_key)                          -- 1作業1割当（重複防止）
);

CREATE INDEX IF NOT EXISTS idx_wwa_worker
  ON public.worker_work_assignments (worker_id);

-- RLS（新テーブル必須ルール: anon/authenticated 双方に SELECT/INSERT/UPDATE。
--   UPDATE 漏れによるサイレント失敗の既知パターン対策。
--   DELETE は付けない = 親 foreign_workers の FK CASCADE に委ねる（worker_contracts と同方針））
ALTER TABLE public.worker_work_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wwa_select_authenticated" ON public.worker_work_assignments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "wwa_insert_authenticated" ON public.worker_work_assignments
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "wwa_update_authenticated" ON public.worker_work_assignments
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "wwa_select_anon" ON public.worker_work_assignments
  FOR SELECT TO anon USING (true);
CREATE POLICY "wwa_insert_anon" ON public.worker_work_assignments
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "wwa_update_anon" ON public.worker_work_assignments
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- 確認クエリ
SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name='residence_statuses' AND column_name='status_subtype';
SELECT tablename, policyname, roles, cmd FROM pg_policies
  WHERE tablename='worker_work_assignments' ORDER BY policyname;
