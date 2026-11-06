import type { Server as HttpServer } from 'node:http';

import { WebSocket, WebSocketServer } from 'ws';

import type { Config } from './config.js';
import { verifyAccessToken } from './lib/tokens.js';

// Live updates over a WebSocket. The server only pushes tiny "something changed" hints; the app reacts
// by refetching through the normal API, so authorisation always happens in one place (the routes).
// Never put private data in an event.
export type RealtimeEvent = { type: 'friends' } | { type: 'leaderboard'; challengeId: string }; // used by challenges (phase 6)

export type Hub = {
  /** Sends an event to every open connection of `userId` (all their devices). */
  publish(userId: string, event: RealtimeEvent): void;
  /** Starts accepting WebSocket connections on /ws of an HTTP server. */
  attach(server: HttpServer): void;
  close(): void;
};

const AUTH_TIMEOUT_MS = 5_000;
const HEARTBEAT_MS = 30_000;
const MAX_CONNECTIONS_PER_USER = 5;
const MAX_MESSAGE_BYTES = 4096;

export function createHub(config: Config): Hub {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  const byUser = new Map<string, Set<WebSocket>>();
  const alive = new WeakSet<WebSocket>();

  const send = (ws: WebSocket, message: object) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  };

  wss.on('connection', (ws) => {
    let userId: string | null = null;

    // The token travels in the first message, not the URL, because URLs end up in server logs.
    const authTimer = setTimeout(() => ws.close(4001, 'auth timeout'), AUTH_TIMEOUT_MS);

    ws.on('message', (raw) => {
      if (userId) return; // after authentication the client has nothing to say
      let msg: { type?: string; token?: string };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.close(4002, 'bad message');
        return;
      }
      const id =
        msg.type === 'auth' && typeof msg.token === 'string'
          ? verifyAccessToken(msg.token, config)
          : null;
      if (!id) {
        send(ws, { type: 'auth_error' });
        ws.close(4003, 'unauthorized');
        return;
      }
      const sockets = byUser.get(id) ?? new Set<WebSocket>();
      if (sockets.size >= MAX_CONNECTIONS_PER_USER) {
        ws.close(4004, 'too many connections');
        return;
      }
      clearTimeout(authTimer);
      userId = id;
      sockets.add(ws);
      byUser.set(id, sockets);
      alive.add(ws);
      send(ws, { type: 'ready' });
    });

    ws.on('pong', () => alive.add(ws));
    ws.on('close', () => {
      clearTimeout(authTimer);
      if (!userId) return;
      const sockets = byUser.get(userId);
      sockets?.delete(ws);
      if (sockets?.size === 0) byUser.delete(userId);
    });
    ws.on('error', () => ws.terminate());
  });

  // Mobile networks drop connections silently, so ping regularly and drop sockets that stop answering.
  const heartbeat = setInterval(() => {
    for (const sockets of byUser.values()) {
      for (const ws of sockets) {
        if (!alive.has(ws)) {
          ws.terminate();
          continue;
        }
        alive.delete(ws);
        ws.ping();
      }
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  return {
    publish(userId, event) {
      for (const ws of byUser.get(userId) ?? []) send(ws, event);
    },
    attach(server) {
      server.on('upgrade', (req, socket, head) => {
        if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/ws') {
          socket.destroy();
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
      });
    },
    close() {
      clearInterval(heartbeat);
      for (const client of wss.clients) client.terminate();
      wss.close();
    },
  };
}

/** A hub that delivers nothing, for tests and tools that do not need live updates. */
export const nullHub: Hub = { publish() {}, attach() {}, close() {} };
