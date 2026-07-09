-- ============================================================
-- TrustLayer: document_generations（書類生成履歴）テーブル作成
-- 「未対応の届出」判定に使用。生成APIが成功時に自動記録する。
-- 実行方法: node run_sql.mjs <PAT> create_document_generations.sql
--           または Supabase SQL Editor に貼り付けて実行
-- ============================================================

CREATE TABLE IF NOT EXISTS public.document_generations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id    uuid REFERENCES public.foreign_workers(id) ON DELETE CASCADE,  -- 定期届出（機関全体）は NULL
  document_id  text NOT NULL,            -- 'todoke_keiyaku_shuryo' | 'teiki_hokoku' 等（DocumentId）
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_docgen_worker_doc
  ON public.document_generations (worker_id, document_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_docgen_doc
  ON public.document_generations (document_id, generated_at DESC);

-- RLS（anon キーでのアクセスが無音失敗しないよう anon / authenticated 両方にポリシーを付与）
ALTER TABLE public.document_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "docgen_select_authenticated"
  ON public.document_generations
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "docgen_insert_authenticated"
  ON public.document_generations
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "docgen_select_anon"
  ON public.document_generations
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "docgen_insert_anon"
  ON public.document_generations
  FOR INSERT TO anon
  WITH CHECK (true);

-- 確認
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE tablename = 'document_generations'
ORDER BY policyname;
