# Risk-based authentication and account takeover protection

Credential-based sign-in is only as strong as the least careful password it
accepts. Attackers don't break into most accounts by out-guessing them — they
**stuff stolen passwords**, **abuse leaked corpora**, or **automate login
forms** until one slips through. Risk-based authentication scores every login
against behavioral signals and makes the hard decision for you: allow,
challenge (step up to MFA), or block.

Pezhwan's account-takeover (ATO) stack lives in
`packages/core/src/services/security/`:

| Service          | File                         | Purpose                                                                         |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| Risk engine      | `risk.service.ts`            | Blends signals into a 0-100 score and an allow/challenge/block/monitor verdict. |
| Breach detection | `breach-detector.service.ts` | Checks passwords against known breach corpora and reacts to matches.            |
| HIBP integration | `hibp.service.ts`            | HaveIBeenPwned k-anonymity lookups with a local range cache.                    |
| Bot detection    | `bot-detector.service.ts`    | Detects automation with probabilistic scoring.                                  |
| Decoy users      | `decoy.service.ts`           | Honeypot accounts that trip security alerts on any attempted login.             |
| CAPTCHA          | `captcha.service.ts`         | Verifies hCaptcha, Cloudflare Turnstile, and reCAPTCHA tokens.                  |

## How the risk engine thinks

`assess(context)` is a pure function: you hand it what you know, it returns a
score plus the reasons, so the decision is auditable and explainable.

```ts
import { RiskService } from '@pezhwan/core';

const risk = new RiskService(tenantId, applicationId, audit);

const assessment = risk.assess({
  userId,
  ip,
  country: 'DE',
  latitude: 52.52,
  longitude: 13.4,
  loginVelocityMs, // time since this user's last sign-in
  breachedPassword: true, // a HIBP range hit for this password
  isTor: true,
  isProxy: false,
  botScore: 0.8,
  ipFailureCount: 6,
});
// → { score, verdict: 'challenge' | 'block' | 'allow', signals, requireMfa }
```

Weights are additive and capped at 100:

| Signal                | Weight   | Why it matters                                                               |
| --------------------- | -------- | ---------------------------------------------------------------------------- |
| Impossible travel     | up to 45 | >500 km within 6 h of a previous login is nearly uncompromisable by a human. |
| Breached password     | 60       | Anyone who already owns the password can sign in; force re-proof.            |
| Tor exit node         | 40       | Strong anonymity signal.                                                     |
| Proxy / VPN           | 25       | Neutral on its own, meaningful in combination.                               |
| Login velocity        | up to 35 | Rapid re-logins across locations are scripted.                               |
| IP failure reputation | up to 50 | 10+ recent failures from one IP is a stuffing pattern.                       |
| Bot behaviour         | 40       | Automation fingerprint on the request itself.                                |

Verdict thresholds: `challenge` at ≥ 40, `block` at ≥ 75. Any evidence of a
compromised password forces MFA even below the challenge threshold — the
account is demonstrably at risk, so the cost of an extra factor is justified.

### Recording and audit

`assessAndRecord(ctx)` runs the same scoring and also persists a `RiskEvent`
document (IP, geo, device, signals, verdict) so you can replay "why was THIS
login challenged?". Blocks additionally raise a critical audit event.

## Breach detection with HIBP

HaveIBeenPwned publishes the known password corpus. Pezhwan uses the
k-anonymity **range protocol**: the password is hashed with SHA-1, **only the
first five hex characters** leave your server, and the matching suffix list is
compared locally. Your full hash never reaches a third party.

```ts
const hibp = new HibpService({
  // The Range fetcher is injected so tests stay offline:
  rangeFetcher: createHibpRangeFetcher({ apiKey, userAgent: 'pezhwan' }),
});

const result = await hibp.isBreached(password);
// { breached: true, count: 34_521, prefix: 'da39a', cached: true }
```

Range responses are cached in the `BreachRecord` collection (24 h by default)
and reused on network failure, so the login path neither hammers HIBP nor
breaks when the network hiccups. `BreachDetectorService` sits on top: it
per-password rate-limits checks and turns a match into a risk-rule input.

**When not to check.** Never block on this in the hot path for every login —
check at registration and password _change_ (where the user can pick a better
one), and only opportunistically at login.

## Bot detection

`BotDetector.assess(input)` returns a 0-1 automation probability and a
`human | suspect | bot` verdict from presence of human interaction, automation
flags (`webdriver`, headless UAs), impossibly fast form fills, and repeated
submissions. Feed `botScore` into the risk engine rather than acting on the bot
verdict alone — a browser automation flag is a strong hint, not a conviction.

## Decoy users — the quiet tripwire

`DecoyService` manages honeypot accounts (`decoy-user.model.ts`) that look like
normal users but can never authenticate. Every attempt against a decoy is a
high-confidence intrusion signal:

```ts
const probe = await decoys.probe(tenantId, handle, ip);
if (probe.isDecoy) {
  // Respond slowly and always "wrong credentials", then let the alerting fire.
}
```

Pezhwan raises a **critical** audit event on first hit and every tenth after,
so a password-spray campaign sets off the alarm without drowning your pager in
per-attempt noise.

## CAPTCHA as a blunt second opinion

`CaptchaService.verify(token)` supports hCaptcha, Cloudflare Turnstile, and
reCAPTCHA through an injectable verifier. Treat a passed CAPTCHA as evidence,
not proof: it resets short-lived suspicion in the bot detector but doesn't
override a real breach match.

## Combining the layers

A pragmatic pipeline for a login request:

```text
request ──► bot.Detector.assess() ─► risk.assess({ botScore, ... })
            decoys.probe(tenant, handle) ─► critical event on hit
            captcha.verify(token) ─► risk input
            risk verdict:
              allow      ── proceed (optionally with Step-Up MFA when breached)
              challenge  ── require MFA / proof
              block      ── deny + audit + alert
```

Everything lands in `RiskEvent` + the audit log, so both product teams and
compliance reviewers can see the score, the signals, and the action for any
sign-in.

## Further reading

- Implementation: `packages/core/src/services/security/`
- Models: `risk-event.model.ts`, `breach-record.model.ts`, `decoy-user.model.ts`
- Express wiring: `packages/express/src/routes/` and
  `packages/core/src/middleware/risk.middleware.ts`
- React: `apps/admin-console` Security → Risk and Breaches screens
