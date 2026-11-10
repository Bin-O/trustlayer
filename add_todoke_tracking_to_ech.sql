-- 随時届出（3-1-1号）の未対応追跡を employment_condition_history に追加する。
-- 背景：条件変更のスナップショットは残るが「届出したか」の状態を持たず、
--       ダッシュボードの四色（赤/橙/灰/緑）に現れなかった。3-1-2号と同型で追跡する。
--
-- 起算日について：届出期限の起算日は「変更年月日（労使の合意により効力が生じた日）」。
--   これは既存の changed_at 列（= フォームの effective_date を保存）を唯一の正本とし、
--   参照時に changed_at::date（アプリでは .slice(0,10)）で日付を取り出す。
--   専用の日付列は追加しない（changed_at と二重管理になり不整合リスクがあるため）。

-- ① 状態カラムを2つ追加
--    todoke_status: not_required（届出不要 / 既定）/ pending（未対応）/ generated（生成済）
--    todoke_generated_at: 届出書を生成した時刻
ALTER TABLE public.employment_condition_history
  ADD COLUMN IF NOT EXISTS todoke_status TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS todoke_generated_at TIMESTAMPTZ;

-- ② todoke_status の許容値を制約（システム判定結果なので想定外値の混入経路を塞ぐ）
ALTER TABLE public.employment_condition_history
  ADD CONSTRAINT ech_todoke_status_chk
  CHECK (todoke_status IN ('not_required', 'pending', 'generated'));

-- ③ UPDATE ポリシーを追加
--    現状 SELECT / INSERT のみ。UPDATE ポリシー欠如で「生成済」への更新が無音失敗するため。
--
--    ⚠️ Phase C（マルチテナント化）時の要見直し：
--    このポリシーは既存テーブル（residence_statuses / payroll_records /
--    organization_defaults 等）と揃えて USING (true) WITH CHECK (true) としている。
--    現状はテナント分離をアプリ側の org UUID ハードコードで担保しているため実害はないが、
--    マルチテナント化の際は org_id / auth.uid() による行レベルの絞り込みを
--    本ポリシー（および他の全 RLS ポリシー）へ一括で導入し直すこと。
CREATE POLICY "ech_update"
  ON public.employment_condition_history
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
