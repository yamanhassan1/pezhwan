/**
 * PEZHWAN CLI — webhooks command.
 *
 *   pezhwan webhooks                                    list webhooks
 *   pezhwan webhooks --id <id>                           show webhook + deliveries
 *   pezhwan webhooks --create --url <url> --events <e,e> register a new webhook
 */

import type { CliContext } from '../index.ts';
import { parseFlags } from '../utils/config.ts';

export default {
  command: 'webhooks',
  describe: 'Manage webhook delivery endpoints',
  async run(ctx: CliContext, args: string[]): Promise<number> {
    const { flags } = parseFlags(args);

    // --- create -----------------------------------------------------------
    if (flags.create === true) {
      const url = typeof flags.url === 'string' ? flags.url : '';
      if (!url) {
        ctx.err('Error: --url is required for --create');
        return 1;
      }
      const eventsRaw = typeof flags.events === 'string' ? flags.events : '';
      if (!eventsRaw) {
        ctx.err('Error: --events is required for --create (comma-separated event names)');
        return 1;
      }
      const events = eventsRaw
        .split(',')
        .map((e: string) => e.trim())
        .filter(Boolean);
      if (events.length === 0) {
        ctx.err('Error: --events must list at least one event');
        return 1;
      }

      const body: Record<string, unknown> = { url, events };
      if (typeof flags.tenant === 'string') body.tenantId = flags.tenant;
      if (typeof flags.application === 'string') body.applicationId = flags.application;

      const data = await ctx.api('/v1/admin/webhooks', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      ctx.ok('Webhook registered');
      ctx.out(ctx.json(data));
      return 0;
    }

    // --- single webhook detail --------------------------------------------
    if (typeof flags.id === 'string') {
      const data = await ctx.api(`/v1/admin/webhooks/${flags.id}`);
      ctx.out(ctx.json(data));
      return 0;
    }

    // --- list (default) ---------------------------------------------------
    const data = (await ctx.api('/v1/admin/webhooks')) as {
      data?: { webhooks?: Array<Record<string, unknown>> };
    };
    const whs = data.data?.webhooks ?? [];
    ctx.out(
      ctx.table(
        ['id', 'url', 'events', 'active', 'secret'],
        whs.map((w) => [
          String(w._id ?? w.id ?? ''),
          String(w.url ?? ''),
          Array.isArray(w.events) ? (w.events as unknown[]).join(',') : '',
          w.active === true ? 'yes' : 'no',
          typeof w.secret === 'string' ? w.secret.slice(0, 8) + '…' : '',
        ]),
      ),
    );
    return 0;
  },
};
