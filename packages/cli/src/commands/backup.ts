/**
 * PEZHWAN CLI — backup command.
 *
 *   pezhwan backup [--target <dir>]
 *
 * Asks the server to create a backup. Fails loudly with the server's error
 * envelope when the endpoint is not enabled.
 */

import type { CliContext } from '../index.ts';
import { parseFlags } from '../utils/config.ts';

export default {
  command: 'backup',
  describe: 'Trigger a server-side backup',
  async run(ctx: CliContext, args: string[]): Promise<number> {
    const { flags } = parseFlags(args);
    const body = typeof flags.target === 'string' ? JSON.stringify({ target: flags.target }) : '{}';
    const data = await ctx.api('/v1/admin/backup', { method: 'POST', body });
    ctx.out(ctx.json(data));
    return 0;
  },
};