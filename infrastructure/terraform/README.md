# Pezhwan Terraform

Terraform configuration for provisioning PEZHWAN's cloud infrastructure:
managed datastores (MongoDB, Redis), the Identity Server compute layer, and its
networking/load-balancing plumbing — on AWS, Azure, or GCP.

## Layout

```
infrastructure/terraform/
├── main.tf / variables.tf / outputs.tf / providers.tf   # root composition
├── modules/
│   ├── aws/  azure/  gcp/   # per-cloud compositions (see below)
└── provider/          # custom Terraform provider (see below)
```

The per-provider modules are the building blocks:

- `modules/aws` — VPC/security groups, RDS (MongoDB) + ElastiCache (Redis)
  stores, an ECS service for the server, and an ALB in front of it.
- `modules/azure` / `modules/gcp` — equivalent compositions.

## Custom Terraform provider

`provider/` hosts a first-party Terraform provider written in Go. It manages
PEZHWAN platform objects as Terraform resources and data sources, so identity
configuration can be provisioned declaratively alongside the infrastructure:

| File                    | Contents                                                |
| ----------------------- | ------------------------------------------------------- |
| `provider.go`           | provider schema, configuration, version pinning         |
| `resource_user.go`      | `pezhwan_user` — create/update/delete application users |
| `resource_tenant.go`    | `pezhwan_tenant` — tenants and their configuration      |
| `resource_role.go`      | `pezhwan_role` — roles and their permission sets        |
| `resource_client.go`    | `pezhwan_client` — OAuth clients (grants, scopes, URIs) |
| `resource_webhook.go`   | `pezhwan_webhook` — webhook endpoints and event filters |
| `data_source_user.go`   | `pezhwan_user` data source (read existing users)        |
| `data_source_tenant.go` | `pezhwan_tenant` data source                            |
| `go.mod`                | Go module (Terraform plugin SDK)                        |

## Planning and applying

```bash
cd infrastructure/terraform
terraform init
terraform plan -out=pezhwan.tfplan
terraform apply pezhwan.tfplan
terraform destroy
```

Provide inputs via `-var` flags, a `.tfvars` file, or environment variables
(see `variables.tf`), and run `terraform validate` after editing.

## Provider usage example

Once built into a Terraform plugin and declared in `required_providers`, a
fragment managing platform objects alongside the infrastructure looks like (the
same pattern covers `pezhwan_role`, `pezhwan_client`, and `pezhwan_webhook`):

```hcl
terraform {
  required_providers {
    pezhwan = {
      source  = "pezhwan.io/identity/pezhwan"
      version = "~> 0.1"
    }
  }
}
provider "pezhwan" {
  tenant_id     = var.pezhwan_tenant_id
  base_url      = var.pezhwan_base_url  # e.g. https://iam.example.com
  client_id     = var.pezhwan_client_id
  client_secret = var.pezhwan_client_secret
}
resource "pezhwan_tenant" "acme" {
  name = "Acme Corp"
  slug = "acme"
  plan = "enterprise"
}
resource "pezhwan_user" "admin" {
  tenant_id = pezhwan_tenant.acme.id
  email     = "admin@acme.com"
  is_active = true
}
```

## Status

Implemented and plan-able. The root manifests (`providers.tf`, `variables.tf`,
`outputs.tf`, `main.tf`) select one cloud module via `var.cloud`; `modules/aws`,
`modules/azure`, and `modules/gcp` contain real configurations; and `provider/`
holds the SDKv2 Go provider wired to the real `/v1/admin/*` endpoints
(`apps/identity-server/src/admin.ts`).

Known constraints baked into the code:

- Only the selected cloud's module is instantiated (empty `for_each` for the
  others), so plan/apply never touches unauthenticated providers.
- DocumentDB is Mongo-wire-compatible but lacks replica-set transactions that
  Pezhwan requires; `modules/aws/rds.tf` documents this and recommends Atlas.
- The admin API cannot delete tenants or webhooks, and webhooks have no update
  endpoint; the provider soft-deactivates tenants and fails fast on webhook
  update/delete with an explanatory error.
- Before applying on AWS, import an ACM certificate for `domain`; on GCP, enable
  the required APIs (`run`, `vpcaccess`, `redis`, `compute`, `artifactregistry`).

Run `terraform init && terraform validate` to plan.

## Related

- `infrastructure/docker/` + `infrastructure/kubernetes/` — local and
  single-region deployment paths this Terraform is the cloud analog of
- `docs/ARCHITECTURE.md` — the deployment model these resources realize
