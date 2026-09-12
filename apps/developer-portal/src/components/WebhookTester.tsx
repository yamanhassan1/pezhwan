import { useState } from 'react';
import { api } from '../lib/api';
import type { Webhook } from '../types';

export default function WebhookTester({ webhook, secret, onClose }: { webhook: Webhook; secret?: string; onClose: () => void }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ delivered: boolean; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function test() {
    setTesting(true);
    setError(null);
    try {
      const res = await api.post<{ delivered: boolean; url: string }>(`/v1/admin/webhooks/${webhook.id}/test`);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test ping failed');
    } finally {
      setTesting(false);
    }
  }

  async function copySecret() {
    if (!secret) return;
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Webhook tester</h2>
        <p className="muted mb-2" style={{ fontSize: 13.5 }}>
          {webhook.url}
        </p>

        <div className="alert alert-warning mb-3" style={{ fontSize: 13.5 }}>
          Sending a test ping delivers a synthetic event payload to your endpoint using the configured signing secret.
        </div>

        {error && <div className="alert alert-danger">{error}</div>}
        {result && (
          <div className={`alert ${result.delivered ? 'alert-success' : 'alert-danger'} mt-2`}>
            {result.delivered ? 'Delivered' : 'Delivery failed'} — POST to <span className="code">{result.url}</span>
          </div>
        )}

        <div className="mb-3">
          <button className="btn" onClick={() => void test()} disabled={testing} style={{ width: '100%' }}>
            {testing ? <span className="loader" style={{ borderColor: 'rgba(255,255,255,0.4)', borderTopColor: '#fff' }} /> : 'Send test ping'}
          </button>
        </div>

        <span className="label">Signing secret</span>
        {secret ? (
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <code className="code" style={{ flex: 1, padding: '9px 12px', fontSize: 13 }}>
                {secret}
              </code>
              <button className="btn btn-secondary btn-sm" onClick={() => void copySecret()}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="hint">Store this value. It is used to compute the X-Pezhwan-Signature HMAC-SHA256 header.</p>
          </div>
        ) : (
          <div>
            <p className="hint">This secret is shown once at webhook creation and cannot be retrieved afterward. It signs every delivery via HMAC-SHA256.</p>
            <ul style={{ paddingLeft: 18, fontSize: 13.5, color: 'var(--text-muted)' }}>
              <li>Header: <span className="code">X-Pezhwan-Signature</span></li>
              <li>Algorithm: <span className="code">HMAC-SHA256</span></li>
              <li>Payload: <span className="code">timestamp + '.' + body</span></li>
            </ul>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}