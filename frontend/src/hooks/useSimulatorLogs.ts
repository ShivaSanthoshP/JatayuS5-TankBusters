import { useEffect, useRef, useState, useCallback } from 'react';
import type { SimulatorLogEvent, SimulatorMetrics } from '../types';

export function useSimulatorLogs(simulatorId: number | null) {
  const [logs, setLogs] = useState<string[]>([]);
  const [wsStatus, setWsStatus] = useState<string>('stopped');
  const [currentLine, setCurrentLine] = useState(0);
  const [totalLines, setTotalLines] = useState(0);
  const [liveMetrics, setLiveMetrics] = useState<SimulatorMetrics | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (!simulatorId) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host;
    const ws = new WebSocket(`${proto}://${host}/ws/simulator-logs/${simulatorId}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (e) => {
      try {
        const msg: SimulatorLogEvent = JSON.parse(e.data);

        if (msg.type === 'log_line' && msg.line != null) {
          setLogs((prev) => [...prev, msg.line!]);
          setCurrentLine(msg.line_number ?? 0);
          setTotalLines(msg.total_lines ?? 0);
        } else if (msg.type === 'status') {
          setWsStatus(msg.status ?? 'stopped');
          if (msg.current_line != null) setCurrentLine(msg.current_line);
          if (msg.total_lines != null) setTotalLines(msg.total_lines);
        } else if (msg.type === 'metric_event' && msg.metrics) {
          setLiveMetrics(msg.metrics);
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
    };

    ws.onerror = () => ws.close();
  }, [simulatorId]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  useEffect(() => {
    if (simulatorId != null) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [simulatorId, connect, disconnect]);

  return { logs, wsStatus, currentLine, totalLines, liveMetrics, connected, clearLogs, reconnect: connect };
}
