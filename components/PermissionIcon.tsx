import type { PermissionGroupId } from "@/lib/permission-groups";

/**
 * A small line icon for a permission group (operator-directed 2026-10-08, slice 5 of the details page rework).
 * Inline SVG so there is no image to load and no icon library to ship; drawn on a 24 x 24 grid with
 * `currentColor`, so the chip decides the colour. Decorative: the chip's text carries the meaning, so the icon is
 * `aria-hidden`. Server component.
 */
const PATHS: Record<PermissionGroupId, React.ReactNode> = {
  camera: (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  microphone: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  location: (
    <>
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  storage: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  network: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" />
    </>
  ),
  nearby: <path d="M7 7l10 10-5 4V3l5 4L7 17" />,
  contacts: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  notifications: <path d="M6 17v-6a6 6 0 0 1 12 0v6l2 2H4zM10 21h4" />,
  install: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
  background: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  sensors: <path d="M3 12h4l2-6 4 12 2-6h6" />,
  other: (
    <>
      <circle cx="6" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="18" cy="12" r="1.2" />
    </>
  ),
};

export default function PermissionIcon({ group }: { group: PermissionGroupId }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[group]}
    </svg>
  );
}
