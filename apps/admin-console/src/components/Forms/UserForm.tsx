import { useState, useEffect } from 'react';
import { apiGet } from '../../lib/api';
import type { Role } from '../../types';

export interface UserFormValues {
  email: string;
  phone: string;
  password: string;
  roles: string[];
  isActive: boolean;
}

interface UserFormProps {
  initial?: Partial<UserFormValues>;
  onSave: (values: UserFormValues) => Promise<void>;
  saveLabel: string;
  showPassword?: boolean;
  passwordRequired?: boolean;
}

export default function UserForm({
  initial,
  onSave,
  saveLabel,
  showPassword = true,
  passwordRequired = true,
}: UserFormProps) {
  const [email, setEmail] = useState(initial?.email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [password, setPassword] = useState(initial?.password ?? '');
  const [roles, setRoles] = useState<string[]>(initial?.roles ?? []);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [roleOptions, setRoleOptions] = useState<Role[]>([]);
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiGet<{ roles: Role[] }>('/v1/admin/roles')
      .then((res) => {
        if (!cancelled) setRoleOptions(res.roles);
      })
      .catch(() => {
        if (!cancelled) setRoleOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleRole = (name: string) => {
    setRoles((prev) => (prev.includes(name) ? prev.filter((r) => r !== name) : [...prev, name]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSave({ email, phone, password, roles, isActive });
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
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
        />
      </div>
      <div className="form-group">
        <label className="label" htmlFor="phone">
          Phone (optional)
        </label>
        <input
          id="phone"
          className="input"
          type="text"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+00123456789"
        />
      </div>
      {showPassword && (
        <div className="form-group">
          <label className="label" htmlFor="password">
            Password {passwordRequired ? '' : '(leave blank to keep current)'}
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id="password"
              className="input"
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={passwordRequired ? 'Set a password' : 'Reset password'}
            />
            <button type="button" className="btn btn-ghost" onClick={() => setShowPw((s) => !s)}>
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
      )}
      <div className="form-group">
        <label className="label">Roles</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {roleOptions.map((r) => (
            <label key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={roles.includes(r.name)}
                onChange={() => toggleRole(r.name)}
              />
              <span className="badge badge-blue">{r.name}</span>
            </label>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          Selected: {roles.length > 0 ? roles.join(', ') : 'none'}
        </div>
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
