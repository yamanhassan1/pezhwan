import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api';
import { formatDate } from '../../lib/utils';
import type { Role, Session, User } from '../../types';
import { toast } from '../../components/Layout/Layout';

type Tab = 'permissions' | 'sessions';

export default function UsersDetails() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tab, setTab] = useState<Tab>('permissions');
  const [roleSelect, setRoleSelect] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [userRes, permsRes, sessionsRes] = await Promise.all([
        apiGet<{ user: User }>(`/v1/admin/users/${id}`),
        apiGet<{ permissions: string[] }>(`/v1/admin/users/${id}/permissions`).catch(() => ({
          permissions: [] as string[],
        })),
        apiGet<{ sessions: Session[] }>('/v1/admin/sessions?limit=100&offset=0').catch(() => ({
          sessions: [] as Session[],
        })),
      ]);
      setUser(userRes.user);
      setPermissions(permsRes.permissions);
      setSessions(sessionsRes.sessions.filter((s) => s.userId === id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    apiGet<{ roles: Role[] }>('/v1/admin/roles')
      .then((res) => setAvailableRoles(res.roles))
      .catch(() => undefined);
    load();
  }, [id]);

  if (loading && !user) {
    return <div className="card">Loading user...</div>;
  }

  if (error && !user) {
    return (
      <div className="card">
        <div className="toast toast-error">{error}</div>
        <Link to="/users" className="btn btn-ghost" style={{ marginTop: 12 }}>
          Back to users
        </Link>
      </div>
    );
  }

  if (!user) return null;

  const assignRole = async () => {
    if (!roleSelect || !id) return;
    try {
      await apiPost('/v1/admin/roles/assign', { userId: id, roleName: roleSelect });
      toast.success(`Role ${roleSelect} assigned`);
      setRoleSelect('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const removeRole = async (roleName: string) => {
    if (!id) return;
    try {
      await apiPost('/v1/admin/roles/remove', { userId: id, roleName });
      toast.success(`Role ${roleName} removed`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleActive = async () => {
    if (!id) return;
    try {
      if (user.isActive) {
        await apiDelete<{ deactivated: boolean }>(`/v1/admin/users/${id}`);
      } else {
        await apiPatch(`/v1/admin/users/${id}`, { isActive: true });
      }
      toast.success(user.isActive ? 'User deactivated' : 'User reactivated');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const unassignedRoles = availableRoles.filter((r) => !user.roles.includes(r.name));

  return (
    <div>
      <div className="page-header">
        <h1>{user.email ?? user.phone ?? user.id}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/users" className="btn btn-ghost btn-sm">
            Back
          </Link>
          <Link to={`/users/${user.id}/edit`} className="btn btn-ghost btn-sm">
            Edit
          </Link>
          <button
            className={`btn btn-sm ${user.isActive ? 'btn-danger' : 'btn-primary'}`}
            onClick={toggleActive}
          >
            {user.isActive ? 'Deactivate' : 'Reactivate'}
          </button>
        </div>
      </div>

      {error && (
        <div className="toast toast-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 16 }}>Profile</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, fontSize: 13 }}>
            <span style={{ color: 'var(--text-secondary)' }}>ID</span>
            <span>{user.id}</span>
            <span style={{ color: 'var(--text-secondary)' }}>Tenant ID</span>
            <span>{user.tenantId}</span>
            <span style={{ color: 'var(--text-secondary)' }}>Email</span>
            <span>
              {user.email ?? '---'}{' '}
              <span className={`badge ${user.emailVerified ? 'badge-green' : ''}`}>
                {user.emailVerified ? 'verified' : 'unverified'}
              </span>
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>Phone</span>
            <span>
              {user.phone ?? '---'}{' '}
              <span className={`badge ${user.phoneVerified ? 'badge-green' : ''}`}>
                {user.phoneVerified ? 'verified' : 'unverified'}
              </span>
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>Status</span>
            <span>
              <span className={`badge ${user.isActive ? 'badge-green' : 'badge-red'}`}>
                {user.isActive ? 'active' : 'inactive'}
              </span>
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>MFA</span>
            <span>
              <span className={`badge ${user.mfaEnabled ? 'badge-green' : ''}`}>
                {user.mfaEnabled ? 'enabled' : 'disabled'}
              </span>
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>Locked until</span>
            <span>{formatDate(user.lockedUntil)}</span>
            <span style={{ color: 'var(--text-secondary)' }}>Created</span>
            <span>{formatDate(user.createdAt)}</span>
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 16 }}>Roles</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {user.roles.length === 0 ? (
              <span className="badge">no roles</span>
            ) : (
              user.roles.map((r) => (
                <span key={r} className="badge badge-blue">
                  {r}
                </span>
              ))
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              className="select"
              value={roleSelect}
              onChange={(e) => setRoleSelect(e.target.value)}
              style={{ maxWidth: 200 }}
            >
              <option className="option" value="">
                {unassignedRoles.length ? 'Select role...' : 'All roles assigned'}
              </option>
              {unassignedRoles.map((r) => (
                <option className="option" key={r.name} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
            <button className="btn btn-primary btn-sm" onClick={assignRole} disabled={!roleSelect}>
              Assign
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            {user.roles.map((r) => (
              <button key={r} className="btn btn-ghost btn-sm" onClick={() => removeRole(r)}>
                {r} (remove)
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="tabs">
          <button
            className={`tab-btn ${tab === 'permissions' ? 'active' : ''}`}
            onClick={() => setTab('permissions')}
          >
            Permissions
          </button>
          <button
            className={`tab-btn ${tab === 'sessions' ? 'active' : ''}`}
            onClick={() => setTab('sessions')}
          >
            Sessions
          </button>
        </div>

        {tab === 'permissions' && (
          <div>
            {permissions.length === 0 ? (
              <div className="empty-state">No permissions resolved</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {permissions.map((p) => (
                  <span key={p} className="badge badge-blue">
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'sessions' && (
          <div className="table-wrap">
            {sessions.length === 0 ? (
              <div className="empty-state">No sessions found</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Status</th>
                    <th>Device</th>
                    <th>Last active</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id}>
                      <td>{s.id.slice(0, 8)}</td>
                      <td>
                        <span className={`badge ${s.status === 'active' ? 'badge-green' : 'badge-red'}`}>
                          {s.status}
                        </span>
                      </td>
                      <td>
                        {s.device?.deviceLabel ?? '---'} ({s.device?.ip ?? 'no ip'})
                      </td>
                      <td>{formatDate(s.lastActiveAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}