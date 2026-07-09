/**
 * TrustLayer ロゴマーク — 丸角ブロック（積み木）で組んだ「TL」
 * - ブロック = Layer（信頼の積み重ね）
 * - 傾き = 動き・成長中（Tの横棒は「今載せたばかり」の -3度）
 * - 金の底棒 = 信頼の土台
 * コンテナ枠なしでマーク単独で使う。
 */
export default function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label="TrustLayer" style={{ flexShrink: 0 }}>
      {/* Tの縦棒 */}
      <rect x="18" y="20" width="16" height="66" rx="8" fill="#1d4ed8" />
      {/* Tの横棒（載せたばかりの傾き） */}
      <rect x="2" y="6" width="48" height="16" rx="8" fill="#60a5fa" transform="rotate(-3 26 14)" />
      {/* Lの縦棒 */}
      <rect x="58" y="14" width="16" height="58" rx="8" fill="#1d4ed8" />
      {/* Lの底棒（信頼の土台・金） */}
      <rect x="54" y="70" width="40" height="16" rx="8" fill="#fbbf24" transform="rotate(2 74 78)" />
    </svg>
  )
}
