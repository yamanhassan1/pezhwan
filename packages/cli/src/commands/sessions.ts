/**
 * PEZHWAN CLI — sessions command.
 *
 *   pezhwan sessions
 */

import type { CliContext } from '../index.ts';

export default {
  command: 'sessions',
  describe: 'List the authenticated user’s active sessions',
  async run(ctx: CliContext): Promise<number> {
    const data = (await ctx.api('/v1/sessions')) as { data?: { sessions?: Array<Record<string, unknown>> } };
    const sessions = data.data?.sessions ?? [];
    ctx.out(
      ctx.table(
        ['_id', 'device', 'ip', 'lastActiveAt'],
        sessions.map((s) => [
          String(s._id ?? ''),
          String(s.device ?? s.userAgent ?? ''),
          String(s.ip ?? ''),
          String(s.lastActiveAt ?? s.createdAt ?? ''),
        ]),
      ),
    );
    return 0;
  },
};