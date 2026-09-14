import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';
import { AUDIT_EVENT_NAMES, SEVERITY_NAMES } from '../../lib/auditEvents';
import { formatDate, truncate } from '../../lib/utils';
import type { AuditEntry } from '../../types';

const PAGE_SIZE = 25;

function severityBadge(severity: string) {
  const cls =
    severity === 'critical' || severity === 'high'
      ? 'badge-red'
      : severity === 'medium'
        ? 'badge-yellow'
        : severity === 'low'
          ? 'badge-blue'
          : '';
  return <span className={`badge ${cls}`}>{severity}</span>;
}

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [eventType, setEventType] = useState('');
  const [severity, setSeverity] = useState('');
  const [userId, setUserId] = useState('');
  const [offset, setOffset] = useState(0);
  const [chainHead, setChainHead] = useState<number | string | null>(null);
  const [chainRootVerified, setChainRootVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async (opts?: {
    eventType?: string;
    severity?: string;
    userId?: string;
    offset?: number;
  }) => {
    setLoading(true);
    setError(null);
    const e = opts?.eventType ?? eventType;
    const s = opts?.severity ?? severity;
    const u = opts?.userId ?? userId;
    const o = opts?.offset ?? offset;
    const params = new URLSearchParams();
    if (e) params.set('eventType', e);
    if (s) params.set('severity', s);
    if (u) params.set('userId', u);
    params.set('limit', String(PAGE_SIZE));
    if (o) params.set('offset', String(o));
    try {
      const res = await apiGet<{
        auditLogs: AuditEntry[];
        total: number;
        chainHead: number | string | null;
        chainRootVerified: boolean;
      }>(`/v1/admin/audit?${params.toString()}`);
      setLogs(res.auditLogs);
      setTotal(res.total);
      setChainHead(res.chainHead);
      setChainRootVerified(res.chainRootVerified);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div>
      <div className="page-header">
        <h1>Audit Log</h1>
      </div>

      {chainHead !== null && (
        <div className="card" style={{ marginBottom: 16, padding: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Tamper-resistant chain: head sequence{' '}
            <span className="badge badge-blue">{String(chainHead)}</span> - root verified:{' '}
            <span className={`badge ${chainRootVerified ? 'badge-green' : 'badge-red'}`}>
              {chainRootVerified ? 'true' : 'false'}
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="toast toast-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select
          className="select"
          style={{ maxWidth: 260 }}
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
        >
          <option className="option" value="">
            All event types
          </option>
          {AUDIT_EVENT_NAMES.map((n) => (
            <option className="option" key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select
          className="select"
          style={{ maxWidth: 140 }}
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
        >
          <option className="option" value="">
            All severities
          </option>
          {SEVERITY_NAMES.map((s) => (
            <option className="option" key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          className="input"
          style={{ maxWidth: 180 }}
          placeholder="User id"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
        <button
          className="btn btn-primary"
          onClick={() => {
            setOffset(0);
            load({ eventType, severity, userId, offset: 0 });
          }}
        >
          Apply
        </button>
      </div>

      <div className="card">
        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Event</th>
                  <th>Severity</th>
                  <th>User ID</th>
                  <th>IP</th>
                  <th>User agent</th>
                  <th>Seq</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td className="empty-state" colSpan={7}>
                      No audit entries match the filters
                    </td>
                  </tr>
                ) : (
                  logs.map((l) => (
                    <tr key={l.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(l.timestamp)}</td>
                      <td>
                        <span className="badge badge-blue" title={l.eventType}>
                          {l.eventType}
                        </span>
                      </td>
                      <td>{severityBadge(l.severity)}</td>
                      <td>
                        {l.userId ? (
                          <span title={l.userId}>{l.userId.slice(0, 10)}...</span>
                        ) : (
                          '---'
                        )}
                      </td>
                      <td>{l.ip ?? '---'}</td>
                      <td>{truncate(l.userAgent, 40)}</td>
                      <td>{l.sequence ?? '---'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="pagination">
        <span>
          {total} total - page {currentPage} of {totalPages}
        </span>
        <button
          className="btn btn-ghost btn-sm"
          disabled={offset === 0}
          onClick={() => {
            const o = Math.max(0, offset - PAGE_SIZE);
            setOffset(o);
            load({ eventType, severity, userId, offset: o });
          }}
        >
          Prev
        </button>
        <button
          className="btn btn-ghost btn-sm"
          disabled={currentPage >= totalPages}
          onClick={() => {
            const o = offset + PAGE_SIZE;
            setOffset(o);
            load({ eventType, severity, userId, offset: o });
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
