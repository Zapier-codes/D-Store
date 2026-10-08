import glass from "./glass.module.css";

/**
 * The app's first screenshot as soft backdrop art under a glass panel (operator-directed 2026-10-08; moved here
 * from the hero card so the details page header shares it). Decorative, `aria-hidden`. `src` must already be
 * safe inside a CSS `url()`: take it from `pickHeroArt` (https only, no quotes, spaces or brackets).
 * The parent is `position: relative; overflow: hidden; isolation: isolate` with its glass panel at z-index 2.
 */
export default function BackdropArt({ src }: { src: string }) {
  return <div className={glass.art} style={{ backgroundImage: `url(${JSON.stringify(src)})` }} aria-hidden="true" />;
}
