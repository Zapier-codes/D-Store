import glass from "./glass.module.css";

/**
 * Two purely decorative layers, both `aria-hidden`. Each must sit inside a `position: relative` parent.
 *
 * - `IconRing`: the live arc that circles an app icon (parent is the icon's wrapper; the ring sits 7px outside it).
 * - `Rim`: the thin accent line on a card's border that follows the pointer (parent is the card; it takes the
 *   card's `border-radius`, and shows only under a mouse via `Tilt`).
 */
export function IconRing() {
  return <div className={glass.ring} aria-hidden="true" />;
}

export function Rim() {
  return <div className={glass.rim} aria-hidden="true" />;
}
