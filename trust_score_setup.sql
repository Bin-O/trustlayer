-- ============================================================
-- TrustLayer: 信頼スコア Phase 1 DB変更（仕様書 §3）
-- 実行方法: node run_sql.mjs <PAT> trust_score_setup.sql
--           または Supabase SQL Editor に貼り付けて実行
-- 注意: 既存 trust_score_snapshots（旧スケルトン・0行確認済み）を
--       DROP して仕様書準拠で作り直す
-- ============================================================

-- ── 3-1. qualifications（資格・日本語） ──────────────────────
CREATE TABLE IF NOT EXISTS public.qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  worker_id uuid NOT NULL REFERENCES public.foreign_workers(id) ON DELETE CASCADE,
  type text NOT NULL,              -- 'jlpt' | 'skill_exam' | 'other'
  level text,                      -- 'N1'..'N5', 試験名等
  acquired_date date,
  verified_level text NOT NULL DEFAULT 'self_reported',
    -- 'self_reported'(申告) | 'document_confirmed'(書類確認済)
  certificate_number text,
  evidence_url text,               -- Supabase Storage の証明書画像パス
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qualifications_worker
  ON public.qualifications (worker_id);

ALTER TABLE public.qualifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qualifications_select_authenticated" ON public.qualifications
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "qualifications_insert_authenticated" ON public.qualifications
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "qualifications_update_authenticated" ON public.qualifications
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "qualifications_select_anon" ON public.qualifications
  FOR SELECT TO anon USING (true);
CREATE POLICY "qualifications_insert_anon" ON public.qualifications
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "qualifications_update_anon" ON public.qualifications
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ── 3-2. support_records（面談・講習記録） ────────────────────
CREATE TABLE IF NOT EXISTS public.support_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  worker_id uuid NOT NULL REFERENCES public.foreign_workers(id) ON DELETE CASCADE,
  type text NOT NULL,              -- 'interview_worker' | 'interview_supervisor'
                                   -- | 'orientation' | 'training'
  quarter text,                    -- '2026-Q3' 形式（面談の場合必須）
  scheduled_date date,
  completed boolean DEFAULT false,
  completed_date date,
  method text,                     -- 'in_person' | 'online'
  online_consent boolean,          -- オンライン面談の場合の本人同意
  recording_url text,              -- 録画ファイル参照（オンラインの場合）
  recording_retention_until date,  -- 契約終了日 + 1年（アプリ側で自動計算）
  notes jsonb,                     -- 面談確認項目チェック結果（参考様式第5-5/5-6号準拠）
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_records_worker_quarter
  ON public.support_records (worker_id, quarter);

ALTER TABLE public.support_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_records_select_authenticated" ON public.support_records
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "support_records_insert_authenticated" ON public.support_records
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "support_records_update_authenticated" ON public.support_records
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "support_records_select_anon" ON public.support_records
  FOR SELECT TO anon USING (true);
CREATE POLICY "support_records_insert_anon" ON public.support_records
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "support_records_update_anon" ON public.support_records
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ── 3-3. evaluations 拡張 ────────────────────────────────────
ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS evaluator_role text,
    -- 'support_staff'(支援担当者) | 'site_supervisor'(現場責任者)
  ADD COLUMN IF NOT EXISTS quarter text,              -- '2026-Q3'
  ADD COLUMN IF NOT EXISTS support_record_id uuid REFERENCES public.support_records(id),
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,     -- 四半期クローズ後ロック
  ADD COLUMN IF NOT EXISTS excluded boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS excluded_reason text;
    -- 'post_resignation' | 'outlier_review' 等

-- evaluations には anon の UPDATE ポリシーが無い（既知のサイレント失敗
-- パターン）。Phase 2 のロック/除外処理で必要になるため今回セットで追加。
CREATE POLICY "evaluations_update_anon" ON public.evaluations
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ── 3-4. trust_score_snapshots 作り直し ──────────────────────
-- 既存テーブルは旧スケルトン（id, worker_id, computed_at）で仕様と不一致。
-- 0行であることを確認済みのため DROP して仕様書準拠で再作成する。
DROP TABLE IF EXISTS public.trust_score_snapshots;

CREATE TABLE public.trust_score_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  worker_id uuid NOT NULL REFERENCES public.foreign_workers(id) ON DELETE CASCADE,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  month text NOT NULL,             -- '2026-07' 形式
  total numeric NOT NULL,
  breakdown jsonb NOT NULL,        -- 仕様書 §4 の breakdown 形式
  data_sufficiency numeric NOT NULL,
  formula_version int NOT NULL,
  UNIQUE (worker_id, month)
);

ALTER TABLE public.trust_score_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tss_select_authenticated" ON public.trust_score_snapshots
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tss_insert_authenticated" ON public.trust_score_snapshots
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tss_update_authenticated" ON public.trust_score_snapshots
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tss_select_anon" ON public.trust_score_snapshots
  FOR SELECT TO anon USING (true);
CREATE POLICY "tss_insert_anon" ON public.trust_score_snapshots
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "tss_update_anon" ON public.trust_score_snapshots
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ── 確認クエリ ───────────────────────────────────────────────
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE tablename IN ('qualifications', 'support_records', 'evaluations', 'trust_score_snapshots')
ORDER BY tablename, policyname;
