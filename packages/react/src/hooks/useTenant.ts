/**
 * PEZHWAN — tenant hook.
 *
 * Client-side tenant context for session-scoped apps. The server-side tenant
 * is always enforced by the runtime; this hook only lets the UI pick and
 * persist which tenant the current browser session targets.
 */

import { useCallback } from 'react';

const TENANT_KEY = 'pezhwan.tenant';

export function useTenant() {
  const tenantId = useCallback((): string | null => {
    try {
      return localStorage.getItem(TENANT_KEY);
    } catch {
      return null;
    }
  }, []);

  const setTenant = useCallback((id: string) => {
    try {
      localStorage.setItem(TENANT_KEY, id);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const clearTenant = useCallback(() => {
    try {
      localStorage.removeItem(TENANT_KEY);
    } catch {
      /* storage unavailable */
    }
  }, []);

  return { tenantId, setTenant, clearTenant };
}
