import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import WebhookTester from '../../components/WebhookTester';
import type { Webhook } from '../../types';

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function WebhooksList() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState<Webhook | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ webhooks: Webhook[] }>('/v1/admin/webhooks');
      setWebhooks(res.webhooks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load webhooks');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Webhooks</h1>
          <p className="page-desc">Deliver audit and security events to your endpoint, signed with HMAC-SHA256.</p>
        </div>
        <div className="page-actions">
          <Link className="btn" to="/webhooks/create">
            Create webhook
          </Link>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card mt-3">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3>Endpoints</h3>
          <button className="btn btn-secondary btn-sm" onClick={() => void load()} disabled={loading}>
            {loading ? <span className="loader" /> : 'Refresh'}
          </button>
        </div>

        {loading && webhooks.length === 0 ? (
          <div className="empty">
            <span className="loader" />
          </div>
        ) : webhooks.length === 0 ? (
          <div className="empty">No webhooks configured yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>URL</th>
                  <th>Events</th>
                  <th>Status</th>
                  <th>Max retries</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map((w) => (
                  <tr key={w.id}>
                    <td style={{ maxWidth: 280 }}>
                      <span className="code text-ellipsis" style={{ display: 'inline-block', maxWidth: '100%' }}>
                        {w.url}
                      </span>
                    </td>
                    <td>
                      {w.events.length > 0 ? (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 240 }}>
                          {w.events.length <= 3 ? (
                            w.events.map((ev) => (
                              <span key={ev} className="badge badge-info">
                                {ev}
                              </span>
                            ))
                          ) : (
                            <span className="badge badge-info">
                              {w.events.length} events
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="badge">all</span>
                      )}
                    </td>
                    <td>
                      {w.active ? (
                        <span className="badge badge-success">active</span>
                      ) : (
                        <span className="badge badge-danger">disabled</span>
                      )}
                    </td>
                    <td>{w.maxRetries}</td>
                    <td className="muted">{formatDate(w.createdAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setTesting(w)}>
                        Test
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {testing && <WebhookTester webhook={testing} onClose={() => setTesting(null)} />}
    </div>
  );
}