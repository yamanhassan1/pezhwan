/**
 * PEZHWAN CLI — clients command.
 *
 *   pezhwan clients            list OAuth clients
 *   pezhwan clients --id <id>  show one client
 */

import type { CliContext } from '../index.ts';
import { parseFlags } from '../utils/config.ts';

export default {
  command: 'clients',
  describe: 'List OAuth clients',
  async run(ctx: CliContext, args: string[]): Promise<number> {
    const { flags } = parseFlags(args);
    if (typeof flags.id === 'string') {
      const client = await ctx.api(`/v1/oauth/clients/${flags.id}`);
      ctx.out(ctx.json(client));
      return 0;
    }
    const data = (await ctx.api('/v1/oauth/clients')) as { data?: { clients?: Array<Record<string, unknown>> } };
    const clients = data.data?.clients ?? [];
    ctx.out(
      ctx.table(
        ['clientId', 'name', 'grants'],
        clients.map((c) => [
          String(c.clientId ?? ''),
          String(c.name ?? ''),
          Array.isArray(c.grants) ? (c.grants as unknown[]).join(',') : '',
        ]),
      ),
    );
    return 0;
  },
};