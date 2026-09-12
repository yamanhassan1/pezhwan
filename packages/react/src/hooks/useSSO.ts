/**
 * PEZHWAN — SSO / social-login hook.
 *
 * Builds an OAuth authorization-URL and performs the browser redirect. The
 * runtime continues the OIDC exchange; the SDK only navigates.
 */

import { useCallback } from 'react';
import { getActiveConfig } from '../index.tsx';

export function useSSO() {
  const getAuthorizeUrl = useCallback((provider: string, redirectUri?: string): string => {
    const base = getActiveConfig().baseUrl.replace(/\/+$/, '');
    const params = new URLSearchParams({ provider });
    if (redirectUri) {
      params.set('redirect_uri', redirectUri);
    }
    return `${base}/v1/oauth/authorize?${params.toString()}`;
  }, []);

  const start = useCallback(
    (provider: string, redirectUri?: string) => {
      window.location.assign(getAuthorizeUrl(provider, redirectUri));
    },
    [getAuthorizeUrl],
  );

  return { getAuthorizeUrl, start };
}