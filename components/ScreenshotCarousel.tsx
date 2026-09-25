"use client";

import { useState } from "react";
import Image from "next/image";
import type { App } from "@/lib/catalog";
import { isRealImageUrl } from "@/lib/image";
import Lightbox from "./Lightbox";
import styles from "./ScreenshotCarousel.module.css";

/**
 * Screenshot carousel — leaf 0.e.i.zi (App Detail Page → Media),
 * extended by leaf 0.e.i.zo to open a full-size lightbox viewer.
 *
 * Per docs/D-STORE.md §4B ("Screenshot carousel (swipeable, lightbox)").
 * The swipe track itself is still native CSS scroll-snap
 * (`overflow-x: auto` + `scroll-snap-type: x mandatory` on the track,
 * `scroll-snap-align` on each item) — nothing about that changed here.
 * What 0.e.i.zo adds is a "use client" boundary (this component was a
 * plain server component through 0.e.i.zi) so each slide can be a real
 * `<button>` that opens Lightbox.tsx (0.e.i.zo) at that slide's index;
 * the lightbox itself owns further prev/next navigation once open, so
 * this component only needs to track *whether* it's open and *which*
 * index it opened at.
 *
 * Placeholder rendering is unchanged from 0.e.i.zi: `App.screenshots`
 * (lib/mock-data.ts) holds dummy `/mock/screenshots/...` paths that
 * don't resolve to real image files — no real screenshot assets exist
 * in this repo yet (Hero.tsx, 0.d.i.zi, notes the same gap for hero
 * art). Each slide renders a colored placeholder tile using the app's
 * own primary/secondary/tertiary dummy color fields (same convention
 * as AppCard's and Hero's icon tiles), cycling across the three; the
 * lightbox reuses the same color-cycle logic so the enlarged view
 * matches what was clicked.
 *
 * `3.d.ii.zi` (Image CDN + responsive `srcset`) adds the real-image
 * branch: third-party (Aptoide) apps carry real `https://pool.img.
 * aptoide.com/...` screenshot URLs (`App.screenshots[]`, since
 * `5.h.ii.zi`) alongside first-party dummy `/mock/screenshots/...`
 * strings in the same field. `isRealImageUrl` (same guard `AppIcon`
 * uses) decides per-slide, not per-app, since nothing stops a future
 * source from mixing real and placeholder-shaped entries in one app's
 * array. A real slide renders `next/image` `fill` inside `.frame`
 * (same box as `.placeholder`, plus `position: relative; overflow:
 * hidden` to anchor/clip the image layer) instead of the colored tile;
 * a dummy/malformed slide falls through to the exact same placeholder
 * as before. The real screenshot URLs are also threaded into
 * `Lightbox` (as `screenshots`, alongside the existing `colors`) so the
 * enlarged view can make the same real/placeholder choice per slide.
 */
export default function ScreenshotCarousel({ app }: { app: App }) {
  const { screenshots } = app;
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (screenshots.length === 0) return null;

  const colors = [app.primary_color, app.secondary_color, app.tertiary_color];

  return (
    <>
      <div
        className={styles.carousel}
        role="region"
        aria-label={`${app.name} screenshots`}
      >
        <ul className={styles.track}>
          {screenshots.map((src, index) => (
            <li key={src} className={styles.slide}>
              <button
                type="button"
                className={styles.slideButton}
                onClick={() => setLightboxIndex(index)}
                aria-label={`View screenshot ${index + 1} of ${screenshots.length} full size`}
              >
                {isRealImageUrl(src) ? (
                  <div className={styles.frame}>
                    <Image
                      src={src}
                      alt={`${app.name} — Screenshot ${index + 1}`}
                      fill
                      sizes="(min-width: 768px) 260px, 62vw"
                      style={{ objectFit: "cover" }}
                    />
                  </div>
                ) : (
                  <div
                    className={styles.placeholder}
                    style={{
                      backgroundColor: colors[index % colors.length],
                      color: app.primary_color === colors[index % colors.length]
                        ? app.secondary_color
                        : app.primary_color,
                    }}
                  >
                    <span className={styles.placeholderLabel}>
                      {app.name} — Screenshot {index + 1}
                    </span>
                  </div>
                )}
              </button>
              <span className={styles.srOnly}>
                Screenshot {index + 1} of {screenshots.length}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          appName={app.name}
          primaryColor={app.primary_color}
          secondaryColor={app.secondary_color}
          screenshotCount={screenshots.length}
          colors={colors}
          screenshots={screenshots}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
