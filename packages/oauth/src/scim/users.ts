/**
 * PEZHWAN — SCIM 2.0 user resource controller (in-memory).
 */

import type { ScimEmail, ScimListResponse, ScimPatchOperation, ScimUser } from '@pezhwan/shared';
import { NotFoundError, randomToken } from '@pezhwan/shared';
import { SCHEMA_URI } from './schemas.ts';

export class MemoryScimUserStore {
  private readonly users = new Map<string, ScimUser>();

  create(input: Omit<ScimUser, 'id'>): ScimUser {
    const id = randomToken(16);
    const user: ScimUser = { ...input, id };
    this.users.set(id, user);
    return user;
  }

  get(id: string): ScimUser {
    const user = this.users.get(id);
    if (!user) {
      throw new NotFoundError('SCIM user not found');
    }
    return user;
  }

  replace(id: string, input: Omit<ScimUser, 'id'>): ScimUser {
    if (!this.users.has(id)) {
      throw new NotFoundError('SCIM user not found');
    }
    const user: ScimUser = { ...input, id };
    this.users.set(id, user);
    return user;
  }

  delete(id: string): void {
    if (!this.users.delete(id)) {
      throw new NotFoundError('SCIM user not found');
    }
  }

  list(filter?: string): ScimUser[] {
    const records = [...this.users.values()];
    if (!filter) {
      return records;
    }
    const m = /^userName eq "([^"]+)"$/.exec(filter.trim());
    if (m) {
      const userName = m[1];
      return records.filter((u) => u.userName === userName);
    }
    const email = /^emails.value eq "([^"]+)"$/.exec(filter.trim());
    if (email) {
      const value = email[1];
      return records.filter((u) => (u.emails ?? []).some((e) => e.value === value));
    }
    return records;
  }

  patch(id: string, operations: ScimPatchOperation[]): ScimUser {
    const user = this.get(id);
    for (const op of operations) {
      switch (op.op) {
        case 'replace':
          if (op.path === 'active') {
            user.active = Boolean(op.value);
          } else if (op.path === 'userName') {
            user.userName = String(op.value);
          } else if (op.path === 'name') {
            user.name = { ...user.name, ...(op.value as object) };
          } else if (!op.path) {
            Object.assign(user, op.value);
          }
          break;
        case 'add':
          if (op.path === 'emails') {
            user.emails = [
              ...(user.emails ?? []),
              ...(Array.isArray(op.value) ? (op.value as ScimEmail[]) : []),
            ];
          }
          break;
        case 'remove':
          if (op.path === 'active') {
            user.active = false;
          }
          break;
      }
    }
    this.users.set(id, user);
    return user;
  }
}

export function scimListUsers(
  store: MemoryScimUserStore,
  options: { filter?: string; startIndex?: number; count?: number } = {},
): ScimListResponse<ScimUser> {
  const all = store.list(options.filter);
  const startIndex = options.startIndex ?? 1;
  const count = options.count ?? all.length;
  const page = all.slice(startIndex - 1, startIndex - 1 + count);
  return {
    schemas: [SCHEMA_URI.LIST_RESPONSE],
    totalResults: all.length,
    startIndex,
    itemsPerPage: page.length,
    Resources: page,
  };
}
