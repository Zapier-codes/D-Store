/**
 * AppIcon — shared dummy icon renderer.
 *
 * No real icon/screenshot assets exist anywhere in this repo (every
 * component that needed one — AppCard, Hero, CategoryCard,
 * SponsoredCard, the app-detail header — independently built its own
 * flat colored-initial-tile as a stand-in, all clearly documented as
 * placeholders in their own comments). This component replaces that
 * flat tile with a nicer-looking but still 100% local/generated
 * placeholder: a rounded-squircle tile with a multi-stop gradient
 * (from the app's own primary/secondary/tertiary dummy colors), a
 * subtle top-left gloss highlight, and the app's initial as the glyph
 * — same underlying data, deterministic per app (no randomness, so it
 * doesn't flicker between renders/re-hydration), just livelier than a
 * flat single-color fill. Still not a real icon asset — swapping in
 * real <img> icons later only touches this one file.
 *
 * Pure presentational SVG, no network request, so it renders instantly
 * and never 404s, unlike pointing <img> at a mock `/mock/...` path.
 */
export default function AppIcon({
  name,
  primaryColor,
  secondaryColor,
  tertiaryColor,
  className,
}: {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  tertiaryColor?: string;
  className?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  // Deterministic id suffix from the name so multiple icons on one page
  // don't collide on the same gradient/clip <id>.
  const uid = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  const gradId = `ai-grad-${uid}`;
  const glossId = `ai-gloss-${uid}`;

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={`${name} icon`}
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={primaryColor} />
          <stop offset="55%" stopColor={secondaryColor} />
          <stop offset="100%" stopColor={tertiaryColor ?? primaryColor} />
        </linearGradient>
        <radialGradient id={glossId} cx="30%" cy="22%" r="65%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" rx="22" fill={`url(#${gradId})`} />
      <rect x="0" y="0" width="100" height="100" rx="22" fill={`url(#${glossId})`} />
      <text
        x="50%"
        y="54%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="46"
        fontWeight="700"
        fill={secondaryColor}
        style={{ mixBlendMode: "overlay", opacity: 0.9 }}
      >
        {initial}
      </text>
      <text
        x="50%"
        y="53%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="46"
        fontWeight="700"
        fill="#ffffff"
        fillOpacity="0.92"
      >
        {initial}
      </text>
    </svg>
  );
}
