# Pezhwan Kubernetes Manifests

This directory contains Kubernetes manifests for deploying the Pezhwan Identity
Server and its dependencies (MongoDB replica set and Redis) into a single
region/cluster.

## Contents

- `namespace.yaml` – creates the `pezhwan` namespace.
- `configmap.yaml` / `secret.yaml` – non-sensitive and sensitive identity server
  configuration (values are placeholders for prod and must be overridden per
  environment).
- `configmap-mongo.yaml` – MongoDB replica set configuration.
- `statefulset-mongo.yaml` / `service-mongo.yaml` / `pvc-mongo.yaml` – 3-replica
  MongoDB StatefulSet backed by the `pezhwan-rs` replica set, with an init
  container that runs `rs.initiate()` on mongo-0.
- `deployment-redis.yaml` / `service-redis.yaml` / `pvc-redis.yaml` – single
  Redis instance.
- `deployment.yaml` / `service.yaml` / `ingress.yaml` / `hpa.yaml` /
  `network-policy.yaml` – the Identity Server workload, exposure, autoscaling,
  and network policies.

## Usage

Build and push the identity server image first:

```
docker build -t pezhwan/identity-server:latest .
docker push pezhwan/identity-server:latest
```

Then apply everything:

```
kubectl apply -f infrastructure/kubernetes/manifests/
```

The Identity Server health endpoint is
`GET http://127.0.0.1:4011/.well-known/jwks.json`.

## Note

These are single-region manifests for a single active cluster. The multi-region
active-active architecture (documented in `architecture.md`), which uses
MongoDB Change Streams for cross-region identity sync, is **not** wired into
these manifests.
