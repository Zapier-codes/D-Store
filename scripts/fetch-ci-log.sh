#!/usr/bin/env bash
# fetch-ci-log.sh: fetch a failure log and save it where the operator uploads it from.
#
# Standing rule (HANDOVER.md, Section 0, "CI and deploy debugging"): when a CI run or a deploy
# fails, its log is saved under ~/storage/downloads and the operator uploads that one file.
#
#   bash scripts/fetch-ci-log.sh gh <owner/repo> [run-id]          GitHub Actions; latest failed run if no id
#   bash scripts/fetch-ci-log.sh render <service-id> [deploy-id]   Render; latest failed deploy if no id
#
# Run it in Termux, not inside Ubuntu. "gh" needs the GitHub CLI logged in (gh auth status).
# "render" needs curl, jq and RENDER_API_KEY. Its API calls were written from memory and have never
# been run: every call prints its HTTP status (also written into the log), so a wrong route shows
# as a non-200 line instead of an empty file.
# Bearer tokens and zpa_ / rnd_ strings are replaced by [redacted]; still skim the file before uploading.
# Written, NOT run (no-testing instruction).
set -u

OUT="${CI_LOG_DIR:-$HOME/storage/downloads}"
mode="${1:-}"

redact() {
  sed -E 's/(Bearer )[A-Za-z0-9._~+=-]+/\1[redacted]/g; s/(zpa_|rnd_)[A-Za-z0-9]+/\1[redacted]/g'
}

finish() {
  echo "saved: $1 ($(wc -c < "$1" | tr -d ' ') bytes, $(wc -l < "$1" | tr -d ' ') lines)"
  echo "Skim it for anything secret, then upload that file here."
}

mkdir -p "$OUT" 2>/dev/null
if [ ! -d "$OUT" ] || [ ! -w "$OUT" ]; then
  echo "cannot write to $OUT; in Termux run termux-setup-storage once, then try again" >&2
  exit 1
fi

case "$mode" in
gh)
  repo="${2:-}"; id="${3:-}"
  [ -n "$repo" ] || { echo "usage: $0 gh <owner/repo> [run-id]" >&2; exit 2; }
  command -v gh >/dev/null || { echo "gh is not installed (pkg install gh)" >&2; exit 1; }
  if [ -z "$id" ]; then
    id=$(gh run list -R "$repo" --status failure --limit 1 --json databaseId --jq '.[0].databaseId')
    case "$id" in ''|null) echo "no failed run found in $repo" >&2; exit 1 ;; esac
  fi
  f="$OUT/ci-failed-$id.log"
  {
    echo "# repo: $repo   run: $id"
    gh run view "$id" -R "$repo"
    echo
    echo "# ---- failed steps ----"
    gh run view "$id" -R "$repo" --log-failed
  } 2>&1 | redact > "$f"
  finish "$f"
  echo "If the failed-steps section is empty, the whole log is: gh run view $id -R $repo --log"
  ;;

render)
  svc="${2:-}"; did="${3:-}"
  [ -n "$svc" ] || { echo "usage: $0 render <service-id> [deploy-id]" >&2; exit 2; }
  : "${RENDER_API_KEY:?RENDER_API_KEY is not set in this shell}"
  command -v jq >/dev/null || { echo "jq is not installed (pkg install jq)" >&2; exit 1; }
  api="https://api.render.com/v1"
  tmp=$(mktemp -d) || exit 1
  trap 'rm -rf "$tmp"' EXIT

  # get <name> <curl args...>: body in $tmp/<name>.json, status printed and logged, true only on 200.
  get() {
    local name="$1" code line
    shift
    code=$(curl -sS -o "$tmp/$name.json" -w '%{http_code}' \
      -H "Authorization: Bearer $RENDER_API_KEY" -H 'Accept: application/json' "$@")
    line="# $name: HTTP $code"
    echo "$line"
    echo "$line" >&2
    [ "$code" = "200" ]
  }

  get service "$api/services/$svc" >/dev/null || { echo "cannot read the service; check the id and the key" >&2; exit 1; }
  owner=$(jq -r '.ownerId // empty' "$tmp/service.json")
  [ -n "$owner" ] || { echo "no ownerId in the service answer" >&2; exit 1; }

  get deploys "$api/services/$svc/deploys?limit=20" >/dev/null || exit 1
  if [ -z "$did" ]; then
    did=$(jq -r '[.[].deploy | select(.status | test("failed"))][0].id // empty' "$tmp/deploys.json")
    [ -n "$did" ] || did=$(jq -r '.[0].deploy.id // empty' "$tmp/deploys.json")
  fi
  [ -n "$did" ] || { echo "no deploy found" >&2; exit 1; }
  start=$(jq -r --arg d "$did" '[.[].deploy | select(.id == $d)][0].createdAt // empty' "$tmp/deploys.json")
  end=$(jq -r --arg d "$did" '[.[].deploy | select(.id == $d)][0].finishedAt // empty' "$tmp/deploys.json")
  [ -n "$start" ] || { echo "deploy $did is not among the last 20 deploys" >&2; exit 1; }
  [ -n "$end" ] || end=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  # A deploy that is still live has a finishedAt (the moment it went live), but its logs go on: every request
  # after that belongs to it. Cut at finishedAt, the window missed the operator's sign-in attempt (2026-10-03).
  [ "$(jq -r --arg d "$did" '[.[].deploy | select(.id == $d)][0].status // empty' "$tmp/deploys.json")" != "live" ] ||
    end=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  f="$OUT/render-deploy-$did.log"
  {
    echo "# service: $svc   deploy: $did   window: $start .. $end"
    jq -r --arg d "$did" '.[].deploy | select(.id == $d) | "# status: \(.status)   image: \(.image.ref // "?")"' "$tmp/deploys.json"
    echo "# ---- service events ----"
    if get events "$api/services/$svc/events?limit=20"; then
      jq -r '.[].event | "\(.timestamp) \(.type) \(.details | tostring)"' "$tmp/events.json"
    fi
    echo "# ---- logs (build, app and request; oldest first) ----"
    s="$start"; e="$end"; page=0
    while [ "$page" -lt 100 ]; do
      page=$((page + 1))
      get logs -G "$api/logs" \
        --data-urlencode "ownerId=$owner" --data-urlencode "resource=$svc" \
        --data-urlencode "startTime=$s" --data-urlencode "endTime=$e" \
        --data-urlencode "direction=forward" --data-urlencode "limit=100" || break
      jq -r '.logs[]? | "\(.timestamp) \(.message)"' "$tmp/logs.json"
      [ "$(jq -r '.hasMore // false' "$tmp/logs.json")" = "true" ] || break
      s=$(jq -r '.nextStartTime // empty' "$tmp/logs.json")
      e=$(jq -r '.nextEndTime // empty' "$tmp/logs.json")
      [ -n "$s" ] && [ -n "$e" ] || break
    done
  } | redact > "$f"
  finish "$f"
  echo "If a line above says HTTP 4xx, tell me which one; the route is the part written from memory."
  ;;

*)
  echo "usage: $0 gh <owner/repo> [run-id] | render <service-id> [deploy-id]" >&2
  exit 2
  ;;
esac
