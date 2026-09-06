/**
 * PEZHWAN — Bot middleware.
 *
 * Lightweight bot/crawler fingerprinting from User-Agent. Marks the context so
 * downstream policy (rate limits, challenge issuance) can adapt. Never blocks
 * hard by itself — conservative by design.
 */

const BOT_PATTERNS =
  /bot|crawler|spider|slurp|bingpreview|duckduckbot|baiduspider|yandex|applebot|facebookexternalhit|gptbot|claude|curl|wget|axios|python-requests|node-fetch/i;

export interface BotDetection {
  isBot: boolean;
  userAgent?: string;
}

export class BotMiddleware {
  detect(userAgent: string | undefined): BotDetection {
    if (!userAgent) return { isBot: false };
    return { isBot: BOT_PATTERNS.test(userAgent), userAgent };
  }
}

/** Reusable predicate for route-level use. */
export function isBot(userAgent: string | undefined): boolean {
  return new BotMiddleware().detect(userAgent).isBot;
}