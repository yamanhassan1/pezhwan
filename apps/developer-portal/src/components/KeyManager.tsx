import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { ApiKey } from '../types';

type StatusFilter = 'all' | 'active' | 'revoked';

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function KeyManager({ statusFilter }: { statusFilter: StatusFilter }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ apiKeys: ApiKey[] }>('/v1/admin/api-keys');
      setKeys(res.apiKeys);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    switch (statusFilter) {
      case 'active':
        return keys.filter((k) => k.isActive);
      case 'revoked':
        return keys.filter((k) => !k.isActive);
      default:
        return keys;
    }
  }, [keys, statusFilter]);

  async function revoke(key: ApiKey) {
    setRevokingId(key.id);
    setMessage(null);
    try {
      await api.delete<{ revoked: boolean }>(`/v1/admin/api-keys/${key.id}`);
      setMessage(`API key "${key.name}" revoked.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke API key');
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="card mt-3">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <h3>API keys</h3>
        <button className="btn btn-secondary btn-sm" onClick={() => void load()} disabled={loading}>
          {loading ? <span className="loader" /> : 'Refresh'}
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      {loading && keys.length === 0 ? (
        <div className="empty">
          <span className="loader" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">No API keys match this filter.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Prefix</th>
                <th>Scopes</th>
                <th>Status</th>
                <th>Last used</th>
                <th>Created</th>
                <th>Revoked</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((key) => (
                <tr key={key.id}>
                  <td style={{ fontWeight: 600 }}>{key.name}</td>
                  <td>
                    <span className="code">{key.prefix}…</span>
                  </td>
                  <td>
                    {key.scopes.length > 0 ? (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 220 }}>
                        {key.scopes.map((s) => (
                          <span key={s} className="badge badge-info">
                            {s}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="muted">all</span>
                    )}
                  </td>
                  <td>
                    {key.isActive ? (
                      <span className="badge badge-success">active</span>
                    ) : (
                      <span className="badge badge-danger">revoked</span>
                    )}
                  </td>
                  <td className="muted">{formatDate(key.lastUsedAt)}</td>
                  <td className="muted">{formatDate(key.createdAt)}</td>
                  <td className="muted">{formatDate(key.revokedAt)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {key.isActive && (
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={revokingId === key.id}
                        onClick={() => void revoke(key)}
                      >
                        {revokingId === key.id ? '...' : 'Revoke'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
