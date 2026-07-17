/**
 * デザイントークン(正本)— docs/product-direction.md 原則3「乱れず、しかし全部見せる」
 *
 * 4色の意味体系:
 *   red    = 期限超過、または回復不能な期限の切迫(在留期限 残30日以内)
 *   orange = 検証された欠缺・要対応
 *   gray   = 未蓄積・期日前・該当なし
 *   green  = 完了・検証済
 *   blue   = ブランド/アクション/情報(状態を表さない。リンク・主ボタン・情報帯)
 *
 * 赤の例外規定(2026-07-16 裁定):
 *   在留期限は超過=不法滞在で回復不能なため「超過してから赤」では警報として遅い。
 *   在留期限に限り ≤30日=赤 / 31〜60日=橙 / 61〜90日=灰。
 *   通常のタスク期日は超過のみ赤(期日前は灰、要対応と検証された欠缺は橙)。
 */

export const semantic = {
  red:    { text: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  orange: { text: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  gray:   { text: '#6b7280', bg: '#f3f4f6', border: '#e5e7eb' },
  green:  { text: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  blue:   { text: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
} as const

export const text = {
  primary:   '#111827',
  secondary: '#374151',
  muted:     '#6b7280',
  faint:     '#9ca3af',
} as const

export const surface = {
  page:   '#f9fafb',
  card:   '#ffffff',
  border: '#e5e7eb',
  inset:  '#f3f4f6',
} as const

export const radius = {
  chip:    4,
  control: 8,
  card:    12,
  pill:    9999,
} as const

export const shadow = {
  card:  '0 1px 3px rgba(0,0,0,0.06)',
  modal: '0 8px 32px rgba(0,0,0,0.18)',
} as const

/** 4pxグリッド: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 */
export const font = {
  caption:   11,
  label:     12,
  body:      13,
  bodyLg:    14,
  section:   16,
  cardTitle: 18,
  pageTitle: 21,
  statSm:    22,
  stat:      28,
} as const

/**
 * 在留期限の残日数 → 意味色(赤の例外規定を実装)
 * 超過(<0) と ≤30日 = 赤 / 31〜60日 = 橙 / それ以外 = 灰
 */
export function residenceDeadlineColor(daysLeft: number) {
  if (daysLeft <= 30) return semantic.red
  if (daysLeft <= 60) return semantic.orange
  return semantic.gray
}

/**
 * 通常タスク期日の残日数 → 意味色
 * 超過(<0) = 赤 / 期日30日以内で要対応 = 橙 / 期日前 = 灰
 */
export function taskDeadlineColor(daysLeft: number) {
  if (daysLeft < 0) return semantic.red
  if (daysLeft <= 30) return semantic.orange
  return semantic.gray
}
