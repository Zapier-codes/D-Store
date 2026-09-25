import Image from "next/image";
import { isRealImageUrl } from "@/lib/image";

/**
 * AppIcon — shared icon renderer, generated placeholder by default,
 * real image when one exists.
 *
 * Originally (0.c.ii.zo) a 100% local/generated placeholder for every
 * app, since no real icon assets existed anywhere in this repo — every
 * component that needed one independently built its own flat
 * colored-initial-tile as a stand-in. This component replaced those
 * with a nicer-looking but still generated placeholder: a
 * rounded-squircle tile with a multi-stop gradient (from the app's own
 * primary/secondary/tertiary dummy colors), a subtle top-left gloss
 * highlight, and the app's initial as the glyph — deterministic per
 * app (no randomness, so it doesn't flicker between renders/
 * re-hydration).
 *
 * `5.h.ii.zi` gave third-party (Aptoide) catalog entries a real
 * `App.icon` URL (`https://pool.img.aptoide.com/...`); first-party
 * (Zealot) entries still carry a dummy filename-shaped string in the
 * same field. `3.d.ii.zi` (Image CDN + responsive `srcset`) is what
 * actually renders that real URL: an optional `src` prop — checked via
 * `isRealImageUrl` (only a real, fetchable `https://` URL counts) —
 * swaps the generated SVG for a `next/image` `fill` image, giving CDN
 * optimization and a responsive `srcset` for free from Next's image
 * pipeline. No `src`, or a dummy/placeholder-shaped one, falls through
 * to the exact same generated tile as before — this never regresses
 * to a broken `<img>` pointed at a `/mock/...` path.
 *
 * The image branch is a `position: absolute; inset: 0;` layer over the
 * same box the SVG branch fills, with `border-radius: inherit` so it
 * picks up whichever rounding the parent `.icon` container already
 * applies (AppCard/Hero/the app-detail header/AppIconLive all set
 * their own `border-radius` on that container) rather than needing a
 * second copy of that value here.
 *
 * `3.d.ii.zo` (Lighthouse LCP budget pass) adds the optional
 * `priority` prop, threaded straight to `next/image`. Every real image
 * on this app is icon-sized and rendered with Next's default
 * `loading="lazy"`, which turned out to matter: Lighthouse identified
 * an above-the-fold `AppCard` icon on the home page as the LCP
 * element, and lazy-loading it added ~1.9s of pure "element render
 * delay" (Chrome defers starting the fetch for a lazy image until it's
 * confirmed near-viewport), pushing LCP to 2.7s against the 2.5s
 * budget. `priority` (default `false`, so every other icon on the page
 * keeps lazy-loading, which is still correct for anything off-screen)
 * makes Next skip lazy-loading and mark the request `fetchpriority=
 * high`/preloaded for the handful of call sites that are actually
 * above the fold — see `Hero.tsx` and `Shelf.tsx`'s own doc comments
 * for which those are.
 */
export default function AppIcon({
  name,
  primaryColor,
  secondaryColor,
  tertiaryColor,
  className,
  src,
  sizes,
  priority,
}: {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  tertiaryColor?: string;
  className?: string;
  /** Real icon URL, e.g. `App.icon` for a third-party catalog entry. Dummy/placeholder strings are ignored. */
  src?: string;
  /** `next/image`'s `sizes` attribute — must match the container's actual rendered width for a correct `srcset` pick. Defaults to a small fixed-icon size. */
  sizes?: string;
  /** `next/image`'s `priority` — set for above-the-fold call sites only (Hero, the first shelf's leading cards). Defaults to `false` (lazy), the right choice for every off-screen icon. */
  priority?: boolean;
}) {
  if (isRealImageUrl(src)) {
    return (
      <span
        className={className}
        style={{
          position: "absolute",
          inset: 0,
          display: "block",
          overflow: "hidden",
          borderRadius: "inherit",
        }}
      >
        <Image
          src={src}
          alt={`${name} icon`}
          fill
          sizes={sizes ?? "64px"}
          priority={priority}
          style={{ objectFit: "cover" }}
        />
      </span>
    );
  }

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
