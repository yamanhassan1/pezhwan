import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import type { CreateApiKeyResponse } from '../../types';

export default function ApiKeysCreate() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [scopesText, setScopesText] = useState('');
  const [expiryDays, setExpiryDays] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateApiKeyResponse | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const scopes = scopesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const body: { name: string; scopes: string[]; expiresIn?: number } = {
        name: name.trim(),
        scopes,
      };
      const days = Number(expiryDays);
      if (expiryDays.trim() !== '' && Number.isFinite(days) && days > 0) {
        body.expiresIn = Math.round(days * 86400);
      }
      const res = await api.post<CreateApiKeyResponse>('/v1/admin/api-keys', body);
      setCreated(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create API key');
    } finally {
      setSubmitting(false);
    }
  }

  async function copyKey() {
    if (!created) return;
    await navigator.clipboard.writeText(created.rawKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="page">
      <div className="breadcrumb">
        <Link to="/api-keys">API keys</Link> / <span>Create</span>
      </div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Create API key</h1>
          <p className="page-desc">Generate a server-side key with a scoped permission set.</p>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {created ? (
        <div className="card">
          <div className="alert alert-danger" style={{ fontWeight: 600, fontSize: 15 }}>
            Store this key now — you will not see it again.
          </div>
          <span className="label">Full key</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
            <code
              className="code"
              style={{ flex: 1, padding: '10px 12px', fontSize: 13, wordBreak: 'break-all' }}
            >
              {created.rawKey}
            </code>
            <button className="btn" onClick={() => void copyKey()}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span className="badge badge-info">ID: {created.apiKey.id}</span>
            <span className="badge">prefix: {created.prefix}…</span>
            {created.apiKey.scopes.length > 0 ? (
              created.apiKey.scopes.map((s) => (
                <span key={s} className="badge badge-primary">
                  {s}
                </span>
              ))
            ) : (
              <span className="badge">all scopes</span>
            )}
          </div>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => navigate('/api-keys')}>
              Back to API keys
            </button>
            <Link className="btn" to="/api-keys/create">
              Create another
            </Link>
          </div>
        </div>
      ) : (
        <form className="card" style={{ maxWidth: 620 }} onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="label" htmlFor="key-name">
              Name
            </label>
            <input
              id="key-name"
              className="input"
              value={name}
              required
              onChange={(e) => setName(e.target.value)}
              placeholder="Production gateway key"
            />
            <p className="hint">A human-readable label to identify this key.</p>
          </div>

          <div className="mb-3">
            <label className="label" htmlFor="key-scopes">
              Scopes
            </label>
            <input
              id="key-scopes"
              className="input"
              value={scopesText}
              onChange={(e) => setScopesText(e.target.value)}
              placeholder="read, write, admin"
              spellCheck={false}
            />
            <p className="hint">Comma-separated. Leave empty for all scopes.</p>
          </div>

          <div className="mb-4">
            <label className="label" htmlFor="key-expiry">
              Optional expiry (days)
            </label>
            <input
              id="key-expiry"
              className="input"
              type="number"
              min="1"
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)}
              placeholder="Never expires"
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-lg" disabled={submitting}>
              {submitting ? (
                <span
                  className="loader"
                  style={{ borderColor: 'rgba(255,255,255,0.4)', borderTopColor: '#fff' }}
                />
              ) : (
                'Create key'
              )}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-lg"
              onClick={() => navigate('/api-keys')}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
