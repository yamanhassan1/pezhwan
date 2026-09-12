import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DataTable from '../../components/DataTable/DataTable';
import { apiGet } from '../../lib/api';
import { formatDate } from '../../lib/utils';
import type { User } from '../../types';

const PAGE_SIZE = 20;

export default function UsersList() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async (opts?: { search?: string; isActive?: string; offset?: number }) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    const q = opts?.search ?? search;
    const a = opts?.isActive ?? activeFilter;
    const o = opts?.offset ?? offset;
    if (q) params.set('search', q);
    if (a) params.set('isActive', a);
    if (o) params.set('offset', String(o));
    params.set('limit', String(PAGE_SIZE));
    try {
      const res = await apiGet<{
        users: User[];
        total: number;
        limit: number;
        offset: number;
      }>(`/v1/admin/users?${params.toString()}`);
      setUsers(res.users);
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const visibleUsers =
    activeFilter === ''
      ? users
      : users.filter((u) => String(u.isActive) === activeFilter);

  return (
    <div>
      <div className="page-header">
        <h1>Users</h1>
        <Link to="/users/create" className="btn btn-primary">
          Create user
        </Link>
      </div>

      {error && (
        <div className="toast toast-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ maxWidth: 280 }}
          placeholder="Search email or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setOffset(0);
              load({ search, isActive: activeFilter, offset: 0 });
            }
          }}
        />
        <select
          className="select"
          style={{ maxWidth: 160 }}
          value={activeFilter}
          onChange={(e) => {
            setActiveFilter(e.target.value);
            setOffset(0);
            load({ search, isActive: e.target.value, offset: 0 });
          }}
        >
          <option className="option" value="">All statuses</option>
          <option className="option" value="true">Active</option>
          <option className="option" value="false">Inactive</option>
        </select>
        <button
          className="btn btn-ghost"
          onClick={() => {
            setOffset(0);
            load({ search, isActive: activeFilter, offset: 0 });
          }}
        >
          Apply
        </button>
      </div>

      <div className="card">
        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : (
          <DataTable<User>
            columns={[
              {
                key: 'email',
                label: 'Email',
                render: (u) => u.email ?? '---',
              },
              {
                key: 'phone',
                label: 'Phone',
                render: (u) => u.phone ?? '---',
              },
              {
                key: 'roles',
                label: 'Roles',
                render: (u) => (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {u.roles.length === 0 ? (
                      <span className="badge">none</span>
                    ) : (
                      u.roles.map((r) => (
                        <span key={r} className="badge badge-blue">
                          {r}
                        </span>
                      ))
                    )}
                  </div>
                ),
              },
              {
                key: 'mfa',
                label: 'MFA',
                render: (u) => (
                  <span className={`badge ${u.mfaEnabled ? 'badge-green' : ''}`}>
                    {u.mfaEnabled ? 'enabled' : 'off'}
                  </span>
                ),
              },
              {
                key: 'status',
                label: 'Status',
                render: (u) => (
                  <span className={`badge ${u.isActive ? 'badge-green' : 'badge-red'}`}>
                    {u.isActive ? 'active' : 'inactive'}
                  </span>
                ),
              },
              {
                key: 'createdAt',
                label: 'Created',
                render: (u) => formatDate(u.createdAt),
              },
              {
                key: 'actions',
                label: 'Actions',
                render: (u) => (
                  <Link
                    to={`/users/${u.id}/edit`}
                    className="btn btn-ghost btn-sm"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Edit
                  </Link>
                ),
              },
            ]}
            rows={visibleUsers}
            rowKey={(u) => u.id}
            onRowClick={(u) => navigate(`/users/${u.id}`)}
          />
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
            load({ search, isActive: activeFilter, offset: o });
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
            load({ search, isActive: activeFilter, offset: o });
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}