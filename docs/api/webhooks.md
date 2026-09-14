# PEZHWAN Webhooks

Webhooks deliver outbound events about identities, sessions, and security to
your endpoints over plain HTTPS POSTs. The surface is backed by the core
`WebhookService` (`packages/core/src/services/events/webhook.service.ts`) and
exposed via `/v1/webhooks` (requires an authenticated `ADMIN` identity).

## Events

Events are published from the canonical domain event names in
`packages/shared/src/events/domain-events.ts`:

| Event                   | Fired when                                        |
| ----------------------- | ------------------------------------------------- |
| `user.created`          | A user is registered                              |
| `user.updated`          | A user's profile/metadata changes                 |
| `user.deleted`          | A user is deleted                                 |
| `user.password_changed` | A password change or reset takes effect           |
| `session.created`       | A new session / refresh-token family is created   |
| `session.revoked`       | A session is revoked (logout, revoke-all, family) |
| `otp.requested`         | An OTP is generated and delivered                 |
| `otp.verified`          | An OTP is successfully verified                   |
| `oauth.code_issued`     | An authorization code is issued                   |
| `webhook.queued`        | An event was queued for webhook delivery          |
| `api_key.created`       | A server-to-server API key was created            |
| `api_key.revoked`       | An API key was revoked                            |
| `tenant.created`        | A tenant was created                              |
| `application.created`   | An application was created                        |

A synthetic `webhook.test` event can be fired for testing (below).

## Registering an endpoint

`POST /v1/webhooks` (ADMIN):

```json
{ "url": "https://example.com/hooks/pezhwan", "events": ["user.created", "session.revoked"] }
```

Responds `201` with the endpoint plus a `secret` **shown exactly once**:

```json
{
  "success": true,
  "data": {
    "id": "...",
    "url": "https://example.com/hooks/pezhwan",
    "events": ["user.created", "session.revoked"],
    "active": true,
    "maxRetries": 5,
    "secret": "Azn4..."
  }
}
```

The `Webhook` document (`packages/core/src/models/webhook.model.ts`) stores:
`tenantId`, `applicationId`, `url`, `secret`, `events[]`, `active` (default
true), and `maxRetries` (default 5). Endpoints are tenant-scoped — the server
registers them under the running runtime's `tenantId`/`applicationId`.

Management surface (all ADMIN, all draw from the `api` rate-limit budget):

| Method | Path                          | Purpose                                  |
| ------ | ----------------------------- | ---------------------------------------- |
| GET    | `/v1/webhooks`                | List endpoints for this tenant           |
| GET    | `/v1/webhooks/:id`            | Fetch one endpoint (list is searched)    |
| GET    | `/v1/webhooks/:id/deliveries` | Delivery ledger (latest 50)              |
| POST   | `/v1/webhooks/:id/test`       | Fire a synthetic event through the queue |

## Delivery payload and headers

Each delivery is a POST with JSON body and two Pezhwan-specific headers
(`webhook.service.ts` `deliver()`):

```
POST <url>
content-type: application/json
x-pezhwan-event: user.created
x-pezhwan-signature: <hex HMAC-SHA256>

{ "event": "user.created", "payload": { ... }, "timestamp": "2026-09-12T10:00:00.000Z" }
```

- `x-pezhwan-event` — the event name, for cheap routing without parsing.
- `x-pezhwan-signature` — `HMAC-SHA256(secret, rawBody)` as a lowercase hex
  digest.

## Verifying signatures

Recompute the digest over the **exact raw request body** (do not re-stringify)
and compare with the signature in constant time:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(secret, rawBody, signatureHeader) {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader ?? '');
  return a.length === b.length && timingSafeEqual(a, b);
}
```

Respond with a 2xx quickly; anything else (including 404) is treated as a
successful delivery so spurious 404s do not trigger retries
(`response.ok || response.status === 404`).

## Retries

- Attempts are recorded per delivery in `WebhookDelivery`
  (`packages/core/src/models/webhook-delivery.model.ts`).
- On a non-2xx status the delivery is retried with exponential backoff:
  `1s * 2^attempt` interval, up to `maxRetries` (default 5), then marked
  `failed`.
- Network/transport errors (timeouts, DNS, connection refused) are recorded in
  `lastError` and retried on the same schedule.
- Deliveries are **not** idempotent by payload — include an idempotency key
  derived from `event` + `timestamp` (or the included `payload` fields) on your
  side and deduplicate.

## Delivery status

`WebhookDelivery` fields: `webhookId`, `event`, `payload`, `status`
(`pending | delivered | failed | retrying`), `attempts`, `lastStatusCode`,
`lastError`, `nextAttemptAt`, `deliveredAt`. Read them with
`GET /v1/webhooks/:id/deliveries`.

## Testing

- `POST /v1/webhooks/:id/test` with `{ "event": "webhook.test", "payload": {...} }`
  dispatches the event to the endpoint and shows up in the delivery ledger —
  the fastest end-to-end check of URL reachability and signature verification.
- The CLI exposes the same surface:
  `pezhwan webhooks`, `pezhwan webhooks --id <id>`, and
  `pezhwan webhooks --create --url <url> --events user.created,session.revoked`
  (`packages/cli/src/commands/webhooks.ts`).
- A sample receiver script lives in the developer portal under the `WebhookTester`
  pattern used by the integration suite (`apps/developer-portal/src/components/WebhookTester.tsx`,
  `tests/integration/webhook-delivery.test.ts`).
