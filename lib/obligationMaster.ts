/**
 * 義務マスタ（obligations テーブル）の読み込み（セッションA）
 *
 * 資格型（trigger_type='qualification'）・worker 主体の義務を、既存の判定関数
 * computeQualGap が受け取る WorkQualRule 形へ変換する。判定ロジック・UI は不変。
 *
 * 適用条件:
 *   - industry_fields が当該業界を含む、または NULL（全分野共通）
 *   - valid_from <= 基準日 かつ (valid_to IS NULL OR valid_to >= 基準日)
 *   - 同一 code に有効な版が複数ある場合は version の大きい方を採用
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { IndustryCode } from '@/lib/industry/codes'
import type { WorkQualRule } from '@/lib/industry/types'

/** trigger_type='qualification' の trigger_condition 形式 */
type QualificationTrigger = {
  type: 'qualification'
  work_key: string
  requirement_type?: string
  required: { qual_type: string; level?: string | null }
}

type ObligationRow = {
  code: string
  version: number
  name_ja: string
  trigger_condition: QualificationTrigger
  legal_basis: string
  penalty_detail: string | null
  industry_fields: string[] | null
  valid_from: string          // 'YYYY-MM-DD'
  valid_to: string | null
}

/** 'YYYY-MM-DD'（ローカル日付） */
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * 業界の作業資格ルールを義務マスタから取得する。
 * 取得失敗時は throw する（空配列を返すと作業資格セクションが黙って消え、
 * 119条リスクの表示が失われるため、呼び出し側でエラーとして扱う）。
 * 空配列を返すのは「マスタは読めているが、この業界に該当ルールが無い」場合のみ。
 */
export async function loadWorkQualRules(
  supabase: SupabaseClient,
  industry: IndustryCode,
  asOf: Date = new Date(),
): Promise<WorkQualRule[]> {
  const day = ymd(asOf)
  const { data, error } = await supabase
    .from('obligations')
    .select('code, version, name_ja, trigger_condition, legal_basis, penalty_detail, industry_fields, valid_from, valid_to')
    .eq('trigger_type', 'qualification')
    .eq('trigger_scope', 'worker')
    .order('code')
    .order('version', { ascending: false })
  if (error) throw new Error(`obligations の取得に失敗: ${error.message}`)

  // 業界・有効期間はクライアント側で絞る（PostgREST の or 条件を複数重ねる曖昧さを避ける。マスタは小規模）
  const applicable = ((data ?? []) as ObligationRow[]).filter(r =>
    (r.industry_fields === null || r.industry_fields.includes(industry)) &&
    r.valid_from <= day &&
    (r.valid_to === null || r.valid_to >= day))

  const seen = new Set<string>()
  const rules: WorkQualRule[] = []
  for (const row of applicable) {
    if (seen.has(row.code)) continue   // 降順の先頭＝最新の有効版のみ採用
    seen.add(row.code)
    const tc = row.trigger_condition
    rules.push({
      work: tc.work_key,
      label: row.name_ja,
      requiredQualType: tc.required.qual_type,
      ...(tc.required.level ? { requiredLevel: tc.required.level } : {}),
      legalBasis: row.legal_basis,
      penalty: row.penalty_detail ?? '',
    })
  }

  // 空結果の区別：「この業界に該当ルールが無い」（例: 運送の現状）と「読み込めていない」を分ける。
  //   RLS 拒否やマスタ未投入では Supabase は error:null ＋ 空配列を返し throw されないため、
  //   0件のときはテーブル全体の件数を確認し、全体が0件なら読み込み失敗として throw する。
  if (rules.length === 0) {
    const { count, error: countError } = await supabase
      .from('obligations')
      .select('id', { count: 'exact', head: true })
    if (countError) throw new Error(`obligations の件数確認に失敗: ${countError.message}`)
    if (!count) throw new Error('obligations が0件です（マスタ未投入、または読取権限がありません）')
  }
  return rules
}
