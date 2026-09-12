# GCP Deployment

Reference architecture for running the Pezhwan identity plane on Google Cloud,
with the Terraform module scaffolding tracking the components it should
provision.

## Terraform module (`infrastructure/terraform/modules/gcp/`)

The module is organized as `main.tf`, `variables.tf`, and `outputs.tf`.
**The files are currently placeholders (0 bytes) and must be implemented
before `terraform apply`**; the intended contract:

| Inputs (`variables.tf`) | Outputs (`outputs.tf`) |
| ----------------------- | ---------------------- |
| Project ID, region/zones, GKE cluster + node-pool sizing, GCE instance type (Mongo), Memorystore Redis tier, DNS zone/records, KMS key ring | GKE cluster name, Mongo instance IPs, Redis endpoint, ingress IP/host, KMS key id, storage bucket name |

`main.tf` should provision: VPC + subnets, a private GKE cluster (or GCE
instances running the Compose stack), a MongoDB replica set on GCE (or an Atlas
delegated database), Memorystore Redis, a Load Balancer (GCLB/Ingress), Cloud
DNS records, Cloud KMS key ring, and object-storage buckets for backups.

## Recommended architecture

```
Clients ──► Cloud DNS (auth.example.com)
              │
              ▼
       GCLB / Ingress (TLS) ─► GKE ×N (identity-server, port 4011)
              │                       │                     │
              │                       ├──► Memorystore Redis (state, limits)
              │                       └──► MongoDB on GCE / Atlas (transactions)
              └─► Cloud Storage (backup archives, lifecycle rules)
```

- **Compute** — GKE Autopilot or node pools running the Helm chart; the server
  is stateless, so scale horizontally via HPA (the chart's autoscaling block)
  with no affinity/sticky sessions.
- **Data** — a 3-node `mongo:7` replica set on GCE instances (managed instance
  groups, regional persistence disks), or MongoDB Atlas for a fully managed
  tier. Transactions are required for refresh rotation and OAuth redemption.
- **Cache** — Memorystore Redis (standard tier; ≥ R1 for failover) holding
  rate limits, session liveness, account-state TTLs, and distributed locks;
  the durable Mongo-counter fallback covers Redis outages.
- **TLS/DNS** — GCLB frontend with a Google-managed or KMS-stored certificate;
  Cloud DNS A/AAAA records; `PEZHWAN_ISSUER=https://auth.example.com`.
- **Secrets** — Cloud KMS wraps `PEZHWAN_MFA_ENCRYPTION_KEY`, Mongo credentials,
  and the backup key; GKE uses the Secret Manager / KMS integrations to inject
  them as env or mounted secrets.
- **Keys** — sign-in key material via `PEZHWAN_SIGNING_KEYS_PATH` on a shared
  Filestore/PD mount (or KMS-backed) so all replicas share the `kid` family.
- **Backups** — mongodump binaries to Cloud Storage with WORM/locking policies
  and lifecycle rules, verified by `scripts/verify-backup.mjs`.

## Steps overview

1. Implement `main.tf` per the intended contract; `terraform init` / `plan`.
2. `terraform apply` to create the VPC, GKE cluster, Mongo VMs, Memorystore,
   GCLB, DNS, and KMS resources.
3. Build the image locally (`apps/identity-server/Dockerfile`) and push to
   Artifact Registry.
4. `helm install pezhwan ../kubernetes/helm/pezhwan -f values-prod.yaml`,
   injecting URIs/URNs from Secret Manager.
5. Enable the GCLB ingress with TLS, point Cloud DNS at its IP, and verify
   `/health/ready` and `/.well-known/jwks.json`.
6. Back up to Cloud Storage and record the drill RPO/RTO baseline.

## IAM notes

- Service accounts use least privilege: GKE node SA reaches Secret Manager
  `secretAccessor`, GCE Mongo SA reaches the backup bucket `roles/storage.objectCreator`.
- Enable VPC flow logs and Cloud Audit Logs to feed the ops monitoring stack
  (Prometheus/Grafana placeholders under `infrastructure/docker/monitoring/`).