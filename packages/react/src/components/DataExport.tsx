/**
 * PEZHWAN — DataExport.
 *
 * Downloads a JSON snapshot of the authenticated user's session profile
 * (data portability). Row-level export of tenant data belongs server-side;
 * this covers the account-level profile exposed through the session cache.
 */

import { useAuth } from '../hooks/useAuth.ts';

export function DataExport({ filename = 'pezhwan-export.json' }: { filename?: string }) {
  const { user } = useAuth();

  const exportProfile = () => {
    if (!user) return;
    const blob = new Blob([JSON.stringify(user, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button type="button" onClick={exportProfile} disabled={!user}>
      Export my data
    </button>
  );
}
