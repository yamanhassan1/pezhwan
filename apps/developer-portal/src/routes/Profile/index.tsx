import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import type { Session, User } from '../../types';

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function deviceLabel(device: Record<string, unknown>): string {
  if (!device) return 'Unknown device';
  const parts: string[] = [];
  if (typeof device.browser === 'string') parts.push(device.browser);
  if (typeof device.os === 'string') parts.push(device.os);
  if (typeof device.device === 'string') parts.push(device.device);
  return parts.length > 0 ? parts.join(' · ') : 'Unknown device';
}

export default function Profile() {
  const { user: authUser } = useAuth();
  const [user, setUser] = useState<User | null>(authUser);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<User>('/v1/users/me')
      .then(setUser)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, []);

  async function loadSessions() {
    try {
      const res = await api.get<{ sessions: Session[]; total: number }>(
        '/v1/admin/sessions?limit=100&offset=0',
      );
      setSessions(res.sessions);
      setSessionsTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    }
  }

  useEffect(() => {
    void loadSessions();
  }, []);

  async function revoke(session: Session) {
    setRevoking(session.id);
    setMessage(null);
    try {
      const res = await api.post<{ revoked: boolean }>(`/v1/admin/sessions/${session.id}/revoke`);
      setMessage(
        res.revoked ? `Session revoked (${deviceLabel(session.device)}).` : 'Revoke failed.',
      );
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke session');
    } finally {
      setRevoking(null);
    }
  }

  const activeCount = sessions.filter((s) => s.status === 'active' || s.status === 'ACTIVE').length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Profile</h1>
          <p className="page-desc">Your account details and active sessions.</p>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      {loading && !user ? (
        <div className="card" style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <span className="loader" />
        </div>
      ) : user ? (
        <>
          <div
            className="grid"
            style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr)', gap: 16 }}
          >
            <div className="card">
              <h3 className="mb-3">Account</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <span
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: 'var(--primary-soft)',
                    color: 'var(--primary)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 20,
                  }}
                >
                  {(user.email ?? 'U').slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <div style={{ fontWeight: 650, fontSize: 16 }}>{user.email}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {user.id}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span className="muted">Email</span>
                  <span style={{ fontWeight: 600, wordBreak: 'break-all', textAlign: 'right' }}>
                    {user.email}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span className="muted">Phone</span>
                  <span style={{ fontWeight: 600 }}>{user.phone || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span className="muted">Verified</span>
                  <span>
                    {user.emailVerified ? (
                      <span className="badge badge-success">Email verified</span>
                    ) : (
                      <span className="badge badge-warning">Email unverified</span>
                    )}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span className="muted">Status</span>
                  <span>
                    {user.isActive ? (
                      <span className="badge badge-success">Active</span>
                    ) : (
                      <span className="badge badge-danger">Inactive</span>
                    )}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span className="muted">Roles</span>
                  <span
                    style={{
                      display: 'flex',
                      gap: 5,
                      flexWrap: 'wrap',
                      justifyContent: 'flex-end',
                    }}
                  >
                    {user.roles.map((r) => (
                      <span key={r} className="badge badge-primary">
                        {r}
                      </span>
                    ))}
                  </span>
                </div>
              </div>
              <hr
                style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                <div>
                  <span className="muted">Tenant ID </span>
                  <span className="code">{user.tenantId}</span>
                </div>
                <div>
                  <span className="muted">Application ID </span>
                  <span className="code">{user.applicationId}</span>
                </div>
              </div>
            </div>

            <div className="card">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 14,
                }}
              >
                <h3>Active sessions</h3>
                <span className="badge badge-info">
                  {activeCount} active of {sessionsTotal}
                </span>
              </div>
              {sessions.length === 0 ? (
                <div className="empty">No sessions found.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {sessions.map((s) => {
                    const active = s.status === 'active' || s.status === 'ACTIVE';
                    return (
                      <div
                        key={s.id}
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: 10,
                          padding: '12px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              fontWeight: 600,
                              fontSize: 14,
                            }}
                          >
                            <span
                              className={`status-dot ${active ? 'status-dot-online' : 'status-dot-offline'}`}
                            />
                            <span className="text-ellipsis">{deviceLabel(s.device)}</span>
                          </div>
                          <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                            Last active {formatDate(s.lastActiveAt)} · {s.applicationId}
                          </div>
                        </div>
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}
                        >
                          <span className={`badge ${active ? 'badge-success' : 'badge'}`}>
                            {active ? 'active' : s.status}
                          </span>
                          {active && (
                            <button
                              className="btn btn-danger btn-sm"
                              disabled={revoking === s.id}
                              onClick={() => void revoke(s)}
                            >
                              {revoking === s.id ? '...' : 'Revoke'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
