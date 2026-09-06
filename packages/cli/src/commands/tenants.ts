/**
 * PEZHWAN CLI — tenants command.
 *
 *   pezhwan tenants
 */

import type { CliContext } from '../index.ts';

export default {
  command: 'tenants',
  describe: 'List tenants',
  async run(ctx: CliContext): Promise<number> {
    const data = (await ctx.api('/v1/admin/tenants')) as { data?: { tenants?: Array<Record<string, unknown>> } };
    const tenants = data.data?.tenants ?? [];
    ctx.out(
      ctx.table(
        ['id', 'name'],
        tenants.map((t) => [String(t.id ?? ''), String(t.name ?? '')]),
      ),
    );
    return 0;
  },
};