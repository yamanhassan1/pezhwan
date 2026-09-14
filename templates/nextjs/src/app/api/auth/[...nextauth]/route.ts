import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const PEZHWAN_URL = process.env.PEZHWAN_URL ?? 'http://localhost:4011';

/**
 * Refresh-token proxy. Forwards the client's refresh request to the PEZHWAN
 * identity server and relays the response — including any Set-Cookie from the
 * rotation — so the browser never talks to the auth server directly.
 */
export async function POST(request: NextRequest) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine — refresh may rely on the httpOnly cookie
  }

  const upstream = await fetch(`${PEZHWAN_URL}/v1/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(request.headers.get('cookie') ? { Cookie: request.headers.get('cookie') as string } : {}),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const data = (await upstream.json().catch(() => ({}))) as { error?: { message?: string } };
  const response = NextResponse.json(data, { status: upstream.status });

  const setCookie = upstream.headers.get('set-cookie');
  if (setCookie) {
    response.headers.set('set-cookie', setCookie);
  }

  return response;
}
