# Kubernetes Deployment

The `pezhwan` Helm chart at `infrastructure/kubernetes/helm/pezhwan/` deploys
the identity server, MongoDB, and Redis onto Kubernetes. Raw (non-Helm)
manifests mirror the chart in `infrastructure/kubernetes/manifests/`.

## Chart layout

| Path                                   | Resource                                                                                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Chart.yaml`                           | Name `pezhwan`, `apiVersion: v2`, version/appVersion `0.1.0`                                                                                                               |
| `values.yaml`                          | Defaults (override per environment)                                                                                                                                        |
| `values-{dev,staging,prod}.yaml`       | Environment overrides                                                                                                                                                      |
| `templates/_helpers.tpl`               | Name/label/fullname helpers                                                                                                                                                |
| `templates/configmap.yaml`             | Non-secret env from `values.env`                                                                                                                                           |
| `templates/secrets.yaml`               | `values.secrets` base64-encoded into a Secret                                                                                                                              |
| `templates/deployment.yaml`            | Identity server Deployment (rolling update `maxUnavailable: 0`, `maxSurge: 1`); readiness/liveness probe `/.well-known/jwks.json` on port 4011; `envFrom` config + secrets |
| `templates/service.yaml`               | Service, `type: ClusterIP`, port 4011                                                                                                                                      |
| `templates/ingress.yaml`               | Ingress (`ingressClassName: nginx`) with optional TLS block                                                                                                                |
| `templates/statefulset-mongo.yaml`     | MongoDB StatefulSet, `--replSet pezhwan-rs`, `volumeClaimTemplates` for `/data/db`, `mongosh` probes                                                                       |
| `templates/service-mongo.yaml`         | Headless (`clusterIP: None`) service for the replSet                                                                                                                       |
| `templates/deployment-redis.yaml`      | Redis Deployment bound to the redis PVC                                                                                                                                    |
| `templates/service-redis.yaml`         | Redis ClusterIP service (port 6379)                                                                                                                                        |
| `templates/pvc.yaml`                   | Mongo + Redis PVCs (RWO, configurable storage class/size)                                                                                                                  |
| `templates/hpa.yaml`                   | HorizontalPodAutoscaler (CPU/memory utilization targets)                                                                                                                   |
| `templates/pdb.yaml`                   | PodDisruptionBudget, `minAvailable: 1`                                                                                                                                     |
| `templates/network-policy.yaml`        | Ingress from `ingress-nginx` namespace on 4011; egress to Mongo (27017) + Redis (6379) + DNS                                                                               |
| `templates/tests/test-connection.yaml` | `helm test` pod that curls `/.well-known/jwks.json`                                                                                                                        |

## Values matrix

| Value                 | dev           | staging       | prod                                                          |
| --------------------- | ------------- | ------------- | ------------------------------------------------------------- |
| `replicaCount`        | 1             | 2             | 3                                                             |
| CPU request / limit   | 100m / 250m   | 200m / 500m   | 250m / 1                                                      |
| Mem request / limit   | 256Mi / 384Mi | 384Mi / 512Mi | 512Mi / 1Gi                                                   |
| `autoscaling.enabled` | false         | true (2→5)    | true (3→10)                                                   |
| `mongodb.replicas`    | 1             | 3             | 3                                                             |
| `mongodb.storageSize` | 5Gi           | 20Gi          | 50Gi                                                          |
| `redis.storageSize`   | 1Gi           | 5Gi           | 10Gi                                                          |
| `ingress.enabled`     | false         | false         | true (TLS secret `pezhwan-tls-prod`, host `auth.pezhwan.com`) |

Image: `pezhwan/identity-server:<tag>` (default `latest`, `pullPolicy:
IfNotPresent`); set `image.tag` per release.

## Install / upgrade

```bash
helm install pezhwan ./infrastructure/kubernetes/helm/pezhwan \
  -f infrastructure/kubernetes/helm/pezhwan/values-prod.yaml \
  --namespace pezhwan --create-namespace

helm upgrade pezhwan ./infrastructure/kubernetes/helm/pezhwan \
  -f infrastructure/kubernetes/helm/pezhwan/values-prod.yaml \
  --set image.tag=v0.1.3

helm test pezhwan -n pezhwan      # runs the jwks connection test pod
helm uninstall pezhwan -n pezhwan # data PVCs remain unless removed
```

The base `values.yaml` points `PEZHWAN_MONGODB_URI` at the headless service
(`pezhwan-mongo-0..2.pezhwan-mongo:27017`) and `PEZHWAN_REDIS_URL` at the
redis service. `npm run verify:compose` only covers Compose; validate the chart
with `helm lint ./infrastructure/kubernetes/helm/pezhwan` and `helm template`.

## Secrets management

`templates/secrets.yaml` renders every entry of `values.secrets` with
`b64enc` — note that base64 is encoding, not encryption. Never commit
plaintext secrets; supply them at install time via `--set secrets.<NAME>`, a
values file kept out of git, or an external-secrets/Vault integration.
Required secrets include `PEZHWAN_ISSUER`, `PEZHWAN_MONGODB_URI` (with
credentials), and `PEZHWAN_REDIS_URL`; sign-in keys persist per `FileKeyStoreAdapter`
at `PEZHWAN_SIGNING_KEYS_PATH` (mount a shared volume for HA so all replicas
share the `kid` family — see [../disaster-recovery.md](../disaster-recovery.md)).

## MongoDB StatefulSet

Mongo runs as a 3-replica StatefulSet with per-pod PVCs
(`volumeClaimTemplates`, `ReadWriteOnce`) and a headless Service so the
replSet peer addresses are stable. `serviceName` exposes each pod at
`<name>-mongo-<n>.<name>-mongo`. The chart does not run the `init.js` seeding;
replicate through that script or `scripts/seed-database.mjs` after first
connect.

## HPA and PDB

- The HPA scales the identity-server Deployment between `minReplicas` and
  `maxReplicas` on CPU (default 70%) and memory (80%) utilization targets
  (`autoscaling/v2`).
- The PDB `minAvailable: 1` protects availability during voluntary
  disruptions; with 3 replicas one pod may be drained at a time.

## Network policies

The default NetworkPolicy is deny-by-default: ingress only from the
`ingress-nginx` namespace on TCP 4011, egress only to Mongo (27017), Redis
(6379), and DNS (53). If pods live elsewhere or need admin-console egress,
extend the selects before installing.

## Ingress TLS

Enable `ingress.enabled` and provide the `tls` list. Certificates are
referenced by `secretName` (e.g. hosted `pezhwan-tls-prod`); provision the
Secret beforehand (cert-manager `Certificate` or an uploaded bundle). The
Compose nginx proxy enforces similar TLS + HSTS behavior for bare-metal
setups.

## Raw manifests

`infrastructure/kubernetes/manifests/` contains the same resources as plain
YAML (`namespace.yaml`, `deployment.yaml`, `service*.yaml`, `configmap.yaml`,
`secret.yaml`, `statefulset-mongo.yaml`, `pvc*.yaml`, `hpa.yaml`,
`network-policy.yaml`, `ingress.yaml`) for clusters where Helm is not used.
Apply with `kubectl apply -f infrastructure/kubernetes/manifests/`.
