/**
 * PEZHWAN CLI — config command.
 *
 *   pezhwan config --show
 *   pezhwan config --set baseUrl https://id.example.com
 *   pezhwan config --set token <token>
 */

import type { CliContext } from '../index.ts';
import { configPath, parseFlags } from '../utils/config.ts';

export default {
  command: 'config',
  describe: 'Show or update the connection profile',
  async run(ctx: CliContext, args: string[]): Promise<number> {
    const { flags } = parseFlags(args);

    if (typeof flags.set === 'string') {
      const value = flags.value ?? flags[flags.set as string];
      if (typeof value !== 'string') {
        return ctx.err('usage: pezhwan config --set <key> <value>'), 1;
      }
      const profile = ctx.requireConfig();
      if (flags.set === 'token') {
        profile.token = value;
      } else if (flags.set === 'baseUrl') {
        profile.baseUrl = value;
      } else {
        return ctx.err(`unknown config key "${flags.set}" (baseUrl | token)`), 1;
      }
      ctx.saveConfig(profile);
      ctx.ok(`${flags.set} updated`);
      return 0;
    }

    const profile = ctx.loadConfig();
    if (!profile) {
      ctx.err(`No profile yet (${configPath()})`);
      ctx.err('Run: pezhwan config --set baseUrl <url>');
      return 1;
    }
    const masked = profile.token ? `${profile.token.slice(0, 8)}…` : '(none)';
    ctx.out(ctx.json({ path: configPath(), baseUrl: profile.baseUrl, token: masked }));
    return 0;
  },
};