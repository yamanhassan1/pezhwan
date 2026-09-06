/**
 * PEZHWAN CLI — audit command.
 *
 *   pezhwan audit [--limit 100]
 */

import type { CliContext } from '../index.ts';
import { parseFlags } from '../utils/config.ts';

export default {
  command: 'audit',
  describe: 'Read recent audit events',
  async run(ctx: CliContext, args: string[]): Promise<number> {
    const { flags } = parseFlags(args);
    const limit = typeof flags.limit === 'string' ? Number.parseInt(flags.limit, 10) : 100;
    const query = Number.isFinite(limit) ? `?limit=${Math.max(1, limit)}` : '';
    const data = await ctx.api(`/v1/admin/audit${query}`);
    ctx.out(ctx.json(data));
    return 0;
  },
};