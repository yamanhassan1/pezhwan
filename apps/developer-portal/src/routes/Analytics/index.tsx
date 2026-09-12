import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import type { AuditLog } from '../../types';

interface Summary {
  total: number;
  uniqueUsers: number;
  topEvent: string;
  topCount: number;
}

interface EventCount {
  name: string;
  count: number;
}

interface DayCount {
  day: string;
  count: number;
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function last7Days(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(dayKey(d));
  }
  return out;
}

function toDayKey(iso: string): string {
  return dayKey(new Date(iso));
}

const DAYS = last7Days();

export default function Analytics() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<string>('all');

  useEffect(() => {
    api
      .get<{ auditLogs: AuditLog[] }>('/v1/admin/audit?limit=500')
      .then((res) => setLogs(res.auditLogs))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load audit logs'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (selectedEvent === 'all') return logs;
    return logs.filter((l) => l.eventType === selectedEvent);
  }, [logs, selectedEvent]);

  const eventTypes = useMemo(() => Array.from(new Set(logs.map((l) => l.eventType))).sort(), [logs]);

  const summary = useMemo<Summary>(() => {
    const byType = new Map<string, number>();
    const users = new Set<string>();
    for (const l of filtered) {
      byType.set(l.eventType, (byType.get(l.eventType) ?? 0) + 1);
      if (l.userId) users.add(l.userId);
    }
    let topEvent = '—';
    let topCount = 0;
    for (const [name, count] of byType.entries()) {
      if (count > topCount) {
        topEvent = name;
        topCount = count;
      }
    }
    return { total: filtered.length, uniqueUsers: users.size, topEvent, topCount };
  }, [filtered]);

  const byEvent = useMemo<EventCount[]>(() => {
    const byType = new Map<string, number>();
    for (const l of filtered) {
      byType.set(l.eventType, (byType.get(l.eventType) ?? 0) + 1);
    }
    return Array.from(byType.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [filtered]);

  const byDay = useMemo<DayCount[]>(() => {
    const counts = new Map<string, number>();
    for (const d of DAYS) counts.set(d, 0);
    for (const l of filtered) {
      const key = toDayKey(l.timestamp);
      if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return DAYS.map((day) => ({ day, count: counts.get(day) ?? 0 }));
  }, [filtered]);

  const maxEvent = Math.max(1, ...byEvent.map((e) => e.count));
  const maxDay = Math.max(1, ...byDay.map((d) => d.count));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-desc">Audit trail aggregated client-side from the last 500 events.</p>
        </div>
        <div className="page-actions">
          <label className="label" style={{ margin: 0 }}>
            Filter
          </label>
          <select className="select" value={selectedEvent} onChange={(e) => setSelectedEvent(e.target.value)}>
            <option value="all">All event types</option>
            {eventTypes.map((ev) => (
              <option key={ev} value={ev}>
                {ev}
              </option>
            ))}
          </select>
          <button
            className="btn btn-secondary"
            onClick={() => {
              void api
                .get<{ auditLogs: AuditLog[] }>('/v1/admin/audit?limit=500')
                .then((res) => setLogs(res.auditLogs))
                .catch((err) => setError(err instanceof Error ? err.message : 'Failed to reload'));
            }}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {loading && logs.length === 0 ? (
        <div className="card" style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <span className="loader" />
        </div>
      ) : (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <div className="card stat-card">
              <span className="stat-value">{summary.total.toLocaleString()}</span>
              <span className="stat-label">Total events</span>
            </div>
            <div className="card stat-card">
              <span className="stat-value">{summary.uniqueUsers.toLocaleString()}</span>
              <span className="stat-label">Unique users</span>
            </div>
            <div className="card stat-card">
              <span className="stat-value" style={{ fontSize: 20 }}>
                <span className="code" style={{ padding: '4px 8px' }}>
                  {summary.topEvent}
                </span>
              </span>
              <span className="stat-label">Top event ({summary.topCount.toLocaleString()})</span>
            </div>
          </div>

          <div className="grid mt-4" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16 }}>
            <div className="card">
              <h3 className="mb-3">Events by type (top 12)</h3>
              {byEvent.length === 0 ? (
                <div className="empty">No events in this selection.</div>
              ) : (
                byEvent.map((e) => (
                  <div className="bar-row" key={e.name}>
                    <span className="code text-ellipsis" title={e.name}>
                      {e.name}
                    </span>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${(e.count / maxEvent) * 100}%` }} />
                    </div>
                    <span className="muted" style={{ textAlign: 'right' }}>
                      {e.count}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="card">
              <h3 className="mb-3">Last 7 days</h3>
              {byDay.map((d) => (
                <div className="bar-row" key={d.day}>
                  <span className="muted text-ellipsis">{d.day}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${(d.count / maxDay) * 100}%` }} />
                  </div>
                  <span className="muted" style={{ textAlign: 'right' }}>
                    {d.count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card mt-4">
            <h3 className="mb-3">Latest events</h3>
            {filtered.length === 0 ? (
              <div className="empty">No audit events recorded.</div>
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: 380, overflowY: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Event</th>
                      <th>Severity</th>
                      <th>User</th>
                      <th>IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 100).map((l) => (
                      <tr key={l.id}>
                        <td className="muted">{new Date(l.timestamp).toLocaleString()}</td>
                        <td>
                          <span className="code">{l.eventType}</span>
                        </td>
                        <td>
                          <span className={`badge ${l.severity === 'high' ? 'badge-danger' : l.severity === 'medium' ? 'badge-warning' : 'badge-info'}`}>
                            {l.severity}
                          </span>
                        </td>
                        <td className="mono muted">{l.userId || '—'}</td>
                        <td className="mono muted">{l.ip || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}