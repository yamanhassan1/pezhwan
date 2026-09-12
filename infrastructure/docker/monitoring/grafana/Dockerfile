# PEZHWAN — Grafana image with provisioned datasources and dashboards.
#
# Bundles datasources.yml and the Pezhwan overview dashboard so Grafana
# is immediately usable on first boot without manual configuration.

FROM grafana/grafana:11.1.0

USER root

COPY datasources.yml /etc/grafana/provisioning/datasources/datasources.yml

RUN mkdir -p /var/lib/grafana/dashboards \
  && chown -R grafana:grafana /etc/grafana/provisioning /var/lib/grafana/dashboards

COPY dashboards/pezhwan.json /var/lib/grafana/dashboards/pezhwan.json

# Dashboard provisioning config — points Grafana at the JSON file(s).
COPY <<EOF /etc/grafana/provisioning/dashboards/dashboards.yml
apiVersion: 1
providers:
  - name: Pezhwan
    orgId: 1
    folder: ""
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    options:
      path: /var/lib/grafana/dashboards
      foldersFromFilesStructure: false
EOF

RUN chown -R grafana:grafana /var/lib/grafana/dashboards

USER grafana

EXPOSE 3000
