/**
 * PEZHWAN CLI — health command.
 *
 *   pezhwan health
 *
 * Reports the identity server's OIDC discovery document and (when enabled) the
 * admin status endpoint.
 */

import type { CliContext } from '../index.ts';

export default {
  command: 'health',
  describe: 'Check connectivity and report the server identity',
  async run(ctx: CliContext): Promise<number> {
    const discovery = await ctx.api('/.well-known/openid-configuration');
    ctx.out(ctx.json(discovery));
    const status = await ctx.api('/v1/admin/status');
    ctx.out(ctx.json(status));
    ctx.ok('OK');
    return 0;
  },
};