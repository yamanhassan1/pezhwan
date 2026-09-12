import { type ReactNode } from 'react';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="card mb-4">
      <h2 style={{ marginBottom: 14 }}>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14.5, lineHeight: 1.65 }}>{children}</div>
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p style={{ margin: 0 }}>{children}</p>;
}

function Code({ children }: { children: ReactNode }) {
  return <code className="code">{children}</code>;
}

function CodeBlock({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div>
      {title && <span className="label">{title}</span>}
      <pre className="code-block" style={{ margin: 0, marginTop: title ? 6 : 0 }}>
        {children}
      </pre>
    </div>
  );
}

function H3({ children }: { children: ReactNode }) {
  return <h3 style={{ marginTop: 6 }}>{children}</h3>;
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 20 }}>
      {items.map((item, i) => (
        <li key={i} style={{ marginBottom: 4 }}>
          {item}
        </li>
      ))}
    </ul>
  );
}

const BASE_URL = `${(import.meta as unknown as { env: Record<string, string | undefined> }).env?.VITE_API_URL ?? ''}/v1`;

const TOC = [
  { id: 'base-url', label: 'Base URL' },
  { id: 'authentication', label: 'Authentication' },
  { id: 'oauth', label: 'OAuth endpoints' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'api-keys', label: 'API keys' },
  { id: 'rate-limits', label: 'Rate limits' },
  { id: 'errors', label: 'Errors envelope' },
];

export default function Docs() {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Documentation</h1>
          <p className="page-desc">Reference for the PEZHWAN v1 REST API.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '190px minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
        <nav style={{ position: 'sticky', top: 84, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {TOC.map((t) => (
            <a key={t.id} href={`#${t.id}`} style={{ padding: '6px 10px', fontSize: 13.5, color: 'var(--text-muted)', borderRadius: 6 }}>
              {t.label}
            </a>
          ))}
        </nav>

        <div>
          <Section id="base-url" title="Base URL">
            <P>
              All API requests are relative to <Code>{BASE_URL}</Code>. Requests and responses use the{' '}
              <Code>application/json</Code> content type. Every response uses the envelope shape:
            </P>
            <CodeBlock title="Response envelope">
              {`{
  "success": true,
  "data": { ... },
  "error": { "code": "...", "message": "..." }
}`}
            </CodeBlock>
            <P>
              A <Code>success: false</Code> envelope carries a machine-readable <Code>error.code</Code> and a
              human-readable <Code>error.message</Code>.
            </P>
          </Section>

          <Section id="authentication" title="Authentication">
            <P>
              Authentication happens in two steps. First fetch a CSRF token — this sets a same-site cookie and returns a
              token you must echo on POST requests to the auth endpoints:
            </P>
            <CodeBlock title="GET /v1/auth/csrf">
              {`{
  "success": true,
  "csrfToken": "abc123..."
}`}
            </CodeBlock>
            <P>Then authenticate with email and password:</P>
            <CodeBlock title="POST /v1/auth/login">
              {`POST ${BASE_URL}/auth/login
Content-Type: application/json
X-CSRF-Token: <csrfToken>

{ "email": "dev@acme.com", "password": "s3cret" }`}
            </CodeBlock>
            <P>On success the response returns an access token, a rotating refresh token, and an expiry window:</P>
            <CodeBlock title="200 OK">
              {`{
  "success": true,
  "data": {
    "mfaRequired": false,
    "user": { "id": "...", "email": "dev@acme.com", "roles": ["ADMIN"] },
    "tokens": {
      "accessToken": "eyJ...",
      "refreshToken": "eyJ...",
      "expiresIn": 900
    }
  }
}`}
            </CodeBlock>
            <H3>Using tokens</H3>
            <List
              items={[
                <>
                  Send <Code>Authorization: Bearer &lt;accessToken&gt;</Code> on every authenticated request.
                </>,
                <>
                  Refresh tokens rotate: exchanging a refresh token issues a <em>new</em> refresh token. Reusing an old
                  one triggers <Code>REFRESH_TOKEN_REUSE_DETECTED</Code> in the audit trail.
                </>,
                <>
                  Fetch the current profile with <Code>GET {BASE_URL}/users/me</Code>. An invalid or expired token returns{' '}
                  <Code>401 UNAUTHORIZED</Code>.
                </>,
              ]}
            />
            <P>
              The developer portal stores the access token in <Code>localStorage</Code> and hydrates the session on load;
              the API client clears the session and redirects to login on any <Code>401</Code>.
            </P>
          </Section>

          <Section id="oauth" title="OAuth endpoints">
            <P>
              PEZHWAN acts as both an authorization server and, for clients, exposes the standard OAuth 2.1 flows. The
              public discovery document is available at:
            </P>
            <CodeBlock title="Discovery">
              {`GET /.well-known/openid-configuration`}
            </CodeBlock>
            <List
              items={[
                <>
                  <Code>GET {BASE_URL}/oauth/authorize</Code> — authorization endpoint (supports Authorization Code with
                  PKCE).
                </>,
                <>
                  <Code>POST {BASE_URL}/oauth/token</Code> — token endpoint issuing access, refresh, and ID tokens.
                </>,
                <>
                  <Code>POST {BASE_URL}/oauth/revoke</Code> — revoke a refresh token.
                </>,
                <>
                  <Code>POST {BASE_URL}/oauth/introspect</Code> — validate an access token.
                </>,
              ]}
            />
            <P>
              Client authentication failures, PKCE failures, and redirect URI mismatches are all surfaced in the audit
              trail (<Code>OAUTH_CLIENT_AUTH_FAILED</Code>, <Code>OAUTH_PKCE_FAILED</Code>,{' '}
              <Code>OAUTH_REDIRECT_URI_MISMATCH</Code>).
            </P>
          </Section>

          <Section id="webhooks" title="Webhooks">
            <P>
              Webhooks deliver audit and security events to your endpoint over HTTPS. Each delivery includes a JSON body
              plus two signed headers:
            </P>
            <CodeBlock title="Delivery headers">
              {`X-Pezhwan-Signature: sha256=<hex digest>
X-Pezhwan-Timestamp: 1718000000`}
            </CodeBlock>
            <P>To verify a delivery, compute an HMAC-SHA256 over the raw request body and compare it:</P>
            <CodeBlock title="Signature verification">
              {`// timestamp + "." + rawBody, signed with the webhook secret
const digest = crypto
  .createHmac('sha256', webhookSecret)
  .update(\`\${timestamp}.\${rawBody}\`)
  .digest('hex');

const expected = \`sha256=\${digest}\`;
const received = req.headers['x-pezhwan-signature'];

if (crypto.timingSafeEqual(<Buffer>, expected)) { /* accept */ }`}
            </CodeBlock>
            <List
              items={[
                <>
                  The signing <em>secret is shown exactly once</em> at webhook creation and cannot be retrieved later.
                </>,
                <>
                  Failed deliveries are retried up to <Code>maxRetries</Code> times. Test a delivery anytime with{' '}
                  <Code>POST {BASE_URL}/admin/webhooks/:id/test</Code>.
                </>,
                <>
                  Event names follow the audit vocabulary: <Code>LOGIN_SUCCESS</Code>, <Code>SESSION_REVOKED</Code>,{' '}
                  <Code>API_KEY_CREATED</Code>, <Code>RATE_LIMITED</Code>, and more.
                </>,
              ]}
            />
          </Section>

          <Section id="api-keys" title="API keys">
            <P>
              Server-side API keys authenticate machine clients. Full keys begin with the <Code>pk_live_</Code> prefix;
              the API returns only the truncated <Code>prefix</Code> in listings.
            </P>
            <CodeBlock title="Management endpoints">
              {`GET    ${BASE_URL}/admin/api-keys           # list
POST   ${BASE_URL}/admin/api-keys           # create { name, scopes }
DELETE ${BASE_URL}/admin/api-keys/:id       # revoke`}
            </CodeBlock>
            <P>When creating a key, the API returns the full key exactly once:</P>
            <CodeBlock title="201 Created">
              {`{
  "success": true,
  "data": {
    "apiKey": { "id": "ak_...", "name": "gateway", "scopes": ["write"] },
    "rawKey": "pk_live_...",
    "prefix": "pk_live_..."
  }
}`}
            </CodeBlock>
            <List
              items={[
                <>
                  Keys are sent as <Code>Authorization: Bearer &lt;pk_live_...&gt;</Code>.
                </>,
                <>
                  Scopes restrict which operations a key may perform; leave <Code>scopes</Code> empty for full access.
                </>,
                <>
                  Authentication with a key is recorded in the audit trail as <Code>API_KEY_AUTHENTICATED</Code>.
                </>,
              ]}
            />
          </Section>

          <Section id="rate-limits" title="Rate limits">
            <List
              items={[
                <>
                  Per-IP and per-token rate limits are enforced on all endpoints. Exceeding a limit returns{' '}
                  <Code>429 TOO_MANY_REQUESTS</Code> and is logged as <Code>RATE_LIMITED</Code>.
                </>,
                <>
                  Auth endpoints (login, CSRF, token issuance) have stricter limits than read endpoints.
                </>,
                <>
                  Responses include <Code>X-RateLimit-Limit</Code>, <Code>X-RateLimit-Remaining</Code>, and{' '}
                  <Code>X-RateLimit-Reset</Code> headers when available.
                </>,
                <>
                  The API explorer in this portal sends real requests — treat repeated large batches with care.
                </>,
              ]}
            />
          </Section>

          <Section id="errors" title="Errors envelope">
            <P>Every failure is returned with HTTP semantics plus a consistent error shape:</P>
            <CodeBlock title="Error example">
              {`HTTP/1.1 400 Bad Request
{
  "success": false,
  "data": null,
  "error": {
    "code": "INVALID_LOGIN_CREDENTIALS",
    "message": "Email or password is incorrect"
  }
}`}
            </CodeBlock>
            <List
              items={[
                <>
                  <Code>400</Code> — malformed request or invalid payload (<Code>VALIDATION_FAILED</Code>,{' '}
                  <Code>INVALID_LOGIN_CREDENTIALS</Code>).
                </>,
                <>
                  <Code>401</Code> — missing/invalid credentials or token (<Code>UNAUTHORIZED</Code>).
                </>,
                <>
                  <Code>403</Code> — authenticated but not permitted (<Code>AUTHZ_DENIED</Code>).
                </>,
                <>
                  <Code>429</Code> — rate limited (<Code>RATE_LIMITED</Code>).
                </>,
                <>
                  <Code>5xx</Code> — upstream failure; the message is intentionally generic and the incident is recorded
                  server-side.
                </>,
              ]}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}