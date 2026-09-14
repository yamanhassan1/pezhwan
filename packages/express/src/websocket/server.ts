/**
 * PEZHWAN — dependency-free RFC 6455 WebSocket server.
 *
 * Handles the HTTP upgrade handshake and a minimal framed subset of the
 * protocol (text, ping/pong, close) over the raw TCP socket so the express
 * package can serve realtime events without pulling in a WebSocket library.
 *
 * Wire format:
 *   client → server  masked frames (required by RFC 6455 §5.3)
 *   server → client  unmasked frames
 */

import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { IdentityContext } from '@pezhwan/shared';
import { wsEvent } from './events.ts';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const OP_CONTINUATION = 0x0;
const OP_TEXT = 0x1;
const OP_BINARY = 0x2;
const OP_CLOSE = 0x8;
const OP_PING = 0x9;
const OP_PONG = 0xa;
const FIN = 0x80;

export interface WsClient {
  id: string;
  socket: Duplex;
  identity: IdentityContext;
  connectedAt: number;
}

export interface PezhwanWebSocketOptions {
  /** Upgrade path, default `/ws`. */
  path?: string;
  /** Maximum accepted text-frame payload in bytes, default 256 KiB. */
  maxPayload?: number;
}

export class PezhwanWebSocketServer extends EventEmitter {
  private readonly clients = new Map<string, WsClient>();
  private readonly maxPayload: number;

  constructor(private readonly options: PezhwanWebSocketOptions = {}) {
    super();
    this.maxPayload = options.maxPayload ?? 256 * 1024;
  }

  get clientCount(): number {
    return this.clients.size;
  }

  clientsList(): WsClient[] {
    return [...this.clients.values()];
  }

  handleUpgrade(req: IncomingMessage, socket: Duplex, identity: IdentityContext): void {
    const key =
      typeof req.headers['sec-websocket-key'] === 'string' ? req.headers['sec-websocket-key'] : '';
    if (!key) {
      socket.destroy();
      return;
    }
    const accept = createHash('sha1')
      .update(key + WS_GUID)
      .digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );

    const client: WsClient = {
      id: `${accept}-${Date.now().toString(36)}`,
      socket,
      identity,
      connectedAt: Date.now(),
    };

    let buffer: Buffer = Buffer.alloc(0);
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      buffer = this.consumeFrames(client, buffer);
    });
    socket.on('error', () => this.drop(client));
    socket.on('close', () => this.drop(client));

    this.clients.set(client.id, client);
    this.emit('connection', client);
  }

  /** Parse and dispatch as many complete frames as `buffer` contains. */
  private consumeFrames(client: WsClient, buffer: Buffer): Buffer {
    while (buffer.length >= 2) {
      const b0 = buffer[0]!;
      const b1 = buffer[1]!;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let length = b1 & 0x7f;
      let offset = 2;

      if (length === 126) {
        if (buffer.length < 4) return buffer;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) return buffer;
        const hi = buffer.readUInt32BE(2);
        const lo = buffer.readUInt32BE(6);
        if (hi !== 0) {
          this.fail(client, 1009);
          return Buffer.alloc(0);
        }
        length = lo;
        offset = 10;
      }

      if (length > this.maxPayload) {
        this.fail(client, 1009);
        return Buffer.alloc(0);
      }

      const maskLen = masked ? 4 : 0;
      if (buffer.length < offset + maskLen + length) return buffer;

      let payload = buffer.subarray(offset + maskLen, offset + maskLen + length);
      if (masked) {
        const mask = buffer.subarray(offset, offset + 4);
        const unmasked = Buffer.allocUnsafe(payload.length);
        for (let i = 0; i < payload.length; i += 1) {
          unmasked[i] = payload[i]! ^ mask[i % 4]!;
        }
        payload = unmasked;
      }

      buffer = buffer.subarray(offset + maskLen + length);

      switch (opcode) {
        case OP_TEXT: {
          this.emit('message', client, payload.toString('utf8'));
          break;
        }
        case OP_BINARY: {
          this.emit('binary', client, payload);
          break;
        }
        case OP_PING: {
          this.writeFrame(client.socket, OP_PONG, payload);
          break;
        }
        case OP_CLOSE: {
          this.drop(client);
          return Buffer.alloc(0);
        }
        case OP_CONTINUATION:
        case OP_PONG: {
          break;
        }
        default: {
          this.fail(client, 1002);
          return Buffer.alloc(0);
        }
      }
    }
    return buffer;
  }

  /** Write an unmasked server frame. */
  private writeFrame(socket: Duplex, opcode: number, payload: Buffer): void {
    const header: number[] = [FIN | opcode];
    if (payload.length < 126) {
      header.push(payload.length);
    } else if (payload.length < 65536) {
      header.push(126, (payload.length >> 8) & 0xff, payload.length & 0xff);
    } else {
      header.push(
        127,
        0,
        0,
        0,
        0,
        (payload.length >>> 24) & 0xff,
        (payload.length >>> 16) & 0xff,
        (payload.length >>> 8) & 0xff,
        payload.length & 0xff,
      );
    }
    socket.write(Buffer.from(header));
    socket.write(payload);
  }

  /** Send a JSON event to every connected client. */
  broadcast(type: string, payload?: Record<string, unknown>): void {
    const message = wsEvent(type, payload);
    const data = Buffer.from(JSON.stringify(message));
    for (const client of this.clients.values()) {
      this.writeFrame(client.socket, OP_TEXT, data);
    }
  }

  send(client: WsClient, type: string, payload?: Record<string, unknown>): void {
    const data = Buffer.from(JSON.stringify(wsEvent(type, payload)));
    this.writeFrame(client.socket, OP_TEXT, data);
  }

  /** Terminate a connection with a protocol-error close frame. */
  private fail(client: WsClient, code: number): void {
    try {
      const data = Buffer.allocUnsafe(2);
      data.writeUInt16BE(code, 0);
      this.writeFrame(client.socket, OP_CLOSE, data);
    } catch {
      /* socket already broken */
    }
    this.drop(client);
  }

  private drop(client: WsClient): void {
    if (!this.clients.delete(client.id)) return;
    this.emit('close', client);
    client.socket.destroy();
  }

  close(): void {
    for (const client of [...this.clients.values()]) {
      try {
        this.writeFrame(client.socket, OP_CLOSE, Buffer.from([0x03, 0xe8]));
      } catch {
        /* ignore */
      }
      client.socket.destroy();
    }
    this.clients.clear();
  }
}
