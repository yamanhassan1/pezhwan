import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import KeyManager from '../../components/KeyManager';

type StatusFilter = 'all' | 'active' | 'revoked';

const activeFilterStyle: CSSProperties = {
  background: 'var(--primary)',
  color: '#fff',
  borderColor: 'transparent',
};

export default function ApiKeysList() {
  const [filter, setFilter] = useState<StatusFilter>('all');

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">API keys</h1>
          <p className="page-desc">Issue and revoke server-side keys for programmatic access to the PEZHWAN API.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={() => setFilter('all')} style={filter === 'all' ? activeFilterStyle : undefined}>
            All
          </button>
          <button className="btn btn-secondary" onClick={() => setFilter('active')} style={filter === 'active' ? activeFilterStyle : undefined}>
            Active
          </button>
          <button className="btn btn-secondary" onClick={() => setFilter('revoked')} style={filter === 'revoked' ? activeFilterStyle : undefined}>
            Revoked
          </button>
          <Link className="btn" to="/api-keys/create">
            Create API key
          </Link>
        </div>
      </div>

      <KeyManager statusFilter={filter} />

      <div className="card mt-3" style={{ background: 'var(--surface-2)', borderStyle: 'dashed' }}>
        <span className="label">About API keys</span>
        <p className="muted" style={{ fontSize: 13.5 }}>
          Server-side keys use the <span className="code">pk_live_</span> prefix and are sent as{' '}
          <span className="code">Authorization: Bearer &lt;key&gt;</span>. The full key is returned exactly once at creation — store it securely.
        </p>
      </div>
    </div>
  );
}