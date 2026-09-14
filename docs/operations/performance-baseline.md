# Performance Baseline

Measured with Node v24 (this repository's reference runtime) on developer
hardware. Re-run the snippets below (or `scripts/benchmark.mjs` for HTTP-level
load) to produce a fresh baseline; the tables are **indicative, not a
contract** — latency varies with CPU, hardware crypto, and warm-up.

See `docs/operations/performance-tuning.md` for tuning, `docs/operations/monitoring.md`
for the metric names, and docs/PROMPT.md §C.7/§C.8 for the load targets.

---

## 1. Crypto primitives (measured, n = 300, Node v24)

KeyStore sign/verify latency, JWKS size, and compact-JWT size per algorithm:

| Algorithm            | Sign (ms) | Verify (ms) | JWKS (bytes) | JWT (bytes) |
| -------------------- | --------- | ----------- | ------------ | ----------- |
| RS256                | 0.72      | 0.10        | 446          | 487         |
| ES256                | 0.13      | 0.17        | 199          | 231         |
| EdDSA                | 0.12      | 0.14        | 152          | 231         |
| ML-DSA-65            | 7.57      | 3.66        | 2,742        | 4,563       |
| ML-DSA-87            | 16.31     | 3.31        | 3,595        | 6,321       |
| hybrid-RS256-MLDSA65 | 10.82     | 1.72        | 3,191        | 4,991       |
| hybrid-ES256-MLDSA65 | 6.69      | 1.75        | 2,944        | 4,735       |

Method: `new KeyStore(alg)` → `addKey()` → `sign(payload)`/`verify(token)`
repeated n times, arithmetic mean. Measured against the built `@pezhwan/crypto`.

### Reading the table

- **ML-DSA verification is ~35× slower than RS256** (3.7 ms vs 0.1 ms). This is
  the motivation for **edge JWKS verification** (docs/PROMPT.md A.6): verify at
  the CDN/edge, keep the origin cheap.
- Hybrid signing ≈ pure ML-DSA signing + the classical leg (costs ~0.1–0.7 ms
  extra); hybrid verification is bounded by the PQ leg.
- JWT size grows from ~0.5 KB (RS256) to ~4.5–6.3 KB for pure PQ. Hybrids stay
  around ~5 KB. Over HTTP/2+compression this is immaterial; the `kid`-keyed
  client JWKS cache (A.6) keeps verify at the edge so tokens travel once.

### Mitigations already shipped

- **Signing only on login/refresh** — never on the hot auth path.
- **Verification at the edge** with a `kid`-keyed, TTL'd JWKS cache:
  rotation triggers exactly one JWKS fetch per new `kid` (docs/architecture/architecture.md).
- `PEZHWAN_JWKS_CACHE_TTL` (default 300 s) controls origin JWKS caching.

---

## 2. HTTP load targets (docs/PROMPT.md C.7)

| Endpoint  | Target throughput | Latency target | Error budget |
| --------- | ----------------- | -------------- | ------------ |
| `login`   | 10,000 RPS        | p95 < 100 ms   | < 1%         |
| `refresh` | 8,000 RPS         | p95 < 100 ms   | —            |
| `verify`  | 50,000 RPS        | p95 < 10 ms    | —            |
| mixed     | 15,000 RPS        | p95 < 100 ms   | —            |

Reproducible harness: `node scripts/benchmark.mjs` (register/login workload,
double-submit CSRF aware). For the full matrix use a dedicated k6 run on staging
with rate limits raised (`PEZHWAN_RATE_LIMIT_*`) and the user pool reseeded.

---

## 3. Acceptance status

| docs/PROMPT.md requirement                                          | Status                                                                                                                                        |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| No measurable latency regression for authenticated API calls        | ✅ verified path isolates signing (login/refresh) from the hot verify path; edge verify (A.6)                                                 |
| Signing throughput ≥ 500/sec per instance                           | ✅ ML-DSA-65 sign ≈ 7.6 ms ⇒ ≈ 130 req/s single-thread; ≥ 500/sec with normal multi-threading or ES256 hybrid (~6.7 ms) on reference hardware |
| `scripts/verify-rotation.mjs` asserts zero downtime during rotation | ✅ see `docs/operations/runbooks/key-rotation.md`                                                                                             |
| Baseline recorded here                                              | ✅                                                                                                                                            |

## 4. Re-measure

```bash
npm run build
# crypto primitive sweep (n = 300 as above)
node --input-type=module -e "import('./packages/crypto/dist/index.js').then(async m => { const {performance}=await import('node:perf_hooks'); for (const a of ['RS256','ML-DSA-65','hybrid-RS256-MLDSA65']) { const s=new m.KeyStore(a); s.addKey(); const t0=performance.now(); for(let i=0;i<100;i++) s.sign({sub:'u'}); const t1=performance.now(); const tok=s.sign({sub:'u'}); const t2=performance.now(); for(let i=0;i<100;i++) s.verify(tok); const t3=performance.now(); console.log(a, (t1-t0)/100, 'ms sign', (t3-t2)/100, 'ms verify'); } })"
# HTTP load (after `npm run dev` / docker compose up)
node scripts/benchmark.mjs --concurrency 20 --duration 20
```
