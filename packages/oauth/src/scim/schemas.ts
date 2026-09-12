/**
 * PEZHWAN — SCIM 2.0 schema URIs and schema documents.
 */

export const SCHEMA_URI = {
  USER: 'urn:ietf:params:scim:schemas:core:2.0:User',
  GROUP: 'urn:ietf:params:scim:schemas:core:2.0:Group',
  ENTERPRISE_USER: 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User',
  SEARCH_REQUEST: 'urn:ietf:params:scim:api:messages:2.0:SearchRequest',
  LIST_RESPONSE: 'urn:ietf:params:scim:api:messages:2.0:ListResponse',
  ERROR: 'urn:ietf:params:scim:api:messages:2.0:Error',
  SERVICE_PROVIDER_CONFIG: 'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig',
  RESOURCE_TYPE: 'urn:ietf:params:scim:schemas:core:2.0:ResourceType',
} as const;

/** Canonical write/read attribute order for the User schema. */
export const USER_ATTRIBUTE_NAMES = [
  'id',
  'externalId',
  'userName',
  'displayName',
  'name',
  'emails',
  'phoneNumbers',
  'active',
  'groups',
] as const;

/** Returns a SCIM User schema document (RFC 7643 subset). */
export function userSchemaDocument(): Record<string, unknown> {
  return {
    id: SCHEMA_URI.USER,
    name: 'User',
    description: 'User Account',
    attributes: [
      { name: 'id', type: 'string', mutability: 'readOnly', returned: 'default' },
      { name: 'externalId', type: 'string', mutability: 'readWrite' },
      { name: 'userName', type: 'string', required: true, uniqueness: 'server' },
      { name: 'displayName', type: 'string', mutability: 'readWrite' },
      { name: 'name', type: 'complex', mutability: 'readWrite', subAttributes: ['givenName', 'familyName', 'fullName'] },
      { name: 'emails', type: 'complex', multiValued: true, mutability: 'readWrite' },
      { name: 'phoneNumbers', type: 'complex', multiValued: true, mutability: 'readWrite' },
      { name: 'active', type: 'boolean', mutability: 'readWrite' },
      { name: 'groups', type: 'complex', multiValued: true, mutability: 'readOnly' },
    ],
  };
}
