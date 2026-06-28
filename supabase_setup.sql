-- ============================================================
-- TrustLayer: evaluations テーブル セットアップ
-- Supabase SQL Editor に貼り付けて実行してください
-- ============================================================

-- 1. evaluations テーブルを作成
create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid references public.foreign_workers(id) on delete cascade,
  attendance_score int check (attendance_score between 0 and 20),
  performance_score int check (performance_score between 0 and 20),
  compliance_score int check (compliance_score between 0 and 10),
  evaluated_at timestamptz default now()
);

-- 2. RLS を有効化
alter table public.evaluations enable row level security;

-- 3. RLS ポリシー（foreign_workers と同じパターン）
-- 認証ユーザーは全読み取り可
create policy "Enable read for authenticated" on public.evaluations
  for select to authenticated using (true);

-- 認証ユーザーは挿入可
create policy "Enable insert for authenticated" on public.evaluations
  for insert to authenticated with check (true);

-- 認証ユーザーは更新可
create policy "Enable update for authenticated" on public.evaluations
  for update to authenticated using (true) with check (true);

-- 匿名ユーザーも読み取り可（ブラウザから anon key で参照するため）
create policy "Enable read for anon" on public.evaluations
  for select to anon using (true);

-- 匿名ユーザーも挿入可（デモ用）
create policy "Enable insert for anon" on public.evaluations
  for insert to anon with check (true);

-- 4. デモ用データを5名分挿入（スコアに高低差をつける）
-- ※ foreign_workers の順番通りに割り当て
-- Worker 1: 優秀（高スコア）
insert into public.evaluations (worker_id, attendance_score, performance_score, compliance_score)
select id, 18, 17, 9
from public.foreign_workers
order by created_at asc
limit 1;

-- Worker 2: 普通（中スコア）
insert into public.evaluations (worker_id, attendance_score, performance_score, compliance_score)
select id, 14, 12, 7
from public.foreign_workers
order by created_at asc
limit 1 offset 1;

-- Worker 3: 要改善（低スコア）
insert into public.evaluations (worker_id, attendance_score, performance_score, compliance_score)
select id, 8, 6, 4
from public.foreign_workers
order by created_at asc
limit 1 offset 2;

-- Worker 4: 良好（高スコア）
insert into public.evaluations (worker_id, attendance_score, performance_score, compliance_score)
select id, 16, 15, 8
from public.foreign_workers
order by created_at asc
limit 1 offset 3;

-- Worker 5: 低評価（低スコア）
insert into public.evaluations (worker_id, attendance_score, performance_score, compliance_score)
select id, 10, 9, 5
from public.foreign_workers
order by created_at asc
limit 1 offset 4;

-- 確認クエリ（実行後に件数を確認）
select e.id, w.name_kanji, e.attendance_score, e.performance_score, e.compliance_score, e.evaluated_at
from public.evaluations e
join public.foreign_workers w on e.worker_id = w.id
order by e.evaluated_at;
