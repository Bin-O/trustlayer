-- ============================================================
-- TrustLayer セッションA: 義務マスタ（仕様書 v4 第2章・6.1）
--   1) obligations           … 規則マスタ（code × version、valid_from/valid_to で制度改正対応）
--   2) obligation_instances  … 判定結果（subject 3層・完了は evidence の存在で証明）
--   3) 製造業 forklift_1t ルールの移行（manufacturing.ts の workQualRules と同値）
-- 実行方法: Supabase SQL Editor で WB が実行。
--   冪等（再実行してもエラーにならない）。ただし CREATE TABLE IF NOT EXISTS のため、
--   既存テーブルの列・制約の変更は再実行では反映されない（変更時は別途 ALTER を書く）。
--
-- ■ version の運用ルール（2026-11-10 WB 裁定）
--   version を上げるのは判定挙動が変わる改正のみ。
--   法令名・刑名・条文番号の表記修正は同一 version を直接修正する。
--   判断に迷う場合は版を上げる側に倒し、理由をコメントに残す。
--   （理由: 表記修正のたびに版を増やすと、判定結果が同一の版が大量に生まれマスタが肥大化する）
--   適用例: MFG_FORKLIFT_GE1T v1 の penalty_detail「懲役」→「拘禁刑」（2025年6月施行の刑法改正による
--           刑名の統一。実体＝6月以下・50万円以下も判定挙動も不変）は v1 を直接修正した（2026-11-10）。
--
-- ■ 既知の欠口（セッションAの紙上検証で判明。運送業データ投入時に必ず当たる）
--
--   [GAP-1] establishment 主体の義務は done にできない。
--     理由: 証拠層（選任記録等）が未実装。evidence_type は worker 主体の記録しか持たず、
--           トリガーも subject_type<>'worker' を拒否するため、黙って完了不能になる。
--           → CHECK chk_oi_no_done_establishment で明示的に禁止している。
--     解除: セッションCで establishments を新設する際、選任記録テーブル（例: establishment_appointments）を
--           同時に作り、evidence_type の CHECK とトリガー obligation_instances_verify_evidence() を
--           同時に拡張する（subject 実在検証の establishment 分岐も同時に追加）。
--     解除時に DROP: chk_oi_no_done_establishment
--     該当例: はい作業主任者の選任（CARGO_HAI_SAGYO）
--
--   [GAP-2] company 主体の義務は done にできない。
--     理由: 証拠層（認証・協議会加入の記録等）が未実装。GAP-1 と同じ構造で黙って完了不能になる。
--           → CHECK chk_oi_no_done_company で明示的に禁止している。
--     解除: セッションCで企業レベル義務の画面を作る際、企業単位の記録テーブル
--           （例: company_certifications＝認証の種別・取得日・有効期限、council_memberships＝協議会構成員資格証明書）
--           を作り、evidence_type の CHECK とトリガーを同時に拡張する。
--           ※ 認証・協議会が本社一括か事業所単位か（仕様書 第7章 #7）を先に確定すること。
--     解除時に DROP: chk_oi_no_done_company
--     該当例: TRANS_CERT / TRANS_COUNCIL / TRANS_CERT_EXPIRY
--
--   [GAP-3] 部分免除（時間短縮）を表現できない。                      … obligations.exemption_condition
--     現状: exemption_condition は「満たせば義務ごと対象外（not_applicable）」の全部免除しか意味を持たない。
--     入らないもの: テールゲートリフター特別教育の「6か月以上の経験者は一部科目を省略可」
--                   （義務は残り、必要時間だけが減る）。
--     解除: セッションBで exemption_condition に効果種別（例 "effect":"exempt" | "reduce"）と短縮後の
--           必要量を定義し、判定エンジンが obligation_instances.progress_required を減算する。
--
--   [GAP-4] 積み上げ型の進捗が1系統しか持てない。                      … obligation_instances.progress_current / progress_required / progress_unit
--     入らないもの: テールゲートリフター特別教育の「学科4h ＋ 実技2h」を別々に積み上げること。
--                   （合算6hにすると学科不足・実技超過を区別できない）
--     解除: セッションBで progress を JSONB の系統配列にする、または code を分割する（初任教育の
--           ZAGAKU/JISSHA と同方式）かを決める。分割する場合は同一証拠を両 instance が参照する前提。
--
--   [GAP-5] 1つの義務に発火が1種類しか持てない。                        … obligations.trigger_type / trigger_condition
--     入らないもの: 特定業務従事者健診の「6か月ごと（time）」＋「配置替えの際（event）」。
--     2行に分割すると、配置替え時に受診した日から6か月周期が再起算される関係が失われる
--     （deadline_basis に「いずれかの発火による前回実施日」を表す手段がない）。
--     解除: セッションBで trigger_condition に複数発火（例 {"type":"composite","triggers":[...]}）を許し、
--           trigger_type に 'composite' を追加する、または前回実施日を共有する仕組みを入れる。
--
--   [GAP-6] 健康診断の記録を証拠にできない。                            … obligation_instances.evidence_type
--     入らないもの: 特定業務従事者健診・定期健診の完了。健診記録テーブルが存在しない。
--     解除: 健診を義務マスタへ投入するセッションで health_checkups（受診日・種別・結果保管）を新設し、
--           evidence_type の CHECK とトリガーを同時に拡張する。
--
--   [GAP-7] 在留資格の行を証拠にできない。                              … obligation_instances.evidence_type
--     入らないもの: 在留期限更新の完了（＝新しい residence_statuses 行の存在）。
--     解除: evidence_type に 'residence_status' を追加し、トリガーで residence_statuses の実在
--           （同一 worker・当該 cycle_key より新しい期間）を検証する。セッションB。
--
--   [GAP-8] 「申請済・結果待ち」の状態がない。                          … obligation_instances.status
--     入らないもの: 在留期限更新の申請後〜許可前（特例期間）。pending では未申請と区別できず、
--                   done にすると許可前に緑になる。
--     解除: セッションBで status に 'filed'（申請済）を追加するか、申請受付の記録を別証拠として持つかを決める。
--
--   [GAP-9] 人ごとの相対的な提出期間を表現できない。                    … obligations.window_start / window_end
--     現状: 'MM-DD' の暦固定期間（定期届出の 4/1〜5/31 型）のみ。
--     入らないもの: 在留期限更新の「期限日の3か月前から申請可」。
--     解除: セッションBで window_offset_days（基準日からの相対日数）等を追加する。
--
--   [GAP-10] 事業所単位の集計発火を表現できない。                       … obligations.trigger_type
--     入らないもの: はい作業主任者の「高さ2m以上のはい作業がある事業所に発生」
--                   （＝事業所内に該当作業の割当者が1人以上いる）。既存5型のいずれにも該当しない。
--     解除: セッションCで trigger_type に 'establishment_activity' 等を追加。
--           前提として作業割当（worker_work_assignments）と事業所の紐付けが必要。
--           また「作業ごとに選任」の場合、1事業所1 instance では足りない可能性がある（cycle_key を流用しないこと）。
--
--   [GAP-11]（格納は可能・専用カラムなし）適用対象者の条件。              … obligations に該当カラムなし（trigger_condition 内の JSON キーで代替）
--     例: 特定業務健診の「深夜業に常時従事する者」、フォークリフトの work_key。
--     発火条件と適用条件が同じ JSON に混在する。セッションBで applicability 列の分離要否を判断する。
-- ============================================================

-- ── 1) obligations（規則マスタ） ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.obligations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 識別
  code                     text NOT NULL,              -- 'MFG_FORKLIFT_GE1T' 等。人間が読める安定ID
  version                  integer NOT NULL DEFAULT 1, -- 同一 code の版（制度改正で増える）
  name_ja                  text NOT NULL,
  description              text,
  -- 発火
  trigger_type             text NOT NULL
    CHECK (trigger_type IN ('time','qualification','duration_state','event','change_detection')),
  trigger_event            text,                       -- 事件型のみ（'事故惹起' 等）
  trigger_condition        jsonb NOT NULL,             -- 形式は trigger_type ごと（2.2）。type キーは trigger_type と一致
  -- 期限
  deadline_days            integer,
  deadline_basis           text,                       -- '入社日' '許可日' '事象発生日' '従事開始日' 等
  deadline_exception_days  integer,                    -- 「やむを得ない場合○日以内」
  window_start             text,                       -- 提出期間型 'MM-DD'（例 '04-01'）
  window_end               text,                       -- 同上（例 '05-31'）
  recurrence               text NOT NULL DEFAULT 'once'
    CHECK (recurrence IN ('once','yearly','half_yearly','quarterly','continuous')),
  -- 適用範囲
  visa_types               text[],                     -- NULL = 在留資格を問わない
  industry_fields          text[],                     -- NULL = 全分野共通。値は IndustryCode（'manufacturing' 等）
  industry_subtypes        text[],                     -- 'トラック' 'タクシー' 'バス' 等
  trigger_scope            text NOT NULL CHECK (trigger_scope IN ('worker','establishment','company')),
  filing_scope             text NOT NULL CHECK (filing_scope  IN ('worker','establishment','company')),
  -- 免除
  exemption_condition      jsonb,                      -- 判定データ欠如時は needs_review（部分免除は不可: GAP-3）
  -- 依存（code 参照。version を固定しない＝評価時点で有効な版に解決する）
  --   ※ code は version 単位で複数行あり一意でないため FK は張れない。存在保証は末尾の確認クエリで行う
  depends_on_code          text,
  -- 法的情報
  legal_basis              text NOT NULL,              -- 根拠条文は必須（中核思想）
  penalty_type             text CHECK (penalty_type IN ('penalty','disqualification','guidance','suspension')),
  penalty_detail           text,
  -- 有効期間
  valid_from               date NOT NULL,
  valid_to                 date,                       -- NULL = 現行
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now(),
  UNIQUE (code, version),
  CHECK (trigger_condition->>'type' = trigger_type),
  CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CHECK (depends_on_code IS NULL OR depends_on_code <> code)
);

-- RLS: マスタはクライアントから読取のみ。投入・改版は SQL Editor / Management API 経由。
--   ※新テーブルの SELECT/INSERT/UPDATE セット原則の意図的例外（クライアントが規則を書き換えられない）
ALTER TABLE public.obligations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "obligations_select_authenticated" ON public.obligations;
CREATE POLICY "obligations_select_authenticated" ON public.obligations
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "obligations_select_anon" ON public.obligations;
CREATE POLICY "obligations_select_anon" ON public.obligations
  FOR SELECT TO anon USING (true);

-- ── 2) obligation_instances（判定結果） ────────────────────────
CREATE TABLE IF NOT EXISTS public.obligation_instances (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL REFERENCES public.organizations(id),
  obligation_id            uuid NOT NULL REFERENCES public.obligations(id),  -- 版は obligations 行で一意
  subject_type             text NOT NULL CHECK (subject_type IN ('worker','establishment','company')),
  subject_id               uuid NOT NULL,              -- worker=foreign_workers.id / company=organizations.id /
                                                       -- establishment=establishments.id（同テーブルはセッションCで新設）
                                                       -- 多態参照のため FK は張れない。実在はトリガーで検証する
  -- 循環型の期を識別する。単発型は ''（空文字）。例: 半年ごと '2026-H1'、年1回 '2026'、
  --   在留期限更新 = 対象の residence_statuses.id。
  --   ※ NULL を使わない（UNIQUE で NULL 同士は重複扱いされず、単発型の一意性が壊れるため）
  cycle_key                text NOT NULL DEFAULT '',
  status                   text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','done','not_applicable','needs_review')),
  deadline_date            date,
  deadline_exception_date  date,
  progress_current         numeric,                    -- 1系統のみ（GAP-4）
  progress_required        numeric,
  progress_unit            text,                       -- '時間' 等（積み上げ型）
  completed_at             timestamptz,
  -- 証拠種別は「実在記録をトリガーで検証できるもの」だけを許可。追加時は CHECK とトリガーを同時に拡張する。
  --   ※ document_generations は「書類を生成した」記録であり「届け出た」証拠ではないため対象外
  evidence_type            text CHECK (evidence_type IN ('qualification','support_record')),
  evidence_id              uuid,
  exempted_reason          text,
  computed_at              timestamptz NOT NULL DEFAULT now(),
  input_snapshot           jsonb,
  prev_hash                text,                       -- 将来の改ざん防止用。当面 NULL
  hash                     text,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now(),
  UNIQUE (obligation_id, subject_type, subject_id, cycle_key),
  -- ★ 完了 = 記録の存在。done なのに evidence が無い行は作れない
  CHECK (status <> 'done' OR (evidence_type IS NOT NULL AND evidence_id IS NOT NULL AND completed_at IS NOT NULL)),
  -- evidence は片方だけ入れられない
  CHECK ((evidence_type IS NULL) = (evidence_id IS NULL)),
  -- 対象外は理由必須（推測で対象外にしない）
  CHECK (status <> 'not_applicable' OR exempted_reason IS NOT NULL),
  -- [GAP-1] establishment 主体の done を明示的に禁止する。証拠層（選任記録等）が未実装のため。
  --   セッションCで選任記録テーブル＋evidence_type＋トリガーを拡張した時点で DROP すること。
  CONSTRAINT chk_oi_no_done_establishment CHECK (subject_type <> 'establishment' OR status <> 'done'),
  -- [GAP-2] company 主体の done を明示的に禁止する。証拠層（認証・協議会加入の記録等）が未実装のため。
  --   セッションCで企業単位の記録テーブル＋evidence_type＋トリガーを拡張した時点で DROP すること。
  CONSTRAINT chk_oi_no_done_company CHECK (subject_type <> 'company' OR status <> 'done')
);

CREATE INDEX IF NOT EXISTS idx_oi_subject ON public.obligation_instances (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_oi_org     ON public.obligation_instances (organization_id);

-- ★ 多態参照の整合性をDBで強制する（FK の代替）。
--   (1) subject_id が実在する主体を指していること
--   (2) evidence_id が実在する記録を指していること（かつ同じ主体の記録であること）
--   CHECK だけでは任意の UUID を入れて緑にできるため、存在検証をトリガーで行う。
CREATE OR REPLACE FUNCTION public.obligation_instances_verify_evidence()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- (1) subject 実在検証
  IF NEW.subject_type = 'worker' THEN
    IF NOT EXISTS (SELECT 1 FROM public.foreign_workers w WHERE w.id = NEW.subject_id) THEN
      RAISE EXCEPTION 'subject worker % not found', NEW.subject_id;
    END IF;
  ELSIF NEW.subject_type = 'company' THEN
    IF NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = NEW.subject_id) THEN
      RAISE EXCEPTION 'subject company % not found', NEW.subject_id;
    END IF;
  ELSIF NEW.subject_type = 'establishment' THEN
    -- 当面スキップ: establishments テーブルが未作成のため検証先が存在しない（GAP-1）。
    -- セッションCで establishments を新設する際にこの分岐へ実在検証を追加すること。
    NULL;
  ELSE
    RAISE EXCEPTION 'unknown subject_type: %', NEW.subject_type;
  END IF;

  -- (2) evidence 実在検証
  IF NEW.evidence_type IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.evidence_type = 'qualification' THEN
    IF NEW.subject_type <> 'worker' OR NOT EXISTS (
      SELECT 1 FROM public.qualifications q
       WHERE q.id = NEW.evidence_id AND q.worker_id = NEW.subject_id) THEN
      RAISE EXCEPTION 'evidence qualification % not found for worker %', NEW.evidence_id, NEW.subject_id;
    END IF;
  ELSIF NEW.evidence_type = 'support_record' THEN
    IF NEW.subject_type <> 'worker' OR NOT EXISTS (
      SELECT 1 FROM public.support_records r
       WHERE r.id = NEW.evidence_id AND r.worker_id = NEW.subject_id AND r.completed = true) THEN
      RAISE EXCEPTION 'evidence support_record % not found/completed for worker %', NEW.evidence_id, NEW.subject_id;
    END IF;
  ELSE
    -- CHECK に種別を追加してトリガー側の追加を忘れた場合に、検証なしで通さない
    RAISE EXCEPTION 'unknown evidence_type: %', NEW.evidence_type;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_oi_verify_evidence ON public.obligation_instances;
CREATE TRIGGER trg_oi_verify_evidence
  BEFORE INSERT OR UPDATE ON public.obligation_instances
  FOR EACH ROW EXECUTE FUNCTION public.obligation_instances_verify_evidence();

-- RLS（SELECT/INSERT/UPDATE セット。DELETE なし）。既存テーブルと同方針（USING (true)・anon 書込可）。
--   UPDATE を許しても、done への遷移は上記 CHECK＋トリガーで実在記録がなければ失敗する。
ALTER TABLE public.obligation_instances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "oi_select_authenticated" ON public.obligation_instances;
CREATE POLICY "oi_select_authenticated" ON public.obligation_instances
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "oi_insert_authenticated" ON public.obligation_instances;
CREATE POLICY "oi_insert_authenticated" ON public.obligation_instances
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "oi_update_authenticated" ON public.obligation_instances;
CREATE POLICY "oi_update_authenticated" ON public.obligation_instances
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "oi_select_anon" ON public.obligation_instances;
CREATE POLICY "oi_select_anon" ON public.obligation_instances
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "oi_insert_anon" ON public.obligation_instances;
CREATE POLICY "oi_insert_anon" ON public.obligation_instances
  FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "oi_update_anon" ON public.obligation_instances;
CREATE POLICY "oi_update_anon" ON public.obligation_instances
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ── 3) 製造業 forklift_1t の移行（manufacturing.ts workQualRules[0] と同値） ──
INSERT INTO public.obligations
  (code, version, name_ja, trigger_type, trigger_condition, deadline_basis, recurrence,
   industry_fields, trigger_scope, filing_scope, legal_basis, penalty_type, penalty_detail, valid_from)
VALUES
  ('MFG_FORKLIFT_GE1T', 1,
   'フォークリフト運転（最大荷重1t以上）',
   'qualification',
   '{"type":"qualification","work_key":"forklift_1t","requirement_type":"技能講習","required":{"qual_type":"skill_training","level":"forklift"}}',
   '従事開始日', 'continuous',
   ARRAY['manufacturing'], 'worker', 'worker',
   '労働安全衛生法61条・同施行令20条',
   'penalty', '労安衛法119条（6月以下の拘禁刑 or 50万円以下の罰金）',
   DATE '1972-10-01')
ON CONFLICT (code, version) DO NOTHING;

-- 確認クエリ
SELECT code, version, name_ja, trigger_condition, industry_fields, valid_from, valid_to FROM public.obligations;
SELECT tablename, policyname, roles, cmd FROM pg_policies
  WHERE tablename IN ('obligations','obligation_instances') ORDER BY tablename, policyname;
SELECT conname FROM pg_constraint
  WHERE conrelid = 'public.obligation_instances'::regclass AND contype = 'c' ORDER BY conname;
-- depends_on_code の参照切れ検出（0行であること）
SELECT o.code, o.depends_on_code FROM public.obligations o
 WHERE o.depends_on_code IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.obligations p WHERE p.code = o.depends_on_code);
