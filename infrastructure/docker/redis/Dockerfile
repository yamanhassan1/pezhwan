# PEZHWAN — Redis 7 (Alpine) with custom configuration.
#
# Provides a production-appropriate Redis image for rate limiting, OTP cache,
# and session storage. Mounting redis.conf sets memory limits and persistence
# policy; sentinel.conf is bundled for future high-availability deployments.

FROM redis:7-alpine

RUN apk add --no-cache bash curl

RUN mkdir -p /etc/redis /data

COPY redis.conf /etc/redis/redis.conf
COPY sentinel.conf /etc/redis/sentinel.conf

RUN chown -R redis:redis /etc/redis /data

EXPOSE 6379

CMD ["redis-server", "/etc/redis/redis.conf"]
