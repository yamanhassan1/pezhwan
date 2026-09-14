import { useState } from 'react';

export interface TenantFormValues {
  name: string;
  slug: string;
  plan: string;
  isActive: boolean;
  config: string;
}

const PLANS = ['free', 'pro', 'enterprise'];

interface TenantFormProps {
  initial?: Partial<TenantFormValues>;
  onSave: (values: TenantFormValues) => Promise<void>;
  saveLabel: string;
}

export default function TenantForm({ initial, onSave, saveLabel }: TenantFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [plan, setPlan] = useState(initial?.plan ?? 'free');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [config, setConfig] = useState(
    initial?.config && initial.config !== '{}' ? initial.config : '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [configError, setConfigError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setConfigError('');
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    let parsedConfig: Record<string, unknown> | undefined;
    if (config.trim()) {
      try {
        parsedConfig = JSON.parse(config) as Record<string, unknown>;
      } catch {
        setConfigError('Config must be valid JSON');
        return;
      }
    }
    setSaving(true);
    try {
      await onSave({
        name,
        slug,
        plan,
        isActive,
        config: parsedConfig ? JSON.stringify(parsedConfig) : '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card">
      {error && (
        <div className="toast toast-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}
      <div className="form-group">
        <label className="label" htmlFor="tname">
          Name
        </label>
        <input
          id="tname"
          className="input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Corp"
        />
      </div>
      <div className="form-group">
        <label className="label" htmlFor="tslug">
          Slug (optional)
        </label>
        <input
          id="tslug"
          className="input"
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="acme-corp"
        />
      </div>
      <div className="form-group">
        <label className="label" htmlFor="tplan">
          Plan
        </label>
        <select
          id="tplan"
          className="select"
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
        >
          {PLANS.map((p) => (
            <option key={p} className="option" value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label className="label" htmlFor="tconfig">
          Config JSON (optional)
        </label>
        <textarea
          id="tconfig"
          className="textarea"
          value={config}
          onChange={(e) => setConfig(e.target.value)}
          placeholder='{"subscription":{"status":"active"}}'
        />
        {configError && (
          <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{configError}</div>
        )}
      </div>
      <div className="form-group">
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Active
        </label>
      </div>
      <button className="btn btn-primary" type="submit" disabled={saving}>
        {saving ? 'Saving...' : saveLabel}
      </button>
    </form>
  );
}
