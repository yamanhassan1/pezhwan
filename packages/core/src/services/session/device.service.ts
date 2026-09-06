/**
 * PEZHWAN — Device service.
 *
 * Parses and fingerprints device metadata from user-agent headers and
 * identifier headers, producing a stable id + description for session records.
 */

export interface DeviceInfoInput {
  userAgent?: string;
  ip?: string;
  acceptLanguage?: string;
  xDeviceId?: string;
}

export interface DeviceInfo {
  /** Stable device identifier: caller-supplied or derived fingerprint. */
  id: string;
  userAgent: string;
  os: string;
  browser: string;
  category: 'mobile' | 'tablet' | 'desktop' | 'bot' | 'unknown';
}

function detect(userAgent: string): Pick<DeviceInfo, 'os' | 'browser' | 'category'> {
  const ua = userAgent.toLowerCase();
  let os = 'unknown';
  if (ua.includes('windows')) os = 'windows';
  else if (ua.includes('mac os x') || ua.includes('macintosh')) os = 'macos';
  else if (ua.includes('android')) os = 'android';
  else if (ua.includes('iphone') || ua.includes('ios')) os = 'ios';
  else if (ua.includes('linux')) os = 'linux';
  else if (ua.includes('freebsd')) os = 'freebsd';

  let browser = 'unknown';
  if (ua.includes('edg/') || ua.includes('edge/')) browser = 'edge';
  else if (ua.includes('opr/') || ua.includes('opera')) browser = 'opera';
  else if (ua.includes('chrome')) browser = 'chrome';
  else if (ua.includes('safari')) browser = 'safari';
  else if (ua.includes('firefox')) browser = 'firefox';

  let category: DeviceInfo['category'] = 'unknown';
  if (/bot|crawler|spider|slurp|curl|wget|python-requests/i.test(ua)) category = 'bot';
  else if (ua.includes('mobi') || ua.includes('iphone') || ua.includes('android')) category = 'mobile';
  else if (ua.includes('ipad') || ua.includes('tablet')) category = 'tablet';
  else if (ua.includes('windows') || ua.includes('macintosh') || ua.includes('x11') || ua.includes('linux')) {
    category = 'desktop';
  }

  return { os, browser, category };
}

export class DeviceService {
  describe(input: DeviceInfoInput): DeviceInfo {
    const userAgent = input.userAgent ?? '';
    const { os, browser, category } = detect(userAgent);
    const fingerprint = stableFingerprint(input);
    return {
      id: input.xDeviceId ?? fingerprint,
      userAgent,
      os,
      browser,
      category,
    };
  }
}

/** Stable per-user-agent fingerprint (no PII, suitable for trust cookies). */
export function stableFingerprint(input: DeviceInfoInput): string {
  const source = `${input.userAgent ?? ''}|${input.acceptLanguage ?? ''}`;
  if (!source) return 'unknown-device';
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `dev-${(hash >>> 0).toString(36)}`;
}