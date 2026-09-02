# Rate limiting

Authentication, token, password reset, MFA, OAuth, and administrative
endpoints use bounded rate limits keyed by the appropriate combination of
subject, client, tenant, and network source. Limits fail closed for the
protected operation when the authoritative limiter is unavailable; Redis
degradation is observable and must not create an unbounded in-memory store.

Every limit has a documented window, threshold, response, and alert. Verify
that successful requests recover normally, burst traffic is bounded, and
limits cannot be bypassed by changing case, forwarded headers, or identifiers.
