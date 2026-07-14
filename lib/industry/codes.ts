/**
 * 業界コード（柱4: 共通エンジン + 業界設定パッケージ）
 *
 * employment_conditions.industry_field は自由テキストのため、正規コードへ
 * 読み取り時マッピングで吸収する（段A: DB migration ゼロ）。
 * 段Bで industry_code カラム化 + backfill 予定。
 */

/** 業界コード（将来14分野へ拡張。デモは運送・製造の2つ） */
export type IndustryCode = 'transport' | 'manufacturing'

/** employment_conditions.industry_field（自由テキスト）→ コード */
const FREE_TEXT_MAP: Record<string, IndustryCode> = {
  '自動車運送業': 'transport',
  '工業製品製造業': 'manufacturing',
}

/** 自由テキストの業界分野を正規コードへ解決する。未対応・未設定は null */
export function resolveIndustry(industryField: string | null | undefined): IndustryCode | null {
  if (!industryField) return null
  return FREE_TEXT_MAP[industryField.trim()] ?? null
}
