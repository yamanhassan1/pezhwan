/**
 * PEZHWAN — SCIM 2.0 provisioning types.
 */

/** SCIM organization name. */
export interface ScimName {
  givenName?: string;
  familyName?: string;
  fullName?: string;
}

/** SCIM multi-valued email. */
export interface ScimEmail {
  value: string;
  primary?: boolean;
  type?: string;
}

/** SCIM multi-valued phone number. */
export interface ScimPhoneNumber {
  value: string;
  primary?: boolean;
  type?: 'work' | 'mobile' | 'home' | 'other';
}

/** SCIM user account. */
export interface ScimUser {
  id: string;
  externalId?: string;
  userName: string;
  name?: ScimName;
  emails?: ScimEmail[];
  phoneNumbers?: ScimPhoneNumber[];
  active?: boolean;
  groups?: { value: string; display?: string }[];
  meta?: Record<string, unknown>;
}

/** SCIM group/role. */
export interface ScimGroup {
  id: string;
  displayName: string;
  members?: { value: string; display?: string }[];
}

/** SCIM PATCH operation. */
export interface ScimPatchOperation {
  op: 'add' | 'remove' | 'replace';
  path?: string;
  value: unknown;
}

/** SCIM list/list-search response shape. */
export interface ScimListResponse<T> {
  schemas: string[];
  totalResults: number;
  startIndex?: number;
  itemsPerPage?: number;
  Resources: T[];
}

/** SCIM error response shape. */
export interface ScimError {
  schemas: string[];
  status: number;
  scimType?: string;
  detail?: string;
}
