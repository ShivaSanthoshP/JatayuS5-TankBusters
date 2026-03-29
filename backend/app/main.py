from __future__ import annotations
"""
Dynamic IT Operations Orchestrator — FastAPI Application

Multi-agent AIOps platform for autonomous infrastructure monitoring,
predictive failure detection, root cause analysis, and self-healing
remediation with human-in-the-loop approval.
"""

import asyncio
import logging
import random
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database.session import init_db, SessionLocal
from app.api.routes import infrastructure, incidents, agents, ws, datasources, simulators
from app.services.infra_service import InfraService
from app.agents.orchestrator import run_pipeline
from app.agents.monitoring import statistical_anomaly_check
from app.data_sources.simulator import SimulatorDataSource
from app.data_sources.base import MetricEvent, registry
from app.config import SIMULATOR_INTERVAL_SECONDS

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("itops")

# Background task handles
_monitoring_task: asyncio.Task | None = None
_simulator_task: asyncio.Task | None = None


def _metrics_from_config(config: dict) -> dict:
    """Apply ±5 % random variance to a simulator metrics config."""
    result = {}
    for key, value in config.items():
        if isinstance(value, (int, float)) and value > 0:
            spread = value * 0.05
            result[key] = round(max(0.0, value + random.uniform(-spread, spread)), 2)
        else:
            result[key] = value
    return result


def _event_from_sim(sim_row) -> MetricEvent:
    """Build a MetricEvent from a running user-created simulator with metrics."""
    cfg = _metrics_from_config(sim_row.metrics_config or {})
    from app.services.simulator_service import SIMULATOR_TO_NODE_TYPE
    node_type = SIMULATOR_TO_NODE_TYPE.get(sim_row.simulator_type, "server")
    return MetricEvent(
        node_name=sim_row.name,
        node_type=node_type,
        provider="simulated",
        region="us-east-1",
        ip_address=f"10.1.0.{sim_row.id}",
        cpu_percent=cfg.get("cpu_percent", 45),
        memory_percent=cfg.get("memory_percent", 60),
        disk_percent=cfg.get("disk_percent", 35),
        network_in_mbps=cfg.get("network_in_mbps", 50),
        network_out_mbps=cfg.get("network_out_mbps", 30),
        request_rate=cfg.get("request_rate", 200),
        error_rate=cfg.get("error_rate", 1),
        latency_ms=cfg.get("latency_ms", 80),
    )


def _event_to_ws_payload(event: MetricEvent, stat_result: dict) -> dict:
    """Convert a MetricEvent + anomaly check into the WS payload dict."""
    return {
        "node_name": event.node_name,
        "node_type": event.node_type,
        "provider": event.provider,
        "region": event.region,
        "metrics": {
            "cpu_percent": event.cpu_percent,
            "memory_percent": event.memory_percent,
            "disk_percent": event.disk_percent,
            "network_in_mbps": event.network_in_mbps,
            "network_out_mbps": event.network_out_mbps,
            "request_rate": event.request_rate,
            "error_rate": event.error_rate,
            "latency_ms": event.latency_ms,
        },
        "is_anomaly": stat_result.get("is_anomaly", False),
        "anomaly_severity": stat_result.get("max_severity") if stat_result.get("is_anomaly") else None,
        "metadata": event.metadata,
    }


async def _process_event(event: MetricEvent, infra_svc, incident_svc, db):
    """Store a metric event, run anomaly detection, and trigger the pipeline if needed."""
    node = infra_svc.ensure_node_exists(event)
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

    stat_result = statistical_anomaly_check(metrics_dict)
    infra_svc.store_metric(
        node, event,
        is_anomaly=stat_result.get("is_anomaly", False),
        anomaly_scores=stat_result,
    )

    if stat_result.get("is_anomaly"):
        max_sev = stat_result.get("max_severity", "medium")
        if max_sev == "critical":
            infra_svc.update_node_status(node, "critical")
        else:
            infra_svc.update_node_status(node, "degraded")

        full_metrics = {
            **metrics_dict,
            "node_name": event.node_name,
            "node_type": event.node_type,
            "provider": event.provider,
            "region": event.region,
        }
        metric_history = infra_svc.get_recent_metrics_as_history(node.id)
        db.commit()

        logger.info(f"Anomaly on {event.node_name} ({max_sev}) — running pipeline")
        try:
            state = await run_pipeline(full_metrics, metric_history)
            if state.get("is_anomaly"):
                incident_svc.create_incident_from_pipeline(node.id, state)
        except Exception as e:
            logger.error(f"Pipeline error for {event.node_name}: {e}")
    else:
        infra_svc.update_node_status(node, "healthy")

    return stat_result


async def background_monitoring_loop():
    """
    Continuous background loop that:
    1. Streams simulated metrics from the fleet data source.
    2. Also generates metrics for running user simulators (vm/db/cache/lb/queue)
       that have metrics_enabled.
    3. Runs statistical anomaly detection on every event.
    4. For anomalous nodes, triggers the full agent pipeline.
    5. Persists all results to the database.
    6. Broadcasts the combined payload to WebSocket clients so the
       Dashboard shows exactly the same data as Infrastructure.
    """
    from app.api.routes.ws import manager as ws_manager

    sim = SimulatorDataSource()
    await sim.connect()
    registry.register(sim)

    logger.info("Background monitoring loop started")

    try:
        async for batch in sim.stream_metrics():
            db = SessionLocal()
            try:
                infra_svc = InfraService(db)
                from app.services.incident_service import IncidentService
                from app.database.models import (
                    Simulator as _SimModel,
                    SimulatorType as _SimType,
                    SimulatorStatus as _SimStatus,
                )
                incident_svc = IncidentService(db)

                ws_payload: list[dict] = []

                # ── 1.  Fleet nodes (metrics-type simulators) ─────────
                active_fleet = set(
                    row.name for row in db.query(_SimModel.name)
                    .filter(
                        _SimModel.simulator_type == _SimType.METRICS,
                        _SimModel.status == _SimStatus.RUNNING,
                    ).all()
                )

                for event in batch:
                    if event.node_name not in active_fleet:
                        continue
                    stat_result = await _process_event(event, infra_svc, incident_svc, db)
                    ws_payload.append(_event_to_ws_payload(event, stat_result))

                # ── 2.  User simulators with metrics enabled ──────────
                user_sims = (
                    db.query(_SimModel)
                    .filter(
                        _SimModel.simulator_type != _SimType.METRICS,
                        _SimModel.status == _SimStatus.RUNNING,
                        _SimModel.metrics_enabled.is_(True),
                    )
                    .all()
                )
                for sim_row in user_sims:
                    if not sim_row.metrics_config:
                        continue
                    event = _event_from_sim(sim_row)
                    stat_result = await _process_event(event, infra_svc, incident_svc, db)
                    ws_payload.append(_event_to_ws_payload(event, stat_result))

                db.commit()

                # ── 3.  Broadcast to all WebSocket clients ────────────
                if ws_payload:
                    await ws_manager.broadcast({
                        "type": "metric_batch",
                        "data": ws_payload,
                        "timestamp": asyncio.get_event_loop().time(),
                    })

            except Exception as e:
                logger.error(f"Monitoring loop error: {e}", exc_info=True)
                db.rollback()
            finally:
                db.close()

    except asyncio.CancelledError:
        logger.info("Background monitoring loop cancelled")
    finally:
        await sim.disconnect()


async def background_simulator_advancement():
    """
    Advance log lines for all running simulators at their configured intervals.
    Runs every second and advances any simulator whose interval has elapsed.
    """
    import datetime as dt
    from app.database.models import Simulator as SimModel, SimulatorStatus as SimStatus, SimulatorType as SimType
    from app.services.simulator_service import SimulatorService

    logger.info("Simulator advancement loop started")
    while True:
        await asyncio.sleep(1)
        db = SessionLocal()
        try:
            now = dt.datetime.utcnow()
            # Only advance log-playback simulators (not fleet metrics sims)
            running = (
                db.query(SimModel)
                .filter(
                    SimModel.status == SimStatus.RUNNING,
                    SimModel.simulator_type != SimType.METRICS,
                )
                .all()
            )
            for sim in running:
                reference = sim.last_advance_at or sim.updated_at or now
                elapsed = (now - reference).total_seconds()
                if elapsed >= sim.interval_seconds:
                    svc = SimulatorService(db)
                    _, finished = svc.advance_line(sim.id)
                    sim.last_advance_at = now
                    if finished:
                        svc.set_status(sim.id, SimStatus.STOPPED)
                    else:
                        db.commit()
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"Simulator advancement error: {e}")
            try:
                db.rollback()
            except Exception:
                pass
        finally:
            db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: start/stop background monitoring."""
    global _monitoring_task, _simulator_task

    # Initialize database
    init_db()
    logger.info("Database initialized")

    # Seed fleet nodes as metrics-type simulators (so they appear in the Simulators page)
    from app.data_sources.simulator import _build_fleet
    from app.services.simulator_service import SimulatorService as _SimSvc
    _seed_db = SessionLocal()
    try:
        fleet_nodes = _build_fleet()
        seeded = _SimSvc(_seed_db).seed_fleet_simulators(fleet_nodes)
        if seeded:
            logger.info(f"Seeded {seeded} fleet metrics simulators into DB")
    finally:
        _seed_db.close()

    # Start background tasks
    _monitoring_task = asyncio.create_task(background_monitoring_loop())
    _simulator_task = asyncio.create_task(background_simulator_advancement())
    logger.info("Background monitoring started")

    yield

    # Shutdown
    for task in (_monitoring_task, _simulator_task):
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
    logger.info("Application shutdown complete")


# ── App setup ───────────────────────────────────────────────────────

app = FastAPI(
    title="IT Operations Orchestrator",
    description=(
        "Autonomous Multi-Agent AIOps Platform for Self-Healing Enterprise Infrastructure. "
        "Monitors infrastructure, predicts failures, diagnoses root causes, "
        "and orchestrates remediation with human-in-the-loop approval."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(infrastructure.router, prefix="/api")
app.include_router(incidents.router, prefix="/api")
app.include_router(agents.router, prefix="/api")
app.include_router(datasources.router, prefix="/api")
app.include_router(simulators.router, prefix="/api")
app.include_router(ws.router)


@app.get("/")
def root():
    return {
        "name": "IT Operations Orchestrator",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
        "agents": [
            "monitoring", "predictive", "diagnostic",
            "remediation", "reporting",
        ],
        "data_sources": registry.provider_names,
    }


@app.get("/health")
def health():
    return {"status": "healthy"}
