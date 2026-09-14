"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { searchAppsAction } from "@/lib/search-actions";
import type { App } from "@/lib/catalog";
import styles from "./SearchBar.module.css";

const DEBOUNCE_MS = 200;

/**
 * Instant search suggestions — leaf 0.g.i.zi (Search & Category
 * Browse → Search), replacing the plain `<input>` that used to live
 * directly in Header.tsx (0.c.i.zi).
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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<App[]>([]);
  const [open, setOpen] = useState(false);
  const requestId = useRef(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setOpen(false);
      return;
    }

    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      const matches = await searchAppsAction(trimmed);
      // Ignore stale responses from a superseded keystroke.
      if (id === requestId.current) {
        setResults(matches.slice(0, 6));
        setOpen(true);
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

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <form action="/search" method="GET" role="search" className={styles.form}>
        <input
          type="search"
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => query.trim() && setOpen(true)}
          placeholder="Search apps"
          aria-label="Search apps"
          autoComplete="off"
          className={styles.searchInput}
        />
      </form>

      {open && results.length > 0 && (
        <ul className={styles.suggestions} role="listbox">
          {results.map((app) => (
            <li key={app.slug} role="option" aria-selected="false">
              <Link
                href={`/app/${app.slug}`}
                className={styles.suggestion}
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
