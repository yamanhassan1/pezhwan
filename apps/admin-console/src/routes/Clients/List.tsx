import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiDelete, apiGet, apiPatch } from '../../lib/api';
import { formatDate } from '../../lib/utils';
import type { Client } from '../../types';
import { toast } from '../../components/Layout/Layout';

export default function ClientsList() {
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ clients: Client[] }>('/v1/admin/clients');
      setClients(res.clients);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const disable = async (clientId: string) => {
    try {
      await apiDelete<{ disabled: boolean }>(`/v1/admin/clients/${clientId}`);
      toast.success('Client disabled');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const enable = async (clientId: string) => {
    try {
      await apiPatch(`/v1/admin/clients/${clientId}`, { isActive: true });
      toast.success('Client enabled');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>OAuth Clients</h1>
        <Link to="/clients/create" className="btn btn-primary">
          Create client
        </Link>
      </div>

      {error && (
        <div className="toast toast-error" style={{ marginBottom: 12 }}>
          {error}
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
                  <th>Client ID</th>
                  <th>Grants</th>
                  <th>Scopes</th>
                  <th>Confidential</th>
                  <th>Active</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.clientId}>
                    <td>{c.name}</td>
                    <td>
                      <span title={c.clientId}>{c.clientId.slice(0, 10)}...</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {c.grants.length === 0 ? (
                          <span className="badge">none</span>
                        ) : (
                          c.grants.map((g) => (
                            <span key={g} className="badge">
                              {g}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {c.scopes.length === 0 ? (
                          <span className="badge">none</span>
                        ) : (
                          c.scopes.map((s) => (
                            <span key={s} className="badge badge-blue">
                              {s}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${c.isConfidential ? 'badge-yellow' : ''}`}>
                        {c.isConfidential ? 'confidential' : 'public'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${c.isActive ? 'badge-green' : 'badge-red'}`}>
                        {c.isActive ? 'active' : 'disabled'}
                      </span>
                    </td>
                    <td>{formatDate(c.createdAt)}</td>
                    <td>
                      {c.isActive ? (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => disable(c.clientId)}
                        >
                          Disable
                        </button>
                      ) : (
                        <button className="btn btn-ghost btn-sm" onClick={() => enable(c.clientId)}>
                          Enable
                        </button>
                      )}
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
