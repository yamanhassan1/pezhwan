/**
 * PEZHWAN CLI — users command.
 *
 *   pezhwan users [--email <filter>]
 */

import type { CliContext } from '../index.ts';

export default {
  command: 'users',
  describe: 'List users',
  async run(ctx: CliContext): Promise<number> {
    const data = (await ctx.api('/v1/users')) as { data?: { users?: Array<Record<string, unknown>> } };
    const users = data.data?.users ?? [];
    ctx.out(
      ctx.table(['id', 'email', 'roles'], users.map((u) => [String(u.id ?? ''), String(u.email ?? ''), Array.isArray(u.roles) ? (u.roles as unknown[]).join(',') : ''])),
    );
    return 0;
  },
};