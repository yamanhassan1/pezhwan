import { useEffect, useState } from 'react';
import { apiGet, apiPatch } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { toast } from '../../components/Layout/Layout';

export default function Settings() {
  const { user } = useAuth();
  const [settingsJson, setSettingsJson] = useState('{}');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [jsonError, setJsonError] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ settings: Record<string, unknown> }>('/v1/admin/settings');
      setSettingsJson(JSON.stringify(res.settings ?? {}, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setJsonError('');
    setError(null);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(settingsJson) as Record<string, unknown>;
    } catch {
      setJsonError('Settings must be valid JSON');
      return;
    }
    setSaving(true);
    try {
      await apiPatch('/v1/admin/settings', { settings: parsed });
      toast.success('Settings saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 16 }}>Tenant settings</h3>

          {error && (
            <div className="toast toast-error" style={{ marginBottom: 12 }}>
              {error}
            </div>
          )}
          {jsonError && (
            <div className="toast toast-error" style={{ marginBottom: 12 }}>
              {jsonError}
            </div>
          )}

          {loading ? (
            <div className="empty-state">Loading...</div>
          ) : (
            <>
              <label className="label" htmlFor="settings">Settings JSON</label>
              <textarea
                id="settings"
                className="textarea"
                style={{ minHeight: 240, fontFamily: 'monospace', fontSize: 12 }}
                value={settingsJson}
                onChange={(e) => setSettingsJson(e.target.value)}
                spellCheck={false}
              />
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Saving...' : 'Save settings'}
              </button>
            </>
          )}
        </div>

        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 16 }}>App context</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, fontSize: 13 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Tenant ID</span>
            <span>{user?.tenantId ?? '---'}</span>
            <span style={{ color: 'var(--text-secondary)' }}>Application ID</span>
            <span>{user?.applicationId ?? '---'}</span>
            <span style={{ color: 'var(--text-secondary)' }}>Current user</span>
            <span>{user?.email ?? '---'}</span>
            <span style={{ color: 'var(--text-secondary)' }}>Roles</span>
            <span>
              {(user?.roles ?? []).map((r) => (
                <span key={r} className="badge badge-blue" style={{ marginRight: 4 }}>
                  {r}
                </span>
              ))}
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>Issuer</span>
            <span>
              {window.location.origin}/v1
            </span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16 }}>
            Settings are stored in the tenant configuration and apply to the entire
            tenant. Issuer is derived from the API base for this environment.
          </p>
        </div>
      </div>
    </div>
  );
}