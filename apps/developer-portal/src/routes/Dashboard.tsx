import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { AdminStats, RiskEvent } from '../types';

interface StatItem {
  label: string;
  value: number;
  hint?: string;
}

function StatCard({ item }: { item: StatItem }) {
  return (
    <div className="card stat-card">
      <span className="stat-value">{item.value.toLocaleString()}</span>
      <span className="stat-label">{item.label}</span>
      {item.hint && (
        <span className="muted" style={{ fontSize: 12 }}>
          {item.hint}
        </span>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AdminStats>('/v1/admin/stats')
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load stats'))
      .finally(() => setLoading(false));
  }, []);

  const cards: StatItem[] = stats
    ? [
        { label: 'API keys', value: stats.apiKeys },
        { label: 'Webhooks', value: stats.webhooks },
        { label: 'Active sessions', value: stats.activeSessions },
        { label: 'OAuth clients', value: stats.oauthClients },
        { label: 'Signups (24h)', value: stats.signups24h },
        { label: 'Failed logins (24h)', value: stats.failedLogins24h },
      ]
    : [];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-desc">Operational overview of your PEZHWAN workspace.</p>
        </div>
        <div className="page-actions">
          <Link className="btn" to="/explorer">
            Try the API
          </Link>
          <Link className="btn btn-secondary" to="/docs">
            Read the docs
          </Link>
        </div>
      </div>

      {error && <div className="alert alert-danger mb-4">{error}</div>}

      {loading && !stats ? (
        <div className="card" style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <span className="loader" />
        </div>
      ) : (
        <>
          <div
            className="grid grid-3 mb-4"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}
          >
            {cards.map((item) => (
              <StatCard key={item.label} item={item} />
            ))}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)',
              gap: 16,
            }}
          >
            <div className="card">
              <h3 className="mb-3">Recent risk events</h3>
              {!stats || stats.risk.length === 0 ? (
                <div className="empty">No recent risk events.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Score</th>
                        <th>Action</th>
                        <th>Attempt</th>
                        <th>IP</th>
                        <th>Country</th>
                        <th>When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.risk.slice(0, 8).map((r: RiskEvent) => (
                        <tr key={r.attemptId}>
                          <td>
                            <span
                              className={`badge ${r.score >= 70 ? 'badge-danger' : r.score >= 40 ? 'badge-warning' : 'badge-success'}`}
                            >
                              {r.score}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }}>{r.action}</td>
                          <td>
                            <span className="code">{r.attemptId}</span>
                          </td>
                          <td className="mono muted">{r.ip ?? '—'}</td>
                          <td>{r.country ?? '—'}</td>
                          <td className="muted">{new Date(r.createdAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card">
              <h3 className="mb-3">Health</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span className="muted">Users</span>
                  <strong>{stats?.users.toLocaleString()}</strong>
                </div>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span className="muted">Tenants</span>
                  <strong>{stats?.tenants.toLocaleString()}</strong>
                </div>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span className="muted">Audit events today</span>
                  <strong>{stats?.auditToday.toLocaleString()}</strong>
                </div>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span className="muted">Breaches</span>
                  <strong>{stats?.breaches.toLocaleString()}</strong>
                </div>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span className="muted">Open risk events</span>
                  <strong>{stats?.riskEvents.toLocaleString()}</strong>
                </div>
              </div>
              <div className="mt-4">
                <Link className="btn btn-secondary" to="/analytics" style={{ width: '100%' }}>
                  Open analytics
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
