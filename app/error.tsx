"use client";

import { useEffect } from "react";
import EmptyState from "@/components/EmptyState";
import emptyStateStyles from "@/components/EmptyState.module.css";

/**
 * Global error boundary — leaf 3.a.iii.zo. Next.js requires `error.tsx`
 * to be a Client Component (it's the only special file that does) since
 * it needs to catch render-time errors from the client bundle and
 * receives a client-only `reset()` callback to attempt re-rendering the
 * segment — that's the one interactive piece this leaf's design needs,
 * everything else (`EmptyState` itself, `not-found.tsx`) stays a plain
 * server component.
 *
 * `console.error`s the caught error the way Next's own docs recommend
 * for this file, so it still reaches server/deploy logs (e.g. Vercel's)
 * even though nothing here talks to a real error-reporting backend yet
 * — that's a Phase 5 concern, not a Phase 3 dummy-UI one.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main>
      <EmptyState
        kind="error"
        heading="Something went wrong"
        message="An unexpected error occurred while loading this page."
        action={
          <button type="button" className={emptyStateStyles.action} onClick={reset}>
            Try again
          </button>
        }
      />
    </main>
  );
}
