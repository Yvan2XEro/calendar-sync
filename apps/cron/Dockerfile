FROM curlimages/curl:8.6.0
WORKDIR /app

ENV CRON_INTERVAL=600 \
  CRON_BASE_URL=http://server:3000

COPY --chmod=0755 run.sh /app/run.sh

ENTRYPOINT ["/bin/sh", "-c"]
CMD ["/app/run.sh"]
