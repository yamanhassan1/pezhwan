import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../lib/api';
import type { Stats } from '../types';
import AuditChart from '../components/Charts/AuditChart';
import { formatDate } from '../lib/utils';

const QUICK_LINKS = [
  { to: '/users/create', label: 'Create user' },
  { to: '/tenants/create', label: 'Create tenant' },
  { to: '/clients/create', label: 'Register OAuth client' },
  { to: '/audit', label: 'View audit log' },
  { to: '/security/risk', label: 'Review risk events' },
];

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= 75) return 'var(--danger)';
  if (score >= 40) return 'var(--warning)';
  return 'var(--success)';
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<Stats>('/v1/admin/stats');
      setStats(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const chartData = useMemo(() => {
    const days: Array<{ label: string; count: number }> = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const label = d.toLocaleDateString(undefined, { weekday: 'short' });
      const key = d.toISOString().slice(0, 10);
      const filteredRisk = (stats?.risk ?? []).filter(
        (r) => String(r.createdAt ?? '').slice(0, 10) === key,
      ).length;
      days.push({
        label,
        count: i === 0 && stats ? stats.auditToday : filteredRisk,
      });
    }
    return days;
  }, [stats]);

  if (loading && !stats) {
    return <div className="card">Loading dashboard...</div>;
  }

  if (error) {
    return (
      <div className="card">
        <div className="toast toast-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
        <button className="btn btn-ghost" onClick={() => load()}>
          Retry
        </button>
      </div>
    );
  }

  if (!stats) return null;

  const cards: Array<{ label: string; value: number }> = [
    { label: 'Users', value: stats.users },
    { label: 'Tenants', value: stats.tenants },
    { label: 'Active sessions', value: stats.activeSessions },
    { label: 'API keys', value: stats.apiKeys },
    { label: 'OAuth clients', value: stats.oauthClients },
    { label: 'Webhooks', value: stats.webhooks },
    { label: 'Signups (24h)', value: stats.signups24h },
    { label: 'Failed logins (24h)', value: stats.failedLogins24h },
    { label: 'Audit events (today)', value: stats.auditToday },
    { label: 'Breaches', value: stats.breaches },
    { label: 'Risk events (24h)', value: stats.riskEvents },
  ];

  const riskRows = Array.isArray(stats.risk) ? stats.risk : [];

  return (
    <div>
      <div className="page-header">
        <h1>Overview</h1>
        <Link to="/audit" className="btn btn-ghost btn-sm">
          Full audit log
        </Link>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 12,
          marginBottom: 20,
        }}
      >
        {cards.map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} />
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 24 }}>7-day activity</h3>
          <AuditChart data={chartData} />
        </div>
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 16 }}>Recent risk events</h3>
          {riskRows.length === 0 ? (
            <div className="empty-state">No recent risk events</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Score</th>
                    <th>Action</th>
                    <th>IP</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {riskRows.map((r, i) => {
                    const score = Number(r.score ?? 0);
                    return (
                      <tr key={i}>
                        <td>
                          <span className="badge" style={{ color: scoreColor(score) }}>
                            {score}
                          </span>
                        </td>
                        <td>{String(r.action ?? '---')}</td>
                        <td>{String(r.ip ?? '---')}</td>
                        <td>{formatDate(String(r.createdAt ?? ''))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 16 }}>Quick links</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {QUICK_LINKS.map((ql) => (
            <Link key={ql.to} to={ql.to} className="btn btn-ghost btn-sm">
              {ql.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
