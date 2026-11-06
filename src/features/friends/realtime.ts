import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { freshAccessToken } from '@/lib/api';
import { env } from '@/lib/env';

const MAX_BACKOFF_MS = 30_000;

/**
 * Keeps one WebSocket open to the server while signed in. The server pushes tiny "something changed"
 * hints, and this reacts by refetching through the normal API, so a friend request appears on screen
 * within a moment, with no polling. It reconnects with exponential backoff (mobile networks drop
 * connections silently) and when the app returns to the foreground.
 */
export function useRealtime(enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ['friends'] });
    // http -> ws, https -> wss
    const url = `${env.apiUrl.replace(/^http/, 'ws')}/ws`;

    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;

    const scheduleReconnect = () => {
      if (stopped) return;
      timer = setTimeout(connect, Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt++));
    };

    async function connect() {
      if (stopped) return;
      // The WebSocket cannot refresh tokens itself, so make sure the one we send is valid.
      const token = await freshAccessToken();
      if (stopped) return;
      if (!token) return scheduleReconnect();

      const ws = new WebSocket(url);
      socket = ws;
      // The token goes in the first message, not the URL (URLs get logged).
      ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token }));
      ws.onmessage = (event) => {
        let message: { type?: string };
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (message.type === 'ready') {
          attempt = 0;
          refresh(); // catch up on anything that happened while we were disconnected
        } else if (message.type === 'friends') {
          refresh();
        }
      };
      ws.onclose = () => {
        if (socket === ws) socket = null;
        scheduleReconnect();
      };
      ws.onerror = () => ws.close();
    }

    void connect();

    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      refresh();
      // After the phone slept the socket may be dead without having told us.
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        clearTimeout(timer);
        attempt = 0;
        socket?.close();
        socket = null;
        void connect();
      }
    });

    return () => {
      stopped = true;
      clearTimeout(timer);
      sub.remove();
      socket?.close();
    };
  }, [enabled, queryClient]);
}
