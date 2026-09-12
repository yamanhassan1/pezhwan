import { useState } from 'react';
import { getAccessToken } from '../lib/api';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

const PRESETS: { label: string; path: string }[] = [
  { label: 'Me', path: '/v1/users/me' },
  { label: 'Stats', path: '/v1/admin/stats' },
  { label: 'API keys', path: '/v1/admin/api-keys' },
  { label: 'Webhooks', path: '/v1/admin/webhooks' },
  { label: 'Audit', path: '/v1/admin/audit' },
  { label: 'Risk', path: '/v1/admin/security/risk' },
  { label: 'Roles', path: '/v1/admin/roles' },
  { label: 'OpenID', path: '/.well-known/openid-configuration' },
];

interface ResponseState {
  status: number;
  ok: boolean;
  body: string;
  ms: number;
}

function methodColor(method: Method): string {
  switch (method) {
    case 'GET':
      return 'var(--success)';
    case 'POST':
      return 'var(--info)';
    case 'PATCH':
      return 'var(--warning)';
    case 'DELETE':
      return 'var(--danger)';
  }
}

export default function ApiExplorer() {
  const [method, setMethod] = useState<Method>('GET');
  const [path, setPath] = useState('/v1/admin/stats');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<ResponseState | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  const base: string = (import.meta as unknown as { env: Record<string, string | undefined> }).env?.VITE_API_URL ?? '';

  const needsBody = method !== 'GET';

  async function send() {
    if (!path) return;
    setSending(true);
    setError(null);
    const started = performance.now();
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = getAccessToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`${base}${path}`, {
        method,
        headers,
        body: needsBody && body.trim() ? body : undefined,
        credentials: 'include',
      });
      const text = await res.text();
      let pretty: string;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        pretty = text;
      }
      const ms = Math.round(performance.now() - started);
      setResponse({ status: res.status, ok: res.ok, body: pretty, ms });
      setHistory((h) => [LABEL(method, path), ...h].slice(0, 8));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">API Explorer</h1>
          <p className="page-desc">Build a request against the PEZHWAN v1 API. Your access token is attached automatically.</p>
        </div>
      </div>

      {error && <div className="alert alert-danger mb-4">{error}</div>}

      <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 16 }}>
        <div className="card">
          <h3 className="mb-2">Request</h3>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            {PRESETS.map((p) => (
              <button key={p.path} className="btn btn-secondary btn-sm" onClick={() => setPath(p.path)}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="mb-3">
            <span className="label">Authentication</span>
            <div className="hint" style={{ marginTop: 0 }}>
              Authorization header: <span className="code">Bearer {getAccessToken() ? '••••••••••••' : '(not signed in)'}</span>{' '}
              {getAccessToken() ? '(attached automatically)' : ''}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="label">Method</span>
              <select className="select" style={{ height: 41, minWidth: 100, fontWeight: 700, color: methodColor(method) }} value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="label">Path</span>
              <input
                className="input"
                style={{ fontFamily: 'var(--mono)', height: 41 }}
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/v1/admin/stats"
                spellCheck={false}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'flex-end' }}>
              <button className="btn btn-lg" onClick={send} disabled={sending} style={{ height: 41 }}>
                {sending ? <span className="loader" style={{ borderColor: 'rgba(255,255,255,0.4)', borderTopColor: '#fff' }} /> : 'Send'}
              </button>
            </div>
          </div>

          {needsBody && (
            <div className="mt-3">
              <span className="label">Request body (JSON)</span>
              <textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} placeholder='{\n  "name": "ant",
  "scopes": ["read", "write"]
}' spellCheck={false} />
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3>Response</h3>
            {response && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className={`badge ${response.ok ? 'badge-success' : 'badge-danger'}`}>
                  {response.status}
                </span>
                <span className="badge">{response.ms} ms</span>
              </div>
            )}
          </div>
          {response ? (
            <pre className="code-block" style={{ maxHeight: 480, overflow: 'auto' }}>{response.body}</pre>
          ) : (
            <div className="empty" style={{ border: '1px dashed var(--border)', borderRadius: 8 }}>
              Send a request to see the response envelope here.
            </div>
          )}

          {history.length > 0 && (
            <div className="mt-3">
              <span className="label">Recent requests</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {history.map((h) => (
                  <span key={h} className="badge">
                    {h}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LABEL(method: Method, path: string): string {
  return `${method} ${path}`;
}