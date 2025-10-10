
#!/bin/sh
set -u

: "${CRON_SECRET:?CRON_SECRET must be set}"
CRON_BASE_URL="${CRON_BASE_URL:-http://server:3000}"
CRON_INTERVAL="${CRON_INTERVAL:-600}"

json() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

req() {
  job="$1"; url="$2"
  out=$(curl -sS -o /dev/null \
      -H "x-cron-secret:${CRON_SECRET}" \
      -w '%{http_code} %{time_total} %{size_download}' \
      --retry 2 --retry-all-errors --max-time 30 \
      "$url" 2>&1) || true

  code=$(printf '%s' "$out" | awk '{print $1}')
  t=$(printf '%s' "$out" | awk '{print $2}')
  bytes=$(printf '%s' "$out" | awk '{print $3}')
  [ -z "${code:-}" ] && code=0

  level="info"
  [ "$code" = "000" ] && level="error"
  [ "$code" -ge 500 ] 2>/dev/null && level="error" || true
  [ "$code" -ge 400 ] 2>/dev/null && [ "$code" -lt 500 ] && level="warn" || true

  printf '{"ts":"%s","level":"%s","job":"%s","code":%s,"time_total":%s,"bytes":%s,"url":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$level" "$(json "$job")" "$code" "${t:-0}" "${bytes:-0}" "$(json "$url")"
}

trap 'printf "{\"ts\":\"%s\",\"level\":\"warn\",\"msg\":\"cron exiting\"}\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"' TERM INT

while :; do
  req "calendar" "$CRON_BASE_URL/api/cron/calendar"
  req "emails"   "$CRON_BASE_URL/api/cron/emails"
  req "waitlist" "$CRON_BASE_URL/api/cron/waitlist?limit=50&expiresInHours=24"
  sleep "$CRON_INTERVAL"
done
