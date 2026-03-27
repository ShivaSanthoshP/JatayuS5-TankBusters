"""WebSocket endpoint for real-time metric streaming."""

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.data_sources.simulator import SimulatorDataSource
from app.agents.monitoring import statistical_anomaly_check
from app.database.session import SessionLocal
from app.database.models import SimulatorStatus
from app.services.simulator_service import SimulatorService

logger = logging.getLogger("itops.ws")

router = APIRouter(tags=["WebSocket"])


class ConnectionManager:
    """Manages active WebSocket connections."""

    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WS connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        logger.info(f"WS disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.active_connections.remove(conn)


manager = ConnectionManager()


@router.websocket("/ws/metrics")
async def websocket_metrics(websocket: WebSocket):
    """
    Stream real-time simulated metrics over WebSocket.

    Each message contains the full fleet snapshot with anomaly flags.
    Frontend can use this for live dashboard updates.
    """
    await manager.connect(websocket)
    sim = SimulatorDataSource()
    await sim.connect()

    try:
        async for batch in sim.stream_metrics():
            payload = []
            for event in batch:
                metrics_dict = {
                    "cpu_percent": event.cpu_percent,
                    "memory_percent": event.memory_percent,
                    "disk_percent": event.disk_percent,
                    "network_in_mbps": event.network_in_mbps,
                    "network_out_mbps": event.network_out_mbps,
                    "request_rate": event.request_rate,
                    "error_rate": event.error_rate,
                    "latency_ms": event.latency_ms,
                }
                stat_check = statistical_anomaly_check(metrics_dict)

                payload.append({
                    "node_name": event.node_name,
                    "node_type": event.node_type,
                    "provider": event.provider,
                    "region": event.region,
                    "metrics": metrics_dict,
                    "is_anomaly": stat_check.get("is_anomaly", False),
                    "anomaly_severity": stat_check.get("max_severity") if stat_check.get("is_anomaly") else None,
                    "metadata": event.metadata,
                })

            await websocket.send_json({
                "type": "metric_batch",
                "data": payload,
                "timestamp": asyncio.get_event_loop().time(),
            })
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WS error: {e}")
        manager.disconnect(websocket)
    finally:
        await sim.disconnect()


def _apply_variance(config: dict) -> dict:
    """Add ±5% random variance to metric values for realism."""
    import random
    result = {}
    for key, value in config.items():
        if isinstance(value, (int, float)) and value > 0:
            spread = value * 0.05
            result[key] = round(max(0.0, value + random.uniform(-spread, spread)), 2)
        else:
            result[key] = value
    return result


@router.websocket("/ws/simulator-logs/{simulator_id}")
async def websocket_simulator_logs(websocket: WebSocket, simulator_id: int):
    """
    Stream log lines for a simulator.  The background advancement loop in
    main.py drives line progression; this endpoint just observes DB state
    and pushes new lines + status updates to the connected client.

    Messages sent:
    - {"type": "log_line",    "line": "...", "line_number": N, "total_lines": M}
    - {"type": "status",      "status": "running|paused|stopped|finished", "current_line": N, "total_lines": M}
    - {"type": "metric_event","metrics": {...}, "timestamp": T}
    - {"type": "error",       "message": "..."}
    """
    await websocket.accept()
    db = SessionLocal()
    try:
        svc = SimulatorService(db)
        sim = svc.get_simulator(simulator_id)

        if not sim:
            await websocket.send_json({"type": "error", "message": "Simulator not found"})
            await websocket.close()
            return

        # Track how many lines we've already sent to this client
        last_sent_index = 0

        # Send initial status
        await websocket.send_json({
            "type": "status",
            "status": sim.status.value,
            "current_line": sim.current_line_index,
            "total_lines": sim.total_lines,
        })

        while True:
            db.refresh(sim)
            current_idx = sim.current_line_index

            # Stream any lines the background task has advanced past
            if current_idx > last_sent_index and sim.log_file_content:
                lines = sim.log_file_content.strip().split("\n")
                for i in range(last_sent_index, min(current_idx, len(lines))):
                    await websocket.send_json({
                        "type": "log_line",
                        "line": lines[i],
                        "line_number": i + 1,
                        "total_lines": sim.total_lines,
                        "timestamp": asyncio.get_event_loop().time(),
                    })
                last_sent_index = current_idx

            # Status pulse every tick
            await websocket.send_json({
                "type": "status",
                "status": sim.status.value,
                "current_line": current_idx,
                "total_lines": sim.total_lines,
            })

            # Metrics pulse when enabled and running
            if (
                sim.metrics_enabled
                and sim.metrics_config
                and sim.status == SimulatorStatus.RUNNING
            ):
                await websocket.send_json({
                    "type": "metric_event",
                    "metrics": _apply_variance(sim.metrics_config),
                    "timestamp": asyncio.get_event_loop().time(),
                })

            await asyncio.sleep(1)

    except WebSocketDisconnect:
        logger.info(f"Simulator WS disconnected: {simulator_id}")
    except Exception as e:
        logger.error(f"Simulator WS error: {e}")
    finally:
        db.close()
