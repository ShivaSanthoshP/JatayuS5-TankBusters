import { useEffect, useRef, useState, useCallback } from 'react';
import type { WsMetricEvent } from '../types';

export function useMetricsStream() {
  const [data, setData] = useState<WsMetricEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/metrics`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'metric_batch') setData(msg.data);
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      setConnected(false);
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current !== null) {
        clearTimeout(reconnectTimer.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  return { data, connected };
}
