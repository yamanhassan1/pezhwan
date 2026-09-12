/**
 * PEZHWAN — WebSocket entry point.
 *
 *   attachWebSocketServer(server, runtime, options?) → PezhwanWebSocketServer
 *
 * Registers an `upgrade` listener on an existing Node http(s) server. The
 * Upgrade request is authenticated with the runtime access-token verifier;
 * invalid or missing credentials receive a plain 401 before the socket is
 * destroyed.
 */

import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { PezhwanRuntime } from '@pezhwan/core';
import { authenticateHandshake } from './auth.ts';
import { PezhwanWebSocketServer, type PezhwanWebSocketOptions } from './server.ts';

export interface AttachWebSocketOptions extends PezhwanWebSocketOptions {
  /** Callback for unauthenticated upgrades (default: 401 then destroy). */
  onReject?: (req: IncomingMessage) => void;
}

export function attachWebSocketServer(
  server: HttpServer,
  runtime: PezhwanRuntime,
  options: AttachWebSocketOptions = {},
): PezhwanWebSocketServer {
  const ws = new PezhwanWebSocketServer(options);
  const path = options.path ?? '/ws';

  server.on('upgrade', (req: IncomingMessage, socket: Duplex) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== path) {
      socket.destroy();
      return;
    }
    const identity = authenticateHandshake(runtime, req);
    if (!identity) {
      options.onReject?.(req);
      socket.write('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n');
      socket.destroy();
      return;
    }
    ws.handleUpgrade(req, socket, identity);
  });

  return ws;
}

export { PezhwanWebSocketServer, type WsClient, type PezhwanWebSocketOptions } from './server.ts';
export { PEZHWAN_WS_EVENTS, wsEvent, type WsEventMessage, type PezhwanWsEventType } from './events.ts';
export { extractWsAccessToken, authenticateHandshake } from './auth.ts';