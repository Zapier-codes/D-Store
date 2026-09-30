#!/usr/bin/env bash
#
# Aptoide endpoint discovery probe — leaf `5.h.vi.zi`.
#
# Finds out which of Aptoide's browse / top-charts / category / version
# endpoints really exist and what they return, so nothing is built against a
# guessed path. Run it from your own device (Termux) — the session sandbox is
# blocked from Aptoide (`host_not_allowed`).
#
#   cd ~/D-Store
#   bash scripts/probe-aptoide.sh
#
# What it does: read-only HTTP GETs with curl, nothing else. At most
# PROBE_MAX requests (default 70), one every PROBE_DELAY seconds (default 1),
# an honest User-Agent, no login, no cookies, no APK downloads, response bodies
# capped at 3 MB. It follows links it finds in Aptoide's own store-widget
# responses, but only links on the same host and API root it started from.
#
# It writes two files (never into the repo), and prints their paths:
#   aptoide-probe-summary-<time>.txt  one line per request: status, size, type, path
#   aptoide-probe-report-<time>.txt   the same plus the shape of each JSON answer
#                                     and the first 500 characters of each body
# Output goes to ~/storage/downloads if it exists (run `termux-setup-storage`
# once to create it), else to $HOME. Override with PROBE_OUT=/some/dir.
#
# Needs: bash and curl (`pkg install curl`). python3 is optional — with it the
# report also lists each JSON answer's keys, list length and paging fields.
#
# Environment knobs (all optional):
#   PROBE_OUT    output directory
#   PROBE_MAX    request cap (default 70)
#   PROBE_DELAY  seconds between requests (default 1)
#   PROBE_NO_GEO=1  do not look up this device's country via ipapi.co
#   PROBE_BASE   API root to probe (default https://ws75.aptoide.com/api/7);
#                exists so the script can be tested against a local fake
#
# What this does NOT settle: Aptoide's terms for re-presenting its catalog
# (HANDOVER.md, Section 0, open question 2) — reading `robots.txt` below is
# information only, not permission. And the catalog can differ by country, so
# the report records the country this run saw.

set -u

BASE="${PROBE_BASE:-https://ws75.aptoide.com/api/7}"
UA="D-Store-endpoint-probe/1.0 (+https://github.com/Zapier-codes/D-Store; read-only discovery)"
MAX_REQUESTS="${PROBE_MAX:-70}"
DELAY="${PROBE_DELAY:-1}"

command -v curl >/dev/null 2>&1 || { echo "curl is not installed. Run: pkg install curl" >&2; exit 1; }

OUTDIR="${PROBE_OUT:-}"
if [ -z "$OUTDIR" ]; then
  if [ -d "$HOME/storage/downloads" ]; then OUTDIR="$HOME/storage/downloads"; else OUTDIR="$HOME"; fi
fi
mkdir -p "$OUTDIR" 2>/dev/null || { echo "Cannot write to $OUTDIR" >&2; exit 1; }

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT="$OUTDIR/aptoide-probe-report-$STAMP.txt"
SUMMARY="$OUTDIR/aptoide-probe-summary-$STAMP.txt"
WORK="$(mktemp -d 2>/dev/null || echo "$HOME/.aptoide-probe-$$")"
mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT

HAVE_PY=0
command -v python3 >/dev/null 2>&1 && HAVE_PY=1

count=0
BLOCKED=0

# Prints the shape of a JSON body: top-level keys, and for a `datalist`
# (Aptoide's paged list envelope) its total/offset/next/limit fields, the list
# length and the first item's keys, name and package.
shape() {
  [ "$HAVE_PY" = 1 ] || { echo "(python3 not installed: no JSON shape; pkg install python for it)"; return; }
  python3 - "$1" <<'PY' 2>/dev/null || echo "(not JSON, or unreadable)"
import json, sys
try:
    d = json.load(open(sys.argv[1], encoding="utf-8", errors="replace"))
except Exception:
    print("(not JSON)"); raise SystemExit
def keys(x): return sorted(x.keys())[:25] if isinstance(x, dict) else type(x).__name__
print("top-level:", keys(d))
if isinstance(d, dict):
    if "info" in d and isinstance(d["info"], dict): print("info:", {k: d["info"][k] for k in list(d["info"])[:6]})
    if "errors" in d: print("errors:", str(d["errors"])[:300])
    dl = d.get("datalist")
    if isinstance(dl, dict):
        print("datalist keys:", keys(dl))
        for k in ("total", "count", "offset", "limit", "next", "hidden", "max_age"):
            if k in dl: print(f"datalist.{k}:", str(dl[k])[:120])
        lst = dl.get("list")
        if isinstance(lst, list):
            print("datalist.list length:", len(lst))
            if lst and isinstance(lst[0], dict):
                f = lst[0]
                print("first item keys:", keys(f))
                print("first item name/package:", f.get("name"), "/", f.get("package"))
    nodes = d.get("nodes")
    if isinstance(nodes, dict):
        print("nodes:", keys(nodes))
        for n, v in nodes.items():
            if isinstance(v, dict): print(f"nodes.{n} keys:", keys(v))
PY
}

# probe <label> <full-url>
probe() {
  local label="$1" url="$2" safe out code size final ctype hdr body
  if [ "$count" -ge "$MAX_REQUESTS" ]; then
    printf 'SKIPPED (request cap %s)  %s  %s\n' "$MAX_REQUESTS" "$label" "$url" >> "$SUMMARY"
    return
  fi
  if [ "$BLOCKED" -ge 3 ]; then
    printf 'SKIPPED (3 blocked answers in a row, stopped)  %s  %s\n' "$label" "$url" >> "$SUMMARY"
    return
  fi
  count=$((count + 1))
  safe="$(printf '%s' "$label" | tr -c 'A-Za-z0-9_.-' '_')-$count"
  hdr="$WORK/$safe.hdr"; body="$WORK/$safe.body"
  out="$(curl -sS -m 25 -L --max-redirs 3 --max-filesize 3000000 -A "$UA" -H 'Accept: application/json' \
        -D "$hdr" -o "$body" -w '%{http_code} %{size_download} %{url_effective} %{content_type}' "$url" 2>"$WORK/$safe.err")" || true
  code=""; size=""; final=""; ctype=""
  read -r code size final ctype <<<"$out"
  [ -n "$code" ] || code="000"
  [ -f "$body" ] || : > "$body"

  case "$code" in 403|429) BLOCKED=$((BLOCKED + 1)) ;; *) BLOCKED=0 ;; esac

  printf '%s  %8s bytes  %-28s  [%s]  %s\n' "$code" "${size:-0}" "${ctype:-n/a}" "$label" "${url#"$BASE"/}" | tee -a "$SUMMARY"

  {
    echo "================================================================"
    echo "[$label]"
    echo "GET $url"
    [ "$final" != "$url" ] && [ -n "$final" ] && echo "final URL: $final"
    echo "HTTP $code   size ${size:-0} bytes   type ${ctype:-n/a}"
    [ -s "$WORK/$safe.err" ] && echo "curl said: $(head -c 300 "$WORK/$safe.err" | tr '\n' ' ')"
    grep -iE '^(retry-after|x-ratelimit[^:]*|cache-control|age|server):' "$hdr" 2>/dev/null | tr -d '\r' | sed 's/^/header: /'
    case "$ctype" in *json*) shape "$body" ;; esac
    echo "--- first 500 characters:"
    head -c 500 "$body" | tr -c '[:print:]' ' '
    echo
  } >> "$REPORT"

  sleep "$DELAY"
}

: > "$SUMMARY"
: > "$REPORT"

{
  echo "Aptoide endpoint probe (leaf 5.h.vi.zi)"
  echo "time (UTC): $STAMP"
  echo "API root:   $BASE"
  echo "curl:       $(curl --version | head -n1)"
  echo "python3:    $([ "$HAVE_PY" = 1 ] && python3 --version 2>&1 || echo 'not installed')"
  if [ "${PROBE_NO_GEO:-0}" = 1 ]; then
    echo "country:    (skipped, PROBE_NO_GEO=1)"
  else
    echo "country:    $(curl -sS -m 8 -A "$UA" https://ipapi.co/country/ 2>/dev/null | head -c 8 | tr -c '[:print:]' ' ') (as reported by ipapi.co; the catalog can differ by country)"
  fi
  echo "request cap $MAX_REQUESTS, delay ${DELAY}s"
  echo
  echo "Column key: HTTP status, bytes, content type, [label], path under the API root."
  echo "Labels: control-ok = worked in the ingest script's own probe; control-404 = known 404 per HANDOVER.md"
  echo "(both check the probe reads answers correctly); candidate = a path guessed from Aptoide's public"
  echo "webservice naming, UNVERIFIED, expected to fail often; discovered = a link found in an earlier answer."
  echo
} | tee -a "$SUMMARY" "$REPORT"

# --- Controls -----------------------------------------------------------------
probe control-ok   "$BASE/app/getMeta/package_name=com.whatsapp"
probe control-ok   "$BASE/apps/search/query=password%20manager/limit=3"
probe control-404  "$BASE/apps/list/limit=5"
probe control-404  "$BASE/app/versions/package_name=com.whatsapp"

# --- Candidates: store widgets (how Aptoide's own clients discover browse views) --
probe candidate "$BASE/getStoreWidgets"
probe candidate "$BASE/getStoreWidgets/store_name=apps"
probe candidate "$BASE/getStoreWidgets/store_name=apps/context=home"
probe candidate "$BASE/getStoreWidgets/store_id=15"
probe candidate "$BASE/getStore/store_name=apps"
probe candidate "$BASE/getStoreMeta/store_name=apps"

# --- Candidates: lists, top charts, categories ----------------------------------
probe candidate "$BASE/listApps/limit=10"
probe candidate "$BASE/listApps/sort=downloads/limit=10"
probe candidate "$BASE/listApps/store_name=apps/limit=10"
probe candidate "$BASE/listStoreApps/store_name=apps/limit=10"
probe candidate "$BASE/listStoreApps/store_id=15/limit=10"
probe candidate "$BASE/listStores/limit=5"
probe candidate "$BASE/apps/get/limit=10"
probe candidate "$BASE/apps/getRecommended/limit=10"
probe candidate "$BASE/listCategories"
probe candidate "$BASE/categories/get"
probe candidate "$BASE/listStoreGroups/store_name=apps"
probe candidate "$BASE/listSearchApps/query=browser/limit=5"

# --- Candidates: versions and reviews (for the version-history leaf) -----------
probe candidate "$BASE/listAppVersions/package_name=com.whatsapp/limit=5"
probe candidate "$BASE/app/getVersions/package_name=com.whatsapp"
probe candidate "$BASE/listFullReviews/package_name=com.whatsapp/limit=3"

# --- Information only: robots.txt (NOT permission, see the header) --------------
ROOT="${BASE%%/api/*}"
probe robots "$ROOT/robots.txt"

# --- Follow links Aptoide's own answers point at (same API root only) -------------
: > "$WORK/links.raw"
for f in "$WORK"/*.body; do
  [ -s "$f" ] || continue
  sed 's#\\/#/#g' "$f" | grep -oE 'https?://[^"\\ ]+/api/7/[^"\\ ]+' >> "$WORK/links.raw" 2>/dev/null || true
done
sort -u "$WORK/links.raw" > "$WORK/links.uniq"
awk -v b="$BASE/" 'index($0,b)==1' "$WORK/links.uniq" | grep -v 'package_name=' | head -n 30 > "$WORK/links.follow"
awk -v b="$BASE/" 'index($0,b)!=1' "$WORK/links.uniq" | head -n 15 > "$WORK/links.foreign"

{
  echo
  echo "================================================================"
  echo "Links found inside Aptoide's answers: $(wc -l < "$WORK/links.uniq" | tr -d ' ') distinct;"
  echo "following up to 30 on the same API root (skipping per-app links), listing others without fetching them."
  if [ -s "$WORK/links.foreign" ]; then echo "Seen but NOT followed (other host or root):"; sed 's/^/  /' "$WORK/links.foreign"; fi
} | tee -a "$SUMMARY" "$REPORT"

while IFS= read -r link; do
  [ -n "$link" ] && probe discovered "$link"
done < "$WORK/links.follow"

{
  echo
  echo "Done: $count request(s). Please send BOTH files back to the next session:"
  echo "  $SUMMARY"
  echo "  $REPORT"
} | tee -a "$SUMMARY" "$REPORT"
