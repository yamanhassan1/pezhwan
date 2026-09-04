/**
 * PEZHWAN — Bot detection.
 *
 * Scores an incoming request for automation/bot behaviour using lightweight,
 * injectable signals: behavioural heuristics (mouse/keyboard presence, timing
 * consistency), header fingerprinting, and (optional) CAPTCHA result.
 *
 * Design: detectors are injected so the engine stays deterministic and
 * testable. Scores are 0 (definitely human) → 1 (almost certainly bot).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BotSignalInput {
  /** e.g. 'mouse_move', 'key_press', 'touch', or 'none' (missing) */
  interaction?: string;
  /** Time (ms) the page took to reach the login submit. */
  pageTimeMs?: number;
  /** Whether the browser reported WebDriver automation. */
  webdriver?: boolean;
  /** Whether a headless UA / suspicious UA string was detected. */
  suspiciousUserAgent?: boolean;
  /** Known good CAPTCHA proof (e.g. hCaptcha/Cloudflare token verified upstream). */
  captchaPassed?: boolean;
  /** Number of submissions from this session already. */
  submissionCount?: number;
}

export interface BotDecision {
  /** 0..1 probability of automation. */
  score: number;
  verdict: 'human' | 'suspect' | 'bot';
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const SUSPECT_THRESHOLD = 0.5;
const BOT_THRESHOLD = 0.75;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class BotDetector {
  /**
   * Compute a bot score from the available signals. Pure/synchronous so it can
   * run without I/O in the request path.
   */
  assess(input: BotSignalInput): BotDecision {
    const reasons: string[] = [];
    let score = 0;

    // Presence of real interaction is the strongest human signal.
    if (input.interaction === 'none' || !input.interaction) {
      score += 0.35;
      reasons.push('no interaction detected');
    } else if (input.interaction === 'mouse_move' || input.interaction === 'key_press' || input.interaction === 'touch') {
      score += 0.05;
      reasons.push('human-like interaction present');
    }

    // Automation markers.
    if (input.webdriver) {
      score += 0.6;
      reasons.push('webdriver flag set');
    }
    if (input.suspiciousUserAgent) {
      score += 0.35;
      reasons.push('suspicious user-agent');
    }

    // Immediate submit (sub-300ms) is bot-like; multi-second is normal.
    if (input.pageTimeMs != null && input.pageTimeMs < 300) {
      score += 0.4;
      reasons.push('submit faster than a human could complete form');
    } else if (input.pageTimeMs != null && input.pageTimeMs < 1000) {
      score += 0.15;
      reasons.push('unusually fast form completion');
    }

    // A verified CAPTCHA resets suspicion for this attempt.
    if (input.captchaPassed) {
      score = Math.max(0, score - 0.7);
      reasons.push('captcha passed');
    }

    // Repeated rapid submissions from one session.
    if ((input.submissionCount ?? 0) > 5) {
      score += 0.3;
      reasons.push('many submissions in one session');
    }

    score = Math.min(1, Math.max(0, score));
    const verdict: BotDecision['verdict'] = score >= BOT_THRESHOLD
      ? 'bot'
      : score >= SUSPECT_THRESHOLD
        ? 'suspect'
        : 'human';

    return { score, verdict, reasons };
  }
}

/**
 * Lightweight UA fingerprint: detect known headless/automation clients and
 * bot UAs. Best-effort; a custom ruleset can replace it.
 */
export function isSuspiciousUserAgent(ua: string | undefined | null): boolean {
  if (!ua) return true; // Missing UA is itself suspicious.
  const lower = ua.toLowerCase();
  return (
    /headless|phantomjs|puppeteer|selenium|playwright|curl|wget|python-requests|go-http-client|aws-sdk|okhttp|axios/i.test(lower)
  );
}