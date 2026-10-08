/**
 * Theme — follows the visitor's device (operator-directed, 2026-10-08).
 *
 * The store no longer has a theme button or a theme cookie. Light or dark is whatever the device's
 * system setting says (`prefers-color-scheme`), and it changes live when the device setting changes.
 *
 * How: `app/layout.tsx` puts a tiny inline script in `<head>` (`THEME_SCRIPT` below) that runs before
 * the first paint, sets `data-theme` on `<html>` from `matchMedia("(prefers-color-scheme: dark)")`,
 * and listens for the device changing it. Every stylesheet keeps keying off `html[data-theme]`, so
 * nothing else had to change. The server renders `DEFAULT_THEME` into the HTML as the no-JavaScript
 * fallback, and the script replaces it before anything is painted, so a visitor never sees a flash of
 * the wrong theme.
 *
 * What the server therefore does NOT know is the visitor's theme. Anything that used to vary by it now
 * carries both modes and lets the browser pick: the category skins (`CategoryThemeScope`) emit a dark
 * and a light rule keyed on `[data-theme]`, the browser-chrome colour is a pair of `theme-color` tags
 * with `prefers-color-scheme` media, and the iOS splash images are listed per scheme.
 */

export type Theme = "dark" | "light";

// The server-rendered fallback for a visitor whose browser runs no JavaScript (the script below does the
// real work). "dark" matches the store's original look.
export const DEFAULT_THEME: Theme = "dark";

export function isTheme(value: string | undefined): value is Theme {
  return value === "dark" || value === "light";
}

/**
 * Inline `<head>` script: sets `data-theme` from the device before first paint and keeps it in step.
 * Plain ES5, wrapped in try/catch so a browser without `matchMedia` just keeps the server's fallback.
 */
export const THEME_SCRIPT = `(function(){try{var q=window.matchMedia("(prefers-color-scheme: dark)");var r=document.documentElement;var s=function(){r.setAttribute("data-theme",q.matches?"dark":"light")};s();if(q.addEventListener){q.addEventListener("change",s)}else if(q.addListener){q.addListener(s)}}catch(e){}})();`;
