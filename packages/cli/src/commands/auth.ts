/**
 * PEZHWAN CLI — auth command.
 *
 *   pezhwan auth login --email <e> --password <p>
 *   pezhwan auth logout
 *   pezhwan auth whoami
 */

import type { CliContext } from '../index.ts';
import { parseFlags } from '../utils/config.ts';

export default {
  command: 'auth',
  describe: 'Authenticate: login | logout | whoami',
  async run(ctx: CliContext, args: string[]): Promise<number> {
    const sub = args[0] ?? 'help';

    if (sub === 'login') {
      const { flags } = parseFlags(args.slice(1));
      const email = flags.email;
      const password = flags.password;
      if (typeof email !== 'string' || typeof password !== 'string') {
        return ctx.err('usage: pezhwan auth login --email <email> --password <password>'), 1;
      }
      const data = (await ctx.api('/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })) as { data?: { accessToken?: string } };
      const token = data.data?.accessToken;
      if (!token) {
        return ctx.err('Login succeeded but no access token was returned'), 1;
      }
      const profile = ctx.requireConfig();
      profile.token = token;
      ctx.saveConfig(profile);
      ctx.ok('Authenticated; token saved to profile');
      return 0;
    }

    if (sub === 'logout') {
      const profile = ctx.requireConfig();
      delete profile.token;
      ctx.saveConfig(profile);
      ctx.ok('Logged out');
      return 0;
    }

    if (sub === 'whoami') {
      const me = await ctx.api('/v1/users/me');
      ctx.out(ctx.json(me));
      return 0;
    }

    ctx.out('usage: pezhwan auth login | logout | whoami');
    return 0;
  },
};