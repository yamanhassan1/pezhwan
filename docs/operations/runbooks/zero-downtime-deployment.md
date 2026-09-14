# Zero-Downtime Deployment

## 1. Purpose and symptoms

Roll out a Pezhwan release with no request downtime. The server is stateless
(sessions/revocations persist in Mongo; Redis optimises), so a rolling deploy is
safe if signing-key material stays durable and readiness gates hold.
**Triggers:** announced release, security patch, or config change (rate limits,
OTP providers, CORS).

## 2. Severity / priority

P2 (medium) standard releases; P1 (critical) when deploying an active security patch.

## 3. Preconditions

CI green: unit/integration/security/interop suites, secret scan (Pezhwan +
Gitleaks), `npm audit --audit-level=high`, lint/typecheck/build (SECURITY.md).
Built image at the target tag; pre-prod verified. Durable signing-key volume
mounted (step 4).

## 4. Step-by-step response

### 1. Pre-deploy checks

```bash
npm run build && npm test
node scripts/security-audit.mjs && node scripts/secret-scan.mjs
node scripts/dependency-audit.mjs
curl -s https://ISSUER/health/live | jq '.ok';  curl -s https://ISSUER/health/ready | jq '.ok'
```

### 2. Confirm key durability across the restart

```bash
kubectl exec -it deploy/pezhwan-identity-server -c identity-server -- \
  ls -la "$PEZHWAN_SIGNING_KEYS_PATH"
```

`.pem` keys must live on durable storage (PVC); pre-deploy tokens must verify
post-deploy (`initKeyPersistence` restart round-trip, G5).

### 3. Deploy via Helm (RollingUpdate)

Prod runs `replicaCount: 3`, HPA 3-10, RollingUpdate `maxUnavailable: 0`
(`infrastructure/kubernetes/helm/pezhwan/values-prod.yaml`):

```bash
helm upgrade --install pezhwan infrastructure/kubernetes/helm/pezhwan \
  --namespace prod --values infrastructure/kubernetes/helm/pezhwan/values-prod.yaml \
  --set image.tag=v0.1.9 --wait --timeout 10m
```

Rollout is gated by the readiness probe `/health/ready`
(`apps/identity-server/src/server.ts:142`): pods join the Service only once
Mongo is connected (`readyState === 1`).

### 4. Deploy via Docker Compose (single node)

```bash
docker compose build identity-server
docker compose up -d --no-deps --scale identity-server=2 identity-server
curl -s http://localhost:4011/health/ready | jq '.ok'   # gate before shrink
docker compose up -d --no-deps --scale identity-server=1 identity-server
```

### 5. Monitor the rollout

```bash
kubectl rollout status deploy/pezhwan-identity-server -n prod
kubectl get pods -l app=pezhwan-identity-server -n prod   # all Running/Ready
curl -s https://ISSUER/health/ready | jq '.ok'
```

### 6. Post-deploy verification

```bash
curl -s -X POST https://ISSUER/v1/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"...","password":"..."}'
curl -s https://ISSUER/.well-known/jwks.json | jq '.keys | length'
```

Watch `auth.login.success`, `authz.denied`, `security.event` for 15 min.

## 5. Verification

- [ ] `/health/live` 200; `/health/ready` 200 with `mongodb: "ready"`.
- [ ] All pods Ready; no `CrashLoopBackOff` during rollout.
- [ ] Signing keys survived the restart; JWKS `kid` set unchanged.
- [ ] Zero 5xx in the rollout window; `auth.login.success` steady.

## 6. Rollback

On mid-rollout failure return to the previous revision (see
`emergency-rollback.md`):

```bash
helm history pezhwan -n prod
helm rollback pezhwan <previous-revision> -n prod --wait
```

## 7. Post-incident review checklist

- [ ] Zero-downtime claim confirmed by metrics.
- [ ] Signing keys persisted; secret scan passed pre-deploy.
- [ ] Rollout window duration recorded; post-deploy issues filed as tickets.

## 8. Owner references

| Item                     | Reference                                                                        |
| ------------------------ | -------------------------------------------------------------------------------- |
| Helm chart / prod values | `infrastructure/kubernetes/helm/pezhwan/values-prod.yaml`                        |
| Docker Compose           | `infrastructure/docker/docker-compose.yml`                                       |
| Health endpoints         | `apps/identity-server/src/server.ts` (`/health/live`, `/health/ready`)           |
| Key persistence          | `initKeyPersistence()` `packages/core/src/pezhwan.ts:333`, `FileKeyStoreAdapter` |
| Shutdown                 | `apps/identity-server/src/server.ts` (SIGINT/SIGTERM drain)                      |
| Release gates            | `SECURITY.md`                                                                    |
| Rollback                 | `helm rollback` / pinned image (see `emergency-rollback.md`)                     |
| Alert source             | readiness failures, `kubectl rollout status`                                     |
| On-call                  | Platform team (release owner)                                                    |
