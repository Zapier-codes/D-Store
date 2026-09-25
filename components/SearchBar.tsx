"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { searchAppsAction } from "@/lib/search-actions";
import type { App } from "@/lib/catalog";
import styles from "./SearchBar.module.css";

const DEBOUNCE_MS = 200;

/**
 * Instant search suggestions — leaf 0.g.i.zi (Search & Category
 * Browse → Search), replacing the plain `<input>` that used to live
 * directly in Header.tsx (0.c.i.zi). Keyboard pattern (aria-expanded/
 * aria-controls/aria-activedescendant, arrow-key highlight, Enter to
 * go, Escape to close) added as a follow-up to leaf `3.d.i.zo`
 * (HANDOVER.md) — that leaf's sitewide keyboard-nav audit didn't
 * reach this component at all (its Done note lists the gaps it found
 * elsewhere; this one wasn't among them). Before this, the dropdown
 * declared `role="listbox"`/`role="option"` (screen readers would
 * announce it as a listbox) but had no keyboard behavior backing that
 * role at all: no way to reach an option except Tab-ing through each
 * suggestion link individually, and nothing told a screen reader the
 * input and the listbox were related. Focus deliberately stays on the
 * `<input>` throughout, per the ARIA APG's combobox pattern —
 * `aria-activedescendant` is what tells assistive tech which option is
 * "focused" without literally moving DOM focus off the text field.
 *
 * Still a real `<form action="/search" method="GET">` underneath —
 * pressing Enter or clicking Search with JS disabled still works
 * exactly as it did before this leaf, landing on `/search?q=...`
 * (0.g.i.zo, next leaf, not built yet — this form still 404s until
 * then, same forward-reference the header already used). The dropdown
 * is a progressive enhancement layered on top via a client boundary,
 * not a replacement for the no-JS path.
 *
 * Debounced (200ms, matching lib/catalog.ts's own
 * `SIMULATED_LATENCY_MS`) rather than firing on every keystroke, and
 * results are capped to 6 so the dropdown never dwarfs the header.
 * Calls `searchAppsAction` (lib/search-actions.ts) — a server action,
 * not a route handler — since that's the same pattern the codebase
 * already uses for the header's other interactive piece (ThemeToggle
 * → theme-actions.ts).
 */
export default function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<App[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const requestId = useRef(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      const matches = await searchAppsAction(trimmed);
      // Ignore stale responses from a superseded keystroke.
      if (id === requestId.current) {
        setResults(matches.slice(0, 6));
        setOpen(true);
        setActiveIndex(-1);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + results.length) % results.length);
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      // A real suggestion is highlighted — go there instead of
      // submitting the underlying <form> to /search.
      event.preventDefault();
      setOpen(false);
      router.push(`/app/${results[activeIndex].slug}`);
    }
  }

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <form action="/search" method="GET" role="search" className={styles.form}>
        <input
          type="search"
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => query.trim() && results.length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search apps"
          aria-label="Search apps"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="search-suggestions"
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `search-suggestion-${activeIndex}` : undefined}
          className={styles.searchInput}
        />
      </form>

      {open && results.length > 0 && (
        <ul id="search-suggestions" className={styles.suggestions} role="listbox">
          {results.map((app, index) => (
            <li
              key={app.slug}
              id={`search-suggestion-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              data-active={index === activeIndex || undefined}
            >
              <Link
                href={`/app/${app.slug}`}
                className={styles.suggestion}
                tabIndex={-1}
                onClick={() => setOpen(false)}
              >
                <span
                  className={styles.icon}
                  style={{ backgroundColor: app.primary_color, color: app.secondary_color }}
                  aria-hidden="true"
                >
                  {app.name.trim().charAt(0).toUpperCase()}
                </span>
                <span className={styles.name}>{app.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
