import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../lib/api';
import { formatDate, shortId } from '../../lib/utils';
import type { Session } from '../../types';
import { toast } from '../../components/Layout/Layout';

const PAGE_SIZE = 25;

export default function SessionsList() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async (opts?: { status?: string; offset?: number }) => {
    setLoading(true);
    setError(null);
    const s = opts?.status ?? status;
    const o = opts?.offset ?? offset;
    const params = new URLSearchParams();
    if (s) params.set('status', s);
    params.set('limit', String(PAGE_SIZE));
    if (o) params.set('offset', String(o));
    try {
      const res = await apiGet<{ sessions: Session[]; total: number }>(
        `/v1/admin/sessions?${params.toString()}`,
      );
      setSessions(res.sessions);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const revoke = async (id: string) => {
    try {
      await apiPost(`/v1/admin/sessions/${id}/revoke`);
      toast.success('Session revoked');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div>
      <div className="page-header">
        <h1>Sessions</h1>
      </div>

      {error && (
        <div className="toast toast-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <select
          className="select"
          style={{ maxWidth: 180 }}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setOffset(0);
            load({ status: e.target.value, offset: 0 });
          }}
        >
          <option className="option" value="">
            All statuses
          </option>
          <option className="option" value="active">
            Active
          </option>
          <option className="option" value="revoked">
            Revoked
          </option>
          <option className="option" value="expired">
            Expired
          </option>
        </select>
      </div>

      <div className="card">
        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>User ID</th>
                  <th>Device</th>
                  <th>IP</th>
                  <th>Status</th>
                  <th>Last active</th>
                  <th>Expires</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <tr>
                    <td className="empty-state" colSpan={8}>
                      No sessions found
                    </td>
                  </tr>
                ) : (
                  sessions.map((s) => (
                    <tr key={s.id}>
                      <td title={s.id}>{shortId(s.id)}</td>
                      <td title={s.userId}>{shortId(s.userId)}</td>
                      <td>
                        {s.device?.deviceLabel ?? '---'}
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {s.device?.userAgent ? s.device.userAgent.slice(0, 40) : ''}
                        </div>
                      </td>
                      <td>{s.device?.ip ?? '---'}</td>
                      <td>
                        <span
                          className={`badge ${s.status === 'active' ? 'badge-green' : 'badge-red'}`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td>{formatDate(s.lastActiveAt)}</td>
                      <td>{formatDate(s.expiresAt)}</td>
                      <td>
                        {s.status === 'active' && (
                          <button className="btn btn-danger btn-sm" onClick={() => revoke(s.id)}>
                            Revoke
                          </button>
                        )}
                      </td>
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
            load({ status, offset: o });
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
            load({ status, offset: o });
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
