/**
 * PEZHWAN — SCIM 2.0 ServiceProviderConfig document.
 */

export function serviceProviderConfig(overrides?: {
  patch?: boolean;
  bulk?: boolean;
  filter?: boolean;
  etag?: boolean;
  sorting?: boolean;
  changePassword?: boolean;
}): Record<string, unknown> {
  const changePassword = overrides?.changePassword ?? true;
  const sortingSupported = overrides?.sorting ?? true;
  const etagSupported = overrides?.etag ?? true;
  const filterSupported = overrides?.filter ?? true;
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
    documentationUri: 'https://github.com/yamanhassan1/pezwan',
    patch: { supported: overrides?.patch ?? true },
    bulk: { supported: overrides?.bulk ?? false, maxOperations: 100, maxPayloadSize: 1048576 },
    filter: {
      supported: filterSupported,
      maxResults: 200,
    },
    etag: { supported: etagSupported },
    sorting: { supported: sortingSupported },
    changePassword: { supported: changePassword },
    authenticationSchemes: [
      {
        name: 'PeZHWAN API Key',
        description: 'Authentication via Pezhwan API keys.',
        specUri: 'https://github.com/yamanhassan1/pezwan',
        type: 'oauthbearertoken',
      },
    ],
  };
}
