import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';
import { formatDate } from '../../lib/utils';

interface RiskEvent {
  id?: string;
  score?: number;
  action?: string;
  attemptId?: string;
  ip?: string;
  country?: string;
  signals?: Array<Record<string, unknown>> | number;
  createdAt?: string;
  [key: string]: unknown;
}

function scoreColor(score: number): string {
  if (score >= 75) return 'var(--danger)';
  if (score >= 40) return 'var(--warning)';
  return 'var(--success)';
}

function signalCount(signals: RiskEvent['signals']): number {
  return typeof signals === 'number' ? signals : Array.isArray(signals) ? signals.length : 0;
}

export default function Risk() {
  const [riskEvents, setRiskEvents] = useState<RiskEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ riskEvents: RiskEvent[] }>('/v1/admin/security/risk')
      .then((res) => setRiskEvents(Array.isArray(res.riskEvents) ? res.riskEvents : []))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Risk Events</h1>
      </div>

      {error && (
        <div className="toast toast-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : riskEvents.length === 0 ? (
          <div className="empty-state">No risk events</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Score</th>
                  <th>Action</th>
                  <th>Attempt ID</th>
                  <th>IP</th>
                  <th>Country</th>
                  <th>Signals</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {riskEvents.map((r, i) => {
                  const score = Number(r.score ?? 0);
                  return (
                    <tr key={r.id ?? i}>
                      <td>
                        <span style={{ color: scoreColor(score), fontWeight: 600 }}>
                          {score}
                        </span>
                        <span className="score-bar">
                          <span
                            className="score-bar-fill"
                            style={{
                              width: `${Math.min(100, score)}%`,
                              background: scoreColor(score),
                              display: 'block',
                            }}
                          />
                        </span>
                      </td>
                      <td>{r.action ?? '---'}</td>
                      <td>
                        {r.attemptId ? (
                          <span title={String(r.attemptId)}>
                            {String(r.attemptId).slice(0, 12)}
                          </span>
                        ) : (
                          '---'
                        )}
                      </td>
                      <td>{r.ip ?? '---'}</td>
                      <td>{r.country ?? '---'}</td>
                      <td>{signalCount(r.signals)}</td>
                      <td>{formatDate(r.createdAt ?? null)}</td>
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