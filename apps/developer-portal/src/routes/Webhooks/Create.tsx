import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { AUDIT_EVENTS } from '../../types';
import type { Webhook } from '../../types';

interface CreateResponse {
  webhook: Webhook;
}

export default function WebhooksCreate() {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [useDefaultAudit, setUseDefaultAudit] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Webhook | null>(null);
  const [copied, setCopied] = useState(false);

  function toggle(code: string) {
    setSelected((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const events = useDefaultAudit ? ['*'] : selected;
      const res = await api.post<CreateResponse>('/v1/admin/webhooks', { url: url.trim(), events });
      setCreated(res.webhook);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create webhook');
    } finally {
      setSubmitting(false);
    }
  }

  async function copySecret() {
    if (!created?.secret) return;
    await navigator.clipboard.writeText(created.secret);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  if (created) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Webhook created</h1>
            <p className="page-desc">{created.url}</p>
          </div>
        </div>
        <div className="card" style={{ maxWidth: 640 }}>
          <div className="alert alert-danger" style={{ fontWeight: 600 }}>
            Copy the signing secret now — it is shown only once.
          </div>
          <span className="label">Signing secret</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
            <code
              className="code"
              style={{ flex: 1, padding: '10px 12px', fontSize: 13, wordBreak: 'break-all' }}
            >
              {created.secret}
            </code>
            <button className="btn" onClick={() => void copySecret()}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span className="badge badge-info">ID: {created.id}</span>
            <span className="badge badge-success">max retries: {created.maxRetries}</span>
            <span className="badge">{created.active ? 'active' : 'inactive'}</span>
          </div>
          {created.events.length > 0 && (
            <div className="mt-3" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {created.events.map((ev) => (
                <span key={ev} className="badge badge-primary">
                  {ev}
                </span>
              ))}
            </div>
          )}
          <div className="mt-4">
            <p className="hint mb-2">
              Signature header: <span className="code">X-Pezhwan-Signature</span> ={' '}
              <span className="code">HMAC-SHA256(secret, timestamp + "." + body)</span> hex digest.
            </p>
            <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
              <button className="btn btn-secondary" onClick={() => navigate('/webhooks')}>
                Back to webhooks
              </button>
              <button className="btn" onClick={() => navigate('/webhooks/create')}>
                Create another
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="breadcrumb">
        <Link to="/webhooks">Webhooks</Link> / <span>Create</span>
      </div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Create webhook</h1>
          <p className="page-desc">Subscribe an endpoint to PEZHWAN audit events.</p>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <form className="card" style={{ maxWidth: 720 }} onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="label" htmlFor="wh-url">
            Endpoint URL
          </label>
          <input
            id="wh-url"
            className="input"
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.example.com/webhooks/pezhwan"
          />
          <p className="hint">Must be HTTPS. The server retries automatically on failure.</p>
        </div>

        <div className="mb-2">
          <span className="label">Event subscriptions</span>
          <label
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              marginBottom: 10,
              fontSize: 14,
            }}
          >
            <input
              type="checkbox"
              checked={useDefaultAudit}
              onChange={(e) => setUseDefaultAudit(e.target.checked)}
            />
            All audit events (recommended)
          </label>
        </div>

        {useDefaultAudit ? (
          <p className="hint mb-4">
            The webhook will receive every event in the audit trail (login, session, API key, OAuth,
            MFA, security events). Recipients send <span className="code">AUTHZ_DENIED</span> style
            names in the <span className="code">eventType</span> field.
          </p>
        ) : (
          <>
            <p className="hint mb-3">Select individual event types:</p>
            <div
              style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}
              className="mb-4"
            >
              {AUDIT_EVENTS.map((ev) => {
                const checked = selected.includes(ev);
                return (
                  <button
                    key={ev}
                    type="button"
                    onClick={() => toggle(ev)}
                    className={`badge ${checked ? 'badge-primary' : ''}`}
                    style={{
                      cursor: 'pointer',
                      border: '1px solid var(--border)',
                      background: checked ? undefined : 'var(--surface)',
                      color: checked ? undefined : 'var(--text-muted)',
                      padding: '6px 12px',
                    }}
                  >
                    {ev}
                  </button>
                );
              })}
            </div>
            {selected.length === 0 && (
              <p className="hint mb-4">
                No events selected — the webhook will receive nothing until you subscribe.
              </p>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="submit" className="btn btn-lg" disabled={submitting}>
            {submitting ? (
              <span
                className="loader"
                style={{ borderColor: 'rgba(255,255,255,0.4)', borderTopColor: '#fff' }}
              />
            ) : (
              'Create webhook'
            )}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-lg"
            onClick={() => navigate('/webhooks')}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
