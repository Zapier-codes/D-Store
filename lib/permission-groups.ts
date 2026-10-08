/**
 * Plain-language permission groups for the details page (operator-directed 2026-10-08, slice 5 of the rework in
 * docs/DETAIL-PAGE-REWORK-PROMPT.md, section 5F). Pure: no I/O, no React; `PermissionsDisclosure` only draws what
 * `groupPermissions` returns.
 *
 * `App.permissions` is a list of raw Android manifest names (`INTERNET`, `android.permission.CAMERA`,
 * `com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE`). A visitor reads "Camera" and
 * "Network" faster than those, so the names are sorted into a few groups, always in the same order. Nothing is
 * hidden: a name this file does not recognise lands in `other` (it is never dropped and never guessed into a
 * group it does not belong to), and every group keeps its raw names so the page can still list them.
 *
 * Matching is on the part after the last dot, upper-cased, so `android.permission.CAMERA` and a bare `CAMERA`
 * agree. Only well-known Android names are matched, by exact name or by a clear prefix.
 */

export type PermissionGroupId =
  | "camera"
  | "microphone"
  | "location"
  | "storage"
  | "network"
  | "nearby"
  | "contacts"
  | "calendar"
  | "phone"
  | "notifications"
  | "install"
  | "background"
  | "sensors"
  | "other";

export interface PermissionGroup {
  id: PermissionGroupId;
  /** Plain-language label shown on the chip. */
  label: string;
  /** The raw names in this group, in the order the source gave them, without duplicates. */
  items: string[];
}

/** Display order and labels. `other` is last on purpose. */
export const PERMISSION_GROUP_ORDER: ReadonlyArray<{ id: PermissionGroupId; label: string }> = [
  { id: "camera", label: "Camera" },
  { id: "microphone", label: "Microphone" },
  { id: "location", label: "Location" },
  { id: "storage", label: "Files and media" },
  { id: "network", label: "Network" },
  { id: "nearby", label: "Nearby devices" },
  { id: "contacts", label: "Contacts and accounts" },
  { id: "calendar", label: "Calendar" },
  { id: "phone", label: "Phone and messages" },
  { id: "notifications", label: "Notifications" },
  { id: "install", label: "Install apps" },
  { id: "background", label: "Runs in background" },
  { id: "sensors", label: "Body and motion sensors" },
  { id: "other", label: "Other" },
];

/** The part after the last dot, trimmed and upper-cased; `""` for anything that is not a usable name. */
export function shortPermissionName(raw: string): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";
  const dot = trimmed.lastIndexOf(".");
  return (dot >= 0 ? trimmed.slice(dot + 1) : trimmed).toUpperCase();
}

const EXACT: Record<string, PermissionGroupId> = {
  CAMERA: "camera",
  RECORD_AUDIO: "microphone",
  CAPTURE_AUDIO_OUTPUT: "microphone",
  MODIFY_AUDIO_SETTINGS: "microphone",
  ACCESS_FINE_LOCATION: "location",
  ACCESS_COARSE_LOCATION: "location",
  ACCESS_BACKGROUND_LOCATION: "location",
  ACCESS_MEDIA_LOCATION: "location",
  READ_EXTERNAL_STORAGE: "storage",
  WRITE_EXTERNAL_STORAGE: "storage",
  MANAGE_EXTERNAL_STORAGE: "storage",
  INTERNET: "network",
  ACCESS_NETWORK_STATE: "network",
  ACCESS_WIFI_STATE: "network",
  CHANGE_WIFI_STATE: "network",
  CHANGE_NETWORK_STATE: "network",
  CHANGE_WIFI_MULTICAST_STATE: "network",
  NFC: "nearby",
  NEARBY_WIFI_DEVICES: "nearby",
  UWB_RANGING: "nearby",
  READ_CONTACTS: "contacts",
  WRITE_CONTACTS: "contacts",
  GET_ACCOUNTS: "contacts",
  READ_CALENDAR: "calendar",
  WRITE_CALENDAR: "calendar",
  READ_PHONE_STATE: "phone",
  READ_PHONE_NUMBERS: "phone",
  CALL_PHONE: "phone",
  ANSWER_PHONE_CALLS: "phone",
  READ_CALL_LOG: "phone",
  WRITE_CALL_LOG: "phone",
  SEND_SMS: "phone",
  READ_SMS: "phone",
  RECEIVE_SMS: "phone",
  RECEIVE_MMS: "phone",
  RECEIVE_WAP_PUSH: "phone",
  POST_NOTIFICATIONS: "notifications",
  REQUEST_INSTALL_PACKAGES: "install",
  REQUEST_DELETE_PACKAGES: "install",
  INSTALL_PACKAGES: "install",
  WAKE_LOCK: "background",
  RECEIVE_BOOT_COMPLETED: "background",
  REQUEST_IGNORE_BATTERY_OPTIMIZATIONS: "background",
  SCHEDULE_EXACT_ALARM: "background",
  USE_EXACT_ALARM: "background",
  BODY_SENSORS: "sensors",
  BODY_SENSORS_BACKGROUND: "sensors",
  ACTIVITY_RECOGNITION: "sensors",
  HIGH_SAMPLING_RATE_SENSORS: "sensors",
};

/** Clear prefixes for families of names (`READ_MEDIA_IMAGES`, `BLUETOOTH_CONNECT`, `FOREGROUND_SERVICE_*`). */
const PREFIXES: ReadonlyArray<[string, PermissionGroupId]> = [
  ["READ_MEDIA_", "storage"],
  ["BLUETOOTH", "nearby"],
  ["FOREGROUND_SERVICE", "background"],
];

/** The group one raw name belongs to; `other` when it is not a well-known Android name. */
export function permissionGroupOf(raw: string): PermissionGroupId {
  const name = shortPermissionName(raw);
  if (name.length === 0) return "other";
  const exact = EXACT[name];
  if (exact) return exact;
  for (const [prefix, id] of PREFIXES) {
    if (name.startsWith(prefix)) return id;
  }
  return "other";
}

/**
 * The groups a list of raw permission names falls into, in the fixed display order, each with its raw names.
 * Empty and non-string entries are skipped, duplicates are listed once, and a group with no names is left out,
 * so an empty list gives an empty array (the caller says "requests no special permissions" itself).
 */
export function groupPermissions(permissions: ReadonlyArray<string> | null | undefined): PermissionGroup[] {
  if (!permissions) return [];
  const byId = new Map<PermissionGroupId, string[]>();
  const seen = new Set<string>();
  for (const raw of permissions) {
    if (typeof raw !== "string") continue;
    const name = raw.trim();
    if (name.length === 0 || seen.has(name)) continue;
    seen.add(name);
    const id = permissionGroupOf(name);
    const list = byId.get(id);
    if (list) list.push(name);
    else byId.set(id, [name]);
  }
  const groups: PermissionGroup[] = [];
  for (const { id, label } of PERMISSION_GROUP_ORDER) {
    const items = byId.get(id);
    if (items && items.length > 0) groups.push({ id, label, items });
  }
  return groups;
}
