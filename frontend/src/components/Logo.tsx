interface LogoProps {
  className?: string;
  tagline?: boolean;
  /** "dark" wordmark for light backgrounds (default), "light" wordmark for dark backgrounds like the sidebar. */
  variant?: "dark" | "light";
}

// Pure wordmark, no icon mark — "X Bank" styled as a single gradient serif
// lockup so the brand name is never repeated as plain text next to it.
export function Logo({ className, tagline = false, variant = "dark" }: LogoProps) {
  const viewBoxHeight = tagline ? 62 : 40;
  const gradientStops =
    variant === "light"
      ? [
          { offset: "0%", color: "#5fd4c4" },
          { offset: "100%", color: "#ffffff" },
        ]
      : [
          { offset: "0%", color: "#1f6f6b" },
          { offset: "100%", color: "#14335c" },
        ];
  const taglineFill = variant === "light" ? "#a8c0d8" : "#5b7a9a";

  return (
    <svg viewBox={`0 0 210 ${viewBoxHeight}`} className={className} role="img" aria-label="X Bank">
      <defs>
        <linearGradient id={`xbank-wordmark-${variant}`} x1="0" y1="0" x2="1" y2="0">
          {gradientStops.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
      </defs>
      <text
        x="105"
        y="30"
        textAnchor="middle"
        fontFamily='"Source Serif 4", Georgia, serif'
        fontWeight="700"
        fontSize="34"
        letterSpacing="0.5"
        fill={`url(#xbank-wordmark-${variant})`}
      >
        X Bank
      </text>
      {tagline && (
        <text x="105" y="52" textAnchor="middle" fontFamily='"IBM Plex Sans", system-ui, sans-serif' fontWeight="500" fontSize="10.5" letterSpacing="2" fill={taglineFill}>
          YOUR TRUSTED DIGITAL BANK
        </text>
      )}
    </svg>
  );
}
