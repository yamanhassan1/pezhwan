# Pezhwan Deployment Guides

Deployment reference for every supported hosting target. All guides assume the
base architecture from [../multi-region.md](../multi-region.md) and the
ops fundamentals in the [root operations index](../README.md).

| Guide                            | Scope                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [docker.md](./docker.md)         | Single-host Docker Compose stack: 3-node MongoDB replSet, Redis, identity-server, optional TLS-terminating nginx. Fastest path to a working deployment.      |
| [kubernetes.md](./kubernetes.md) | Production Kubernetes via the `pezhwan` Helm chart (and raw manifests): Deployments, MongoDB StatefulSet, HPA, PDB, NetworkPolicy, Ingress TLS.              |
| [aws.md](./aws.md)               | AWS reference architecture (ALB + ECS/Fargate or EKS, DocumentDB/Atlas, ElastiCache Redis) and the `terraform/modules/aws` module layout.                    |
| [azure.md](./azure.md)           | Azure reference architecture (App Gateway/AGIC + AKS, Cosmos DB or Mongo, Azure Cache for Redis, Key Vault) and the `terraform/modules/azure` module layout. |
| [gcp.md](./gcp.md)               | GCP reference architecture (GCLB/Ingress + GKE, MongoDB on GCE or Atlas, Memorystore Redis, Cloud KMS) and the `terraform/modules/gcp` module layout.        |
| [on-premise.md](./on-premise.md) | Running the Compose stack on your own VMs/hosts: replica set layout, TLS, backups, monitoring, and operational considerations.                               |

## Choosing a path

- **Evaluation / single VM** — start with [docker.md](./docker.md).
- **Managed Kubernetes with autoscaling** — [kubernetes.md](./kubernetes.md).
- **Fully managed public cloud** — [aws.md](./aws.md), [azure.md](./azure.md),
  or [gcp.md](./gcp.md); the Terraform modules provision the data plane.
- **Self-hosted / air-gapped** — [on-premise.md](./on-premise.md).

Deployment resources live under `infrastructure/`:

```
infrastructure/
├── docker/                    # Compose files, nginx, mongo/redis configs, monitoring
├── kubernetes/
│   ├── helm/pezhwan/          # Helm chart + values-<env>.yaml
│   └── manifests/             # Raw YAML without Helm
└── terraform/                 # Main modules + modules/{aws,azure,gcp}
```

Shared operational topics (backups, DR, tuning, monitoring, alerts) are in the
[sibling operations docs](../README.md).
