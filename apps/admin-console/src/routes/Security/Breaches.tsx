import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';
import { formatDate } from '../../lib/utils';

interface BreachRow {
  id?: string;
  email?: string;
  source?: string;
  type?: string;
  detail?: string;
  severity?: string;
  createdAt?: string;
  [key: string]: unknown;
}

const KNOWN_KEYS = ['id', 'email', 'source', 'type', 'detail', 'severity', 'createdAt'];

export default function Breaches() {
  const [breaches, setBreaches] = useState<BreachRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ breaches: BreachRow[] }>('/v1/admin/security/breaches')
      .then((res) => setBreaches(Array.isArray(res.breaches) ? res.breaches : []))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Security Breaches</h1>
      </div>

      {error && (
        <div className="toast toast-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : breaches.length === 0 ? (
          <div className="empty-state">No breach records</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Email</th>
                  <th>Source</th>
                  <th>Type</th>
                  <th>Detail</th>
                  <th>Severity</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {breaches.map((b, i) => {
                  const hasKnownShape = KNOWN_KEYS.some((k) => b[k] !== undefined);
                  if (!hasKnownShape) {
                    return (
                      <tr key={i}>
                        <td colSpan={7}>
                          <pre
                            style={{
                              fontSize: 11,
                              whiteSpace: 'pre-wrap',
                              maxHeight: 120,
                              overflow: 'auto',
                              color: 'var(--text-secondary)',
                              fontFamily: 'monospace',
                              margin: 0,
                            }}
                          >
                            {JSON.stringify(b, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={b.id ?? i}>
                      <td>{b.id ? String(b.id).slice(0, 10) : '---'}</td>
                      <td>{b.email ?? '---'}</td>
                      <td>{b.source ?? '---'}</td>
                      <td>{b.type ?? '---'}</td>
                      <td>{b.detail ?? '---'}</td>
                      <td>
                        <span
                          className={`badge ${
                            b.severity === 'critical' || b.severity === 'high'
                              ? 'badge-red'
                              : b.severity === 'medium'
                                ? 'badge-yellow'
                                : ''
                          }`}
                        >
                          {b.severity ?? '---'}
                        </span>
                      </td>
                      <td>{formatDate(b.createdAt ?? null)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}