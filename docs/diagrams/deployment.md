# Multi-Region Active-Active Deployment

Global load balancing with regional identity server pods, MongoDB replication, and Redis cache clusters.

```mermaid
flowchart TB
    GTM["Global Traffic Manager<br/>Route53 / Cloudflare / Traffic Manager<br/>Geo-routing + Health Probes"]

    subgraph US["Region: us-east-1 (PRIMARY)"]
        direction TB
        LB1["Load Balancer"]
        K8S1["identity-server pods<br/>Kubernetes HPA: 2-50<br/>Stateless Express + AuthEngine"]
        MONGO1["MongoDB 3-node RS<br/>PRIMARY — write source"]
        REDIS1["Redis Cluster<br/>3 masters + 3 replicas<br/>Cache · Rate Limit · Pub/Sub"]
        HSM1["HSM / KMS<br/>RS256 Signing Keys<br/>PKCS#11 / Cloud KMS"]

        LB1 --> K8S1
        K8S1 --> MONGO1
        K8S1 --> REDIS1
        K8S1 --> HSM1
    end

    subgraph EU["Region: eu-west-1"]
        direction TB
        LB2["Load Balancer"]
        K8S2["identity-server pods<br/>Kubernetes HPA: 2-50"]
        MONGO2["MongoDB 3-node RS<br/>REPLICA — local reads"]
        REDIS2["Redis Cluster<br/>3 masters + 3 replicas"]
        HSM2["HSM / KMS<br/>Regional Keys"]

        LB2 --> K8S2
        K8S2 --> MONGO2
        K8S2 --> REDIS2
        K8S2 --> HSM2
    end

    subgraph AP["Region: ap-southeast-1"]
        direction TB
        LB3["Load Balancer"]
        K8S3["identity-server pods<br/>Kubernetes HPA: 2-50"]
        MONGO3["MongoDB 3-node RS<br/>REPLICA — local reads"]
        REDIS3["Redis Cluster<br/>3 masters + 3 replicas"]
        HSM3["HSM / KMS<br/>Regional Keys"]

        LB3 --> K8S3
        K8S3 --> MONGO3
        K8S3 --> REDIS3
        K8S3 --> HSM3
    end

    GTM --> LB1
    GTM --> LB2
    GTM --> LB3

    MONGO1 <-.->|"oplog sync / replication"| MONGO2
    MONGO1 <-.->|"oplog sync / replication"| MONGO3
    MONGO2 <-.->|"replication"| MONGO3

    SYNC["Global Event Sync<br/>Mongo Change Streams +<br/>RegionManager Broadcast<br/>(idempotent, dedupe 60s)"]
    SYNC -.->|"session revocation<br/>< 2s propagation"| REDIS1
    SYNC -.->|"session revocation"| REDIS2
    SYNC -.->|"session revocation"| REDIS3

    style GTM fill:#1565c0,color:#fff
    style US fill:#e8f5e9,stroke:#2e7d32
    style EU fill:#e3f2fd,stroke:#1565c0
    style AP fill:#fff3e0,stroke:#e65100
    style SYNC fill:#fce4ec,stroke:#c62828
```

## Scaling Requirements

| Requirement                   | Value                                       |
| ----------------------------- | ------------------------------------------- |
| `trust proxy`                 | 1 (real client IP for audit + rate-limit)   |
| Shared Redis                  | Single Redis URL across all pods            |
| Signing key persistence       | `FileKeyStoreAdapter` (shared volume / KMS) |
| HPA target                    | CPU 60%, min 2 / max 50 pods per region     |
| Mongo connections/node        | 100 (pooled)                                |
| Redis connections/node        | 50                                          |
| Global revocation propagation | < 2 seconds                                 |

## Horizontal Scaling — Stateless Verification

```mermaid
flowchart LR
    REQ["Incoming Request<br/>Authorization: Bearer <token>"]
    VERIFY["Local Pod Verification"]
    JWKS_CACHE["JWKS Cache<br/>(kid-keyed, 5min TTL)"]
    ACCOUNT_CACHE["Account State<br/>(Redis, 30s TTL)"]

    REQ --> VERIFY
    VERIFY -->|"1. Verify JWT signature + kid"| JWKS_CACHE
    VERIFY -->|"2. Validate tokenVersion"| ACCOUNT_CACHE

    JWKS_CACHE -.->|"Cache miss"| JWKS["JWKS Endpoint"]
    ACCOUNT_CACHE -.->|"Cache miss"| MONGO["MongoDB<br/>findById(userId)"]

    style VERIFY fill:#e8f5e9,stroke:#2e7d32
    style JWKS_CACHE fill:#fff9c4,stroke:#f57f17
    style ACCOUNT_CACHE fill:#fff9c4,stroke:#f57f17
```

No shared in-memory state needed — every pod is interchangeable. Access tokens verify locally against JWKS + Redis account state.
