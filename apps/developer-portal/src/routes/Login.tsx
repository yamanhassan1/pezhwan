import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface LocationState {
  from?: { pathname?: string };
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as LocationState | null)?.from?.pathname ?? '/';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { mfaRequired } = await login(email.trim(), password);
      if (mfaRequired) {
        setError('Multi-factor authentication is required. Contact your administrator.');
        return;
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text)' }}>
            PEZHWAN
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>Developer Portal</div>
        </div>
        <form className="card" onSubmit={handleSubmit} style={{ padding: 28 }}>
          <h2 className="mb-3" style={{ fontSize: 18 }}>
            Sign in
          </h2>
          {error && <div className="alert alert-danger">{error}</div>}
          <div className="mb-3">
            <label className="label" htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              className="input"
              type="email"
              value={email}
              required
              autoComplete="username"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>
          <div className="mb-3">
            <label className="label" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              className="input"
              type="password"
              value={password}
              required
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button type="submit" className="btn btn-lg" disabled={submitting} style={{ width: '100%' }}>
            {submitting ? <span className="loader" style={{ borderColor: 'rgba(255,255,255,0.4)', borderTopColor: '#fff' }} /> : 'Sign in'}
          </button>
        </form>
        <p className="muted" style={{ textAlign: 'center', fontSize: 12.5, marginTop: 16 }}>
          Access is restricted to tenants authorized for the developer portal.
        </p>
      </div>
    </div>
  );
}