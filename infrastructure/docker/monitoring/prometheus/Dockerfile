# PEZHWAN — Prometheus image with preloaded configuration.
#
# Built on top of the official Prometheus image. Config and alert rules are
# baked into the image so the container runs read-only in production.

FROM prom/prometheus:v2.53.0

COPY prometheus.yml /etc/prometheus/prometheus.yml
COPY alerts.yml /etc/prometheus/alerts.yml

RUN chown -R nobody:nobody /etc/prometheus

EXPOSE 9090
