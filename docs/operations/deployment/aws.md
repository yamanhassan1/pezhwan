# AWS Deployment

Reference architecture for running the Pezhwan identity plane on AWS, with the
Terraform module scaffolding tracking the components it should provision.

## Terraform module (`infrastructure/terraform/modules/aws/`)

The module is organized by concern. **Files are currently placeholders (0
bytes) and must be implemented before `terraform apply`**; this table is the
intended contract:

| File                          | Intended resources                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `vpc.tf`                      | VPC, public/private subnets across AZs, Internet Gateway, NAT Gateways, route tables                                            |
| `security-groups.tf`          | Network boundary: ALB→ECS ingress, ECS→DocumentDB/Mongo (27017), ECS→ElastiCache (6379), managed-services-only traffic          |
| `alb.tf`                      | Application Load Balancer, HTTP/HTTPS listeners, target group pointing at the ECS/ECS-Fargate service                           |
| `ecs.tf`                      | ECS cluster, Fargate task definition (the identity-server image, port `4011`), service with autoscaling, `trust proxy` behavior |
| `rds.tf`                      | The MongoDB-compatible data tier — DocumentDB cluster (or an EC2-hosted `mongo:7` replica set) with encrypted storage + backups |
| `elasticache.tf`              | ElastiCache Redis (cluster mode on/off) with automatic failover                                                                 |
| `variables.tf` / `outputs.tf` | Inputs (region, CIDR, image tag, instance sizing) and outputs (ALB DNS name, endpoints, SG ids)                                 |

All encrypted at rest; KMS keys applied to DocumentDB/ElastiCache and the ECS
task role's secrets.

## Recommended architecture

```
Clients ──► Route53 (auth.example.com)
              │
              ▼
          ACM TLS ─► ALB ─► ECS/Fargate ×N (identity-server, port 4011)
              │              │                       │
              │              ├──► ElastiCache Redis  │ (state, limits, locks)
              │              └──► DocumentDB/Atlas Mongo (durable + transactions)
              └─► S3 bucket (backup archives, offsite copy)
```

- **Compute** — ECS on Fargate (or EKS with the Helm chart) running the
  stateless server image; scale on CPU/memory, no sticky sessions.
- **Data** — MongoDB 7 replica set semantics are required (transactions,
  audit chain). Use MongoDB Atlas, Amazon DocumentDB, or `mongo:7` on EC2 with
  the 3-node replSet topology from `infrastructure/docker/mongo/`.
- **Cache** — ElastiCache Redis for rate limits, session liveness, and the 30 s
  account-state TTL; it is an optimiser, so a single node is acceptable with
  the Mongo-counter fallback enabled.
- **TLS/DNS** — ACM certificate on the ALB listener, Route53 alias records,
  and `PEZHWAN_ISSUER=https://auth.example.com`.
- **Keys** — sign-in keys via `PEZHWAN_SIGNING_KEYS_PATH` on shared EFS (or
  KMS-backed); `PEZHWAN_MFA_ENCRYPTION_KEY`, backup key, and DB credentials in
  AWS Secrets Manager / SSM Parameter Store.
- **Backups** — mongodump/`--strategy binary` archives uploaded to S3
  (versioned, KMS-encrypted), verified with `scripts/verify-backup.mjs`.

## IAM notes

- Grant the ECS task role read access to the signing-key volume, decrypt
  rights on the KMS key, and write access to the backup bucket only.
- Never store credentials in the image or task definition plaintext; inject
  via Secrets Manager `secrets` entries (`secrets` template style used in the
  Helm chart applies here identically).
- Keep the ALB security group open only on 443; ECS reaches Mongo/Redis via
  private subnets.

## Deployment steps overview

1. Implement the module resources per the table above, then
   `terraform init` and `terraform plan`.
2. `terraform apply` to provision VPC, ALB, DocumentDB, ElastiCache, and ECS.
3. Build the image (`docker build -f apps/identity-server/Dockerfile .`) and
   push to ECR.
4. Store secrets (issuer, Mongo/Redis URIs, signing-key path, KMS ARN) in
   Secrets Manager.
5. Deploy the ECS service; verify `GET /health/ready` and
   `/.well-known/jwks.json` through the ALB and configured Route53 record.
6. Point Atlas/on-prem Mongo backups at S3 and run the first
   `drill:backup-restore` for an RPO/RTO baseline (see
   [../backup-restore.md](../backup-restore.md)).
