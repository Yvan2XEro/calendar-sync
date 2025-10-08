FROM curlimages/curl:8.6.0

WORKDIR /app

ENV CRON_INTERVAL=600 \
    CRON_BASE_URL=http://server:3000

ENTRYPOINT ["/bin/sh", "-c"]

CMD "set -eu; \
while :; do \
  curl -fsS -H \"x-cron-secret:${CRON_SECRET:?CRON_SECRET must be set}\" \"${CRON_BASE_URL}/api/cron/calendar\"  || echo 'calendar cron failed'; \
  curl -fsS -H \"x-cron-secret:${CRON_SECRET}\"          \"${CRON_BASE_URL}/api/cron/emails\"    || echo 'emails cron failed'; \
  curl -fsS -H \"x-cron-secret:${CRON_SECRET}\"          \"${CRON_BASE_URL}/api/cron/waitlist?limit=50&expiresInHours=24\" || echo 'waitlist cron failed'; \
  sleep \"${CRON_INTERVAL:-600}\"; \
done"
