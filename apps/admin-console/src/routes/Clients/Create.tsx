import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ClientForm, { type ClientFormValues } from '../../components/Forms/ClientForm';
import { apiPost } from '../../lib/api';

interface CreatedClient {
  clientId: string;
  clientSecret: string | null;
}

export default function ClientsCreate() {
  const navigate = useNavigate();
  const [created, setCreated] = useState<CreatedClient | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (value: string, key: string) => {
    navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(key);
        setTimeout(() => setCopied(null), 1500);
      })
      .catch(() => undefined);
  };

  const handleSave = async (values: ClientFormValues) => {
    const res = await apiPost<{ client: { clientId: string }; clientSecret?: string | null }>(
      '/v1/admin/clients',
      {
        name: values.name,
        redirectUris: values.redirectUris,
        grants: values.grants,
        scopes: values.scopes,
        confidential: values.confidential,
      },
    );
    setCreated({ clientId: res.client.clientId, clientSecret: res.clientSecret ?? null });
  };

  if (created) {
    return (
      <div>
        <div className="page-header">
          <h1>Client Created</h1>
        </div>
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 560 }}>
            <h3>OAuth Client Registered</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Store these credentials now. The client secret is shown only once.
            </p>
            <div className="form-group">
              <label className="label">Client ID</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" readOnly value={created.clientId} />
                <button className="btn btn-ghost" onClick={() => copy(created.clientId, 'id')}>
                  {copied === 'id' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            {created.clientSecret && (
              <div className="form-group">
                <label className="label">Client Secret (shown once)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="input" readOnly value={created.clientSecret} />
                  <button
                    className="btn btn-ghost"
                    onClick={() => copy(created.clientSecret ?? '', 'secret')}
                  >
                    {copied === 'secret' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => navigate('/clients')}>
                Back to clients
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Create OAuth Client</h1>
      </div>
      <div style={{ maxWidth: 600 }}>
        <ClientForm onSave={handleSave} saveLabel="Register client" />
      </div>
    </div>
  );
}