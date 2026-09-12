import { useState } from 'react';

export interface ClientFormValues {
  name: string;
  redirectUris: string[];
  grants: string[];
  scopes: string[];
  confidential: boolean;
}

const GRANT_OPTIONS = [
  'authorization_code',
  'implicit',
  'client_credentials',
  'refresh_token',
  'password',
  'pkce',
];

const SCOPE_OPTIONS = ['openid', 'profile', 'email', 'phone', 'offline_access'];

interface ClientFormProps {
  initial?: Partial<ClientFormValues>;
  onSave: (values: ClientFormValues) => Promise<void>;
  saveLabel: string;
}

export default function ClientForm({ initial, onSave, saveLabel }: ClientFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [uris, setUris] = useState(initial?.redirectUris?.join('\n') ?? '');
  const [grants, setGrants] = useState<string[]>(initial?.grants ?? ['authorization_code']);
  const [scopes, setScopes] = useState<string[]>(initial?.scopes ?? []);
  const [confidential, setConfidential] = useState(initial?.confidential ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleGrant = (g: string) =>
    setGrants((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  const toggleScope = (s: string) =>
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const redirectUris = uris
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean);
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (redirectUris.length === 0) {
      setError('At least one redirect URI is required');
      return;
    }
    setSaving(true);
    try {
      await onSave({ name, redirectUris, grants, scopes, confidential });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card">
      {error && <div className="toast toast-error" style={{ marginBottom: 16 }}>{error}</div>}
      <div className="form-group">
        <label className="label" htmlFor="cname">Name</label>
        <input
          id="cname"
          className="input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Application"
        />
      </div>
      <div className="form-group">
        <label className="label" htmlFor="curis">Redirect URIs (one per line)</label>
        <textarea
          id="curis"
          className="textarea"
          value={uris}
          onChange={(e) => setUris(e.target.value)}
          placeholder={'https://app.example.com/callback\nhttp://localhost:3000/callback'}
        />
      </div>
      <div className="form-group">
        <label className="label">Grants</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {GRANT_OPTIONS.map((g) => (
            <label key={g} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={grants.includes(g)} onChange={() => toggleGrant(g)} />
              <span className="badge">{g}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="form-group">
        <label className="label">Scopes</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {SCOPE_OPTIONS.map((s) => (
            <label key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggleScope(s)} />
              <span className="badge badge-blue">{s}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="form-group">
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={confidential} onChange={(e) => setConfidential(e.target.checked)} />
          Confidential (client requires client secret)
        </label>
      </div>
      <button className="btn btn-primary" type="submit" disabled={saving}>
        {saving ? 'Saving...' : saveLabel}
      </button>
    </form>
  );
}