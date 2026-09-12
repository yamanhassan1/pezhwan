# PEZHWAN — Loki image with preloaded configuration.
#
# Single-binary Loki for local log aggregation. The identity server logs
# (JSON) are ingested by Promtail or Grafana Alloy agents.

FROM grafana/loki:3.1.0

COPY loki-config.yml /etc/loki/local-config.yaml

EXPOSE 3100

CMD ["-config.file=/etc/loki/local-config.yaml"]
