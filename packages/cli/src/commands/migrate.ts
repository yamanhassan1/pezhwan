/**
 * PEZHWAN CLI — migrate command.
 *
 *   pezhwan migrate --dir <migrations-dir>
 *
 * Asks the server to run its migrations. Fails loudly with the server's error
 * envelope when the endpoint is not enabled.
 */

import type { CliContext } from '../index.ts';
import { parseFlags } from '../utils/config.ts';

export default {
  command: 'migrate',
  describe: 'Run database migrations on the server',
  async run(ctx: CliContext, args: string[]): Promise<number> {
    const { flags } = parseFlags(args);
    if (typeof flags.dir !== 'string') {
      return ctx.err('usage: pezhwan migrate --dir <migrations-dir>'), 1;
    }
    const data = await ctx.api('/v1/admin/migrate', {
      method: 'POST',
      body: JSON.stringify({ dir: flags.dir }),
    });
    ctx.out(ctx.json(data));
    return 0;
  },
};