/**
 * PEZHWAN CLI — roles command.
 *
 *   pezhwan roles
 */

import type { CliContext } from '../index.ts';

export default {
  command: 'roles',
  describe: 'List roles and their permissions',
  async run(ctx: CliContext): Promise<number> {
    const data = (await ctx.api('/v1/admin/roles')) as { data?: { roles?: Array<Record<string, unknown>> } };
    const roles = data.data?.roles ?? [];
    ctx.out(
      ctx.table(
        ['role', 'permissions'],
        roles.map((r) => [
          String(r.name ?? r.role ?? ''),
          Array.isArray(r.permissions) ? (r.permissions as unknown[]).join(',') : '',
        ]),
      ),
    );
    return 0;
  },
};