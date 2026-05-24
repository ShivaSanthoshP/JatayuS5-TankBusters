import { useEffect, useRef, useState } from 'react';
import type { WsMetricEvent } from '../types';

export function useMetricsStream() {
  const [data, setData] = useState<WsMetricEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;

    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${window.location.host}/ws/metrics`);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'metric_batch') setData(msg.data);
        } catch {
          // Ignore malformed websocket frames; the next valid batch will refresh state.
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (active) {
          reconnectTimer.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      active = false;
      if (reconnectTimer.current !== null) {
        clearTimeout(reconnectTimer.current);
      }
      wsRef.current?.close();
    };
  }, []);

  return { data, connected };
}
