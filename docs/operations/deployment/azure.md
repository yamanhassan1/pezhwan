# Azure Deployment

Reference architecture for running the Pezhwan identity plane on Microsoft
Azure, with the Terraform module scaffolding tracking the components it should
provision.

## Terraform module (`infrastructure/terraform/modules/azure/`)

The module is organized as `main.tf`, `variables.tf`, and `outputs.tf`.
**The files are currently placeholders (0 bytes) and must be implemented
before `terraform apply`**; the intended contract:

| Inputs (`variables.tf`) | Outputs (`outputs.tf`) |
| ----------------------- | ---------------------- |
| Location, resource-group name, AKS/VM sizing, Cosmos DB account tier, Redis SKU, DNS zone/record names | AKS cluster name and kubeconfig pointer, Cosmos connection string, Redis host/port (ref. via secret store), ingress host, KMS/Key Vault IDs |

`main.tf` should provision: resource group, AKS cluster (or a VM/VMSS running
the Compose stack), Cosmos DB with the MongoDB API, Azure Cache for Redis, an
Application Gateway or AGIC ingress, Azure DNS zone and records, a Key Vault +
managed identity, and diagnostic/log Analytics workspace.

## Recommended architecture

```
Clients ──► Azure DNS (auth.example.com)
              │
              ▼
      App Gateway / AGIC (TLS) ─► AKS / VM ×N (identity-server, port 4011)
              │                        │                       │
              │                        ├──► Azure Cache for Redis (state, limits)
              │                        └──► Cosmos DB (MongoDB API) or Mongo on Azure VM
              └─► Azure Blob (backup archives, offsite)
```

- **Compute** — AKS with the Helm chart, or a managed single-VM Compose
  deployment; scale via the chart's HPA or a VM Scale Set.
- **Data** — Cosmos DB with the MongoDB API (wire-compatible, transactions)
  or a 3-node `mongo:7` replica set on Azure VMs in an availability set.
  Cosmos multi-region writes map to Pezhwan's `RegionManager` semantics.
- **Cache** — Azure Cache for Redis (Standard P2+ for high availability)
  serving rate limits, session liveness, account-state TTLs, and distributed
  locks. Redis remains an optimiser with the durable Mongo-counter fallback.
- **TLS/DNS** — Application Gateway listener with a Key Vault or cert-manager
  certificate; Azure DNS records; `PEZHWAN_ISSUER` set to the public host.
- **Secrets** — Key Vault stores `PEZHWAN_MONGODB_URI`, `PEZHWAN_REDIS_URL`,
  `PEZHWAN_MFA_ENCRYPTION_KEY`, and the backup key; AKS uses the Key Vault
  CSI or the Secrets Store CSI driver; a managed identity avoids key material
  in pod specs.
- **Backups** — mongodump archives to Blob Storage with soft-delete + version
  retention, verified with `scripts/verify-backup.mjs`.

## Steps overview

1. Implement `main.tf` per the intended contract, then `terraform init` /
   `terraform plan`.
2. `terraform apply` to create the resource group, AKS (or VM), Cosmos DB,
   Redis, App Gateway, DNS, and Key Vault.
3. Build and push the image to ACR (`apps/identity-server/Dockerfile`).
4. Attach the AKS cluster, create the Key Vault secret provider classes, and
   `helm install pezhwan ../kubernetes/helm/pezhwan -f values-prod.yaml` with
   Azure-specific secrets.
5. Point the App Gateway listener at the service; enable TLS; verify
   `GET /health/ready` and `/.well-known/jwks.json`.
6. Schedule the backup drill and store the first archive in Blob as your RPO/
   RTO baseline.

## IAM and compliance

- Use a managed identity on the AKS node pool with receipt of Key Vault
  secrets; no long-lived credentials in files.
- Cosmos DB and Blob are encrypted at rest by default; add customer-managed
  keys via Key Vault if required.
- Azure AD Managed Identity can also front the /v1/admin surface if you need
  Azure-native administrative authentication on top of Pezhwan's own RBAC.