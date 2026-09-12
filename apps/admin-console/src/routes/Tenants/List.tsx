import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../../components/DataTable/DataTable';
import { apiGet, apiPatch } from '../../lib/api';
import { formatDate, shortId } from '../../lib/utils';
import type { Tenant } from '../../types';

export default function TenantsList() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ tenants: Tenant[] }>('/v1/admin/tenants');
      setTenants(res.tenants);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleTenant = async (t: Tenant) => {
    try {
      await apiPatch<{ tenant: Tenant }>(`/v1/admin/tenants/${t.id}`, {
        isActive: !t.isActive,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const filtered = tenants.filter((t) => {
    const q = search.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.slug.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div className="page-header">
        <h1>Tenants</h1>
        <Link to="/tenants/create" className="btn btn-primary">
          Create tenant
        </Link>
      </div>

      {error && (
        <div className="toast toast-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="Search by name, slug, or id..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card">
        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : (
          <DataTable<Tenant>
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'slug', label: 'Slug' },
              {
                key: 'id',
                label: 'ID',
                render: (t) => <span title={t.id}>{shortId(t.id)}</span>,
              },
              {
                key: 'plan',
                label: 'Plan',
                render: (t) => <span className="badge badge-blue">{t.plan}</span>,
              },
              {
                key: 'status',
                label: 'Status',
                render: (t) => (
                  <span className={`badge ${t.status === 'active' ? 'badge-green' : 'badge-red'}`}>
                    {t.status}
                  </span>
                ),
              },
              {
                key: 'isActive',
                label: 'Active',
                render: (t) => (
                  <span className={`badge ${t.isActive ? 'badge-green' : 'badge-red'}`}>
                    {t.isActive ? 'yes' : 'no'}
                  </span>
                ),
              },
              {
                key: 'createdAt',
                label: 'Created',
                render: (t) => formatDate(t.createdAt),
              },
              {
                key: 'actions',
                label: 'Actions',
                render: (t) => (
                  <button
                    className={`btn btn-sm ${t.isActive ? 'btn-danger' : 'btn-ghost'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTenant(t);
                    }}
                  >
                    {t.isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                ),
              },
            ]}
            rows={filtered}
            rowKey={(t) => t.id}
          />
        )}
      </div>
    </div>
  );
}