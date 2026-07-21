// components/brand/Logo.tsx
type LogoProps = {
  variant?: "light-bg" | "dark-bg"; // 放置面の背景で選ぶ
  withText?: boolean;               // 「TrustLayer」文字を出すか
  withTagline?: boolean;            // taglineを出すか(ログイン画面等のみtrue)
  size?: number;                    // markの一辺(px)
};

export function Logo({ variant = "light-bg", withText = true, withTagline = false, size = 28 }: LogoProps) {
  const bottom = variant === "dark-bg" ? "#FFFFFF" : "#1B2A4A";
  const textColor = variant === "dark-bg" ? "#FFFFFF" : "#1B2A4A";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: size * 0.32 }}>
      <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="8"  y="62" width="62" height="14" rx="7" fill={bottom} />
        <rect x="14" y="42" width="50" height="14" rx="7" fill="#D9C4A0" />
        <rect x="44" y="22" width="36" height="14" rx="7" fill="#E8833A" />
      </svg>
      {withText && (
        <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1.1 }}>
          <span style={{ color: textColor, fontWeight: 800, fontSize: size * 0.62 }}>
            Trust<span style={{ fontWeight: 400 }}>Layer</span>
          </span>
          {withTagline && (
            <span style={{ color: textColor, opacity: 0.62, fontSize: size * 0.22, letterSpacing: "0.28em", fontWeight: 500 }}>
              TRUST BEYOND BORDERS
            </span>
          )}
        </span>
      )}
    </span>
  );
}
