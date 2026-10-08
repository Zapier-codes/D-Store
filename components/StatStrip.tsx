import type { App } from "@/lib/catalog";
import { statTilesFor, type StatTile } from "@/lib/app-facts";
import { StarMeter } from "./glass";
import CountUp from "./CountUp";
import styles from "./StatStrip.module.css";

/**
 * The details page's stat strip: operator-directed 2026-10-08, slice 2 of the rework in
 * docs/DETAIL-PAGE-REWORK-PROMPT.md (section 5B) and docs/DETAIL-PAGE-DESIGN.md (section 3). It replaces the old
 * plain-text stats row and the size / version / Android pills of the header.
 *
 * One glass panel (the shared layer's) holding a horizontally scrollable, snap-aligned row of tiles separated
 * by hairlines: Downloads (the big counter), Rating (number, fractional star meter, count), Age rating, Size,
 * Version with its updated month, and the Android requirement. Which tiles exist, and what they say, is decided
 * by `statTilesFor` (lib/app-facts.ts): a tile is drawn only when the source provided its value, first-party
 * figures come from lib/carried-over-stats.ts, third-party ones from `reportedStatsFor`, with no source label.
 *
 * Server component. The only client piece is `CountUp`, which the server renders with the FINAL text, so the
 * strip is correct without JavaScript and for screen readers; the counter runs once when it scrolls into view
 * and reduced motion skips it. The scroller is a labelled, focusable region so a keyboard user can scroll it.
 */
export default function StatStrip({ app }: { app: App }) {
  const tiles = statTilesFor(app);
  if (tiles.length === 0) return null;

  return (
    <div className={styles.strip}>
      <div className={styles.scroller} role="region" aria-label="App facts" tabIndex={0}>
        <ul className={styles.list}>
          {tiles.map((tile) => (
            <li key={tile.id} className={styles.tile}>
              <Figure tile={tile} />
              {tile.rating && <StarMeter average={tile.rating.average} className={styles.stars} />}
              <span className={styles.label}>{tile.label}</span>
              {tile.note && <span className={styles.note}>{tile.note}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The big figure of a tile: the counter, or the final text. Wordy figures (an age band, a version) are set smaller. */
function Figure({ tile }: { tile: StatTile }) {
  const classes = [styles.value];
  if (tile.rating) classes.push(styles.valueAccent);
  if (tile.id === "age" || tile.id === "version" || tile.value.length > 8) classes.push(styles.valueSmall);
  return (
    <span className={classes.join(" ")}>
      {tile.counter ? (
        <CountUp target={tile.counter.target} variant={tile.counter.variant} suffix={tile.counter.suffix} />
      ) : (
        tile.value
      )}
    </span>
  );
}
