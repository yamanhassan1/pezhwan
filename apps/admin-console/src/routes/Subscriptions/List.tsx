import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';
import type { SubChange } from '../../types';

function statusBadge(status: string) {
  const active = status === 'active' || status === 'trialing';
  return <span className={`badge ${active ? 'badge-green' : 'badge-red'}`}>{status}</span>;
}

export default function SubscriptionsList() {
  const [subscriptions, setSubscriptions] = useState<SubChange[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ subscriptions: SubChange[] }>('/v1/admin/subscriptions')
      .then((res) => setSubscriptions(res.subscriptions))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Subscriptions</h1>
      </div>

      {error && (
        <div className="toast toast-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : subscriptions.length === 0 ? (
          <div className="empty-state">No subscriptions</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Tenant ID</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Cancel at period end</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((s) => (
                  <tr key={s.tenantId}>
                    <td>{s.tenant}</td>
                    <td>{s.tenantId}</td>
                    <td>
                      <span className="badge badge-blue">{s.plan}</span>
                    </td>
                    <td>{statusBadge(s.status)}</td>
                    <td>
                      <span className={`badge ${s.cancelAtPeriodEnd ? 'badge-yellow' : ''}`}>
                        {s.cancelAtPeriodEnd ? 'yes' : 'no'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16 }}>
        Plan changes happen on the Tenants page in tenant editing.
      </p>
    </div>
  );
}
