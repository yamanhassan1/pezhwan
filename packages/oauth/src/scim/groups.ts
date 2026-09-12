/**
 * PEZHWAN — SCIM 2.0 group resource controller (in-memory).
 */

import type { ScimGroup, ScimListResponse, ScimPatchOperation } from '@pezhwan/shared';
import { NotFoundError, randomToken } from '@pezhwan/shared';
import { SCHEMA_URI } from './schemas.ts';

export class MemoryScimGroupStore {
  private readonly groups = new Map<string, ScimGroup>();

  create(input: Omit<ScimGroup, 'id'>): ScimGroup {
    const id = randomToken(16);
    const group: ScimGroup = { ...input, displayName: input.displayName, id };
    this.groups.set(id, group);
    return group;
  }

  get(id: string): ScimGroup {
    const group = this.groups.get(id);
    if (!group) {
      throw new NotFoundError('SCIM group not found');
    }
    return group;
  }

  replace(id: string, input: Omit<ScimGroup, 'id'>): ScimGroup {
    if (!this.groups.has(id)) {
      throw new NotFoundError('SCIM group not found');
    }
    const group: ScimGroup = { ...input, id };
    this.groups.set(id, group);
    return group;
  }

  delete(id: string): void {
    if (!this.groups.delete(id)) {
      throw new NotFoundError('SCIM group not found');
    }
  }

  list(filter?: string): ScimGroup[] {
    const records = [...this.groups.values()];
    if (!filter) {
      return records;
    }
    const m = /^displayName eq "([^"]+)"$/.exec(filter.trim());
    return m ? records.filter((g) => g.displayName === m[1]) : records;
  }

  patch(id: string, operations: ScimPatchOperation[]): ScimGroup {
    const group = this.get(id);
    for (const op of operations) {
      if (op.path === 'members' || op.path === undefined) {
        continue;
      }
      if (op.op === 'replace' && op.path === 'displayName') {
        group.displayName = String(op.value);
      }
    }
    this.groups.set(id, group);
    return group;
  }
}

export function scimListGroups(
  store: MemoryScimGroupStore,
  options: { filter?: string; startIndex?: number; count?: number } = {},
): ScimListResponse<ScimGroup> {
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
