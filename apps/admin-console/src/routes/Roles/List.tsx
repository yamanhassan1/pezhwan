import { useEffect, useMemo, useState } from 'react';
import { apiDelete, apiGet, apiPost } from '../../lib/api';
import { toast } from '../../components/Layout/Layout';
import type { Permission, Role } from '../../types';

export default function RolesList() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, permRes] = await Promise.all([
        apiGet<{ roles: Role[] }>('/v1/admin/roles'),
        apiGet<{ permissions: Permission[] }>('/v1/admin/permissions').catch(() => ({
          permissions: [] as Permission[],
        })),
      ]);
      setRoles(res.roles);
      setPermissions(permRes.permissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const permById = useMemo(
    () => new Map(permissions.map((p) => [p.id, p])),
    [permissions],
  );

  const deleteRole = async (r: Role) => {
    try {
      await apiDelete<{ deleted: boolean }>(`/v1/admin/roles/${r.id}`);
      toast.success(`Role ${r.name} deleted`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const createRole = async () => {
    setError(null);
    try {
      await apiPost('/v1/admin/roles', {
        name: newName,
        description: newDesc,
        permissions: selectedPerms,
      });
      toast.success(`Role ${newName.toUpperCase()} created`);
      setCreating(false);
      setNewName('');
      setNewDesc('');
      setSelectedPerms([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const togglePerm = (id: string) =>
    setSelectedPerms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );

  return (
    <div>
      <div className="page-header">
        <h1>Roles</h1>
        <button className="btn btn-primary" onClick={() => setCreating((c) => !c)}>
          {creating ? 'Cancel' : 'Create role'}
        </button>
      </div>

      {error && (
        <div className="toast toast-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      {creating && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="grid-2">
            <div className="form-group">
              <label className="label" htmlFor="rname">Name</label>
              <input
                id="rname"
                className="input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. SUPPORT"
              />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="rdesc">Description</label>
              <input
                id="rdesc"
                className="input"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Optional description"
              />
            </div>
          </div>
          <div className="form-group">
            <label className="label">Permissions</label>
            {permissions.length === 0 ? (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                No permissions available
              </span>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {permissions.map((p) => (
                  <label key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={selectedPerms.includes(p.id)}
                      onChange={() => togglePerm(p.id)}
                    />
                    <span className="badge badge-blue">{p.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <button className="btn btn-primary" onClick={createRole} disabled={!newName.trim()}>
            Create role
          </button>
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Permissions</th>
                  <th>System</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="badge badge-blue">{r.name}</span>
                    </td>
                    <td>{r.description ?? '---'}</td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.permissionIds.length === 0 ? (
                          <span className="badge">none</span>
                        ) : (
                          r.permissionIds.map((pid) => {
                            const p = permById.get(pid);
                            return (
                              <span key={pid} className="badge">
                                {p?.name ?? pid}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${r.isSystem ? 'badge-yellow' : ''}`}>
                        {r.isSystem ? 'system' : 'custom'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={r.isSystem}
                        title={r.isSystem ? 'System roles cannot be deleted' : undefined}
                        onClick={() => deleteRole(r)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}