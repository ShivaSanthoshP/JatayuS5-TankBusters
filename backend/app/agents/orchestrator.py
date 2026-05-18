from __future__ import annotations
"""
LangGraph Orchestrator — the brain of the AIOps platform.

Defines a stateful workflow graph:
  Monitor → Predict → Diagnose → Remediate → Report

Fully automated pipeline — no human-in-the-loop gates.
Remediation scripts are generated for review/download only (never executed).
"""

import asyncio
import logging
from inspect import isawaitable
from typing import TypedDict, Any, Optional, Callable

NODE_TIMEOUT_SECONDS = 30

from langgraph.graph import StateGraph, END

from app.agents.monitoring import analyze_metrics
from app.agents.predictive import predict_failure
from app.agents.diagnostic import diagnose
from app.agents.remediation import generate_remediation
from app.agents.reporting import generate_report
from app.config import utc_now

logger = logging.getLogger("itops.orchestrator")


# ── State definition ────────────────────────────────────────────────

class OrchestratorState(TypedDict, total=False):
    """Shared state passed between agent nodes in the graph."""
    # Input
    metrics: dict
    metric_history: str
    log_history: str

    # Agent outputs (accumulated as the graph executes)
    monitoring_result: dict
    prediction_result: dict
    diagnostic_result: dict
    remediation_result: dict
    reporting_result: dict

    # Control flow
    is_anomaly: bool
    severity: str
    incident_id: Optional[int]
    status: str  # current pipeline stage
    error: Optional[str]

    # Metadata
    started_at: str
    completed_at: str
    agent_trace: list[dict]
    progress_callback: Any


async def _emit_progress(
    state: OrchestratorState,
    agent: str,
    phase: str,
    message: str,
    **details,
) -> None:
    """Emit a progress event to the optional pipeline observer."""
    callback = state.get("progress_callback")
    if not callback:
        return

    event = {
        "agent": agent,
        "phase": phase,
        "message": message,
        "timestamp": utc_now().isoformat(),
        **details,
    }

    try:
        result = callback(event)
        if isawaitable(result):
            await result
    except Exception:
        logger.warning("Progress callback failed", exc_info=True)


async def _run_with_timeout(coro, node_name: str, timeout: float = NODE_TIMEOUT_SECONDS):
    """Run a coroutine with a timeout. Returns result or raises TimeoutError."""
    try:
        return await asyncio.wait_for(coro, timeout=timeout)
    except asyncio.TimeoutError:
        raise asyncio.TimeoutError(f"Agent '{node_name}' timed out after {timeout}s")


# ── Node functions ──────────────────────────────────────────────────

async def monitoring_node(state: OrchestratorState) -> dict:
    """Run the Monitoring Agent to detect anomalies."""
    logger.info("Orchestrator: Running Monitoring Agent")
    started = utc_now()
    await _emit_progress(state, "monitoring", "started", "Monitoring agent started")
    try:
        result = await _run_with_timeout(
            analyze_metrics(
                state["metrics"],
                log_history=state.get("log_history", "No logs available"),
            ),
            "monitoring",
        )
    except Exception as exc:
        logger.warning("Monitoring agent failed (partial): %s", exc)
        result = {"is_anomaly": False, "anomaly_type": None, "severity": None,
                  "description": f"Monitoring agent failed: {exc}", "affected_metrics": [],
                  "log_evidence": "", "agent": "monitoring", "partial_failure": True}

    trace_entry = {
        "agent": "monitoring",
        "started_at": started.isoformat(),
        "completed_at": utc_now().isoformat(),
        "is_anomaly": result.get("is_anomaly", False),
        "partial_failure": result.get("partial_failure", False),
    }
    trace = state.get("agent_trace", [])
    trace.append(trace_entry)
    await _emit_progress(
        state,
        "monitoring",
        "completed" if not result.get("partial_failure") else "partial_failure",
        "Monitoring agent completed",
        is_anomaly=result.get("is_anomaly", False),
    )
    return {
        "monitoring_result": result,
        "is_anomaly": result.get("is_anomaly", False),
        "severity": result.get("severity"),
        "status": "monitored",
        "agent_trace": trace,
    }


async def predictive_node(state: OrchestratorState) -> dict:
    """Run the Predictive Agent to forecast failure trajectory."""
    logger.info("Orchestrator: Running Predictive Agent")
    started = utc_now()
    await _emit_progress(state, "predictive", "started", "Predictive agent started")
    try:
        result = await _run_with_timeout(
            predict_failure(
                anomaly_data=state["monitoring_result"],
                metrics=state["metrics"],
                metric_history=state.get("metric_history", "No history available"),
                log_history=state.get("log_history", "No logs available"),
            ),
            "predictive",
        )
    except Exception as exc:
        logger.warning("Predictive agent failed (partial): %s", exc)
        result = {"failure_probability": 0.5, "predicted_impact": f"Prediction unavailable: {exc}",
                  "escalation_risk": "medium", "estimated_time_to_failure": None,
                  "recommended_urgency": "monitor", "reasoning": str(exc),
                  "ewma_scores": {}, "agent": "predictive", "partial_failure": True}

    trace_entry = {
        "agent": "predictive",
        "started_at": started.isoformat(),
        "completed_at": utc_now().isoformat(),
        "failure_probability": result.get("failure_probability", 0),
        "partial_failure": result.get("partial_failure", False),
    }
    trace = state.get("agent_trace", [])
    trace.append(trace_entry)
    await _emit_progress(
        state,
        "predictive",
        "completed" if not result.get("partial_failure") else "partial_failure",
        "Predictive agent completed",
        failure_probability=result.get("failure_probability", 0),
    )

    severity = state.get("severity", "medium")
    if result.get("recommended_urgency") == "immediate" and severity not in ("high", "critical"):
        severity = "high"

    return {
        "prediction_result": result,
        "severity": severity,
        "status": "predicted",
        "agent_trace": trace,
    }


async def diagnostic_node(state: OrchestratorState) -> dict:
    """Run the Diagnostic Agent for root cause analysis."""
    logger.info("Orchestrator: Running Diagnostic Agent")
    started = utc_now()
    await _emit_progress(state, "diagnostic", "started", "Diagnostic agent started")
    try:
        result = await _run_with_timeout(
            diagnose(
                anomaly_data=state["monitoring_result"],
                prediction_data=state["prediction_result"],
                metrics=state["metrics"],
                log_history=state.get("log_history", "No logs available"),
            ),
            "diagnostic",
        )
    except Exception as exc:
        logger.warning("Diagnostic agent failed (partial): %s", exc)
        result = {"root_cause": f"Diagnosis unavailable: {exc}", "issue_type": "unknown",
                  "reasons": [], "causal_chain": [], "blast_radius": [],
                  "blast_radius_severity": "medium", "confidence": 0.3,
                  "recommended_actions": [], "similar_past_incidents": "",
                  "reasoning": str(exc), "fix_summary": "", "agent": "diagnostic",
                  "rag_context_used": False, "generated_locally": False,
                  "partial_failure": True}

    trace_entry = {
        "agent": "diagnostic",
        "started_at": started.isoformat(),
        "completed_at": utc_now().isoformat(),
        "root_cause": result.get("root_cause", "unknown"),
        "confidence": result.get("confidence", 0),
        "partial_failure": result.get("partial_failure", False),
    }
    trace = state.get("agent_trace", [])
    trace.append(trace_entry)
    await _emit_progress(
        state,
        "diagnostic",
        "completed" if not result.get("partial_failure") else "partial_failure",
        "Diagnostic agent completed",
        root_cause=result.get("root_cause"),
    )
    return {
        "diagnostic_result": result,
        "status": "diagnosed",
        "agent_trace": trace,
    }


async def remediation_node(state: OrchestratorState) -> dict:
    """Run the Remediation Agent to generate fix plan."""
    logger.info("Orchestrator: Running Remediation Agent")
    started = utc_now()
    await _emit_progress(state, "remediation", "started", "Remediation agent started")
    try:
        result = await _run_with_timeout(
            generate_remediation(
                diagnostic_data=state["diagnostic_result"],
                metrics=state["metrics"],
                log_history=state.get("log_history", "No logs available"),
            ),
            "remediation",
        )
    except Exception as exc:
        logger.warning("Remediation agent failed (partial): %s", exc)
        result = {"plan_summary": f"Remediation unavailable: {exc}", "strategy": "manual",
                  "artifacts": [], "steps": [], "total_estimated_duration_seconds": 0,
                  "requires_downtime": False, "canary_compatible": False,
                  "reasoning": str(exc), "issue_type": "unknown", "service_name": "unknown",
                  "agent": "remediation", "generated_locally": False, "rag_context_used": False,
                  "partial_failure": True}

    trace_entry = {
        "agent": "remediation",
        "started_at": started.isoformat(),
        "completed_at": utc_now().isoformat(),
        "steps_count": len(result.get("steps", [])),
        "canary_compatible": result.get("canary_compatible", False),
        "partial_failure": result.get("partial_failure", False),
    }
    trace = state.get("agent_trace", [])
    trace.append(trace_entry)
    await _emit_progress(
        state,
        "remediation",
        "completed" if not result.get("partial_failure") else "partial_failure",
        "Remediation agent completed",
        steps_count=len(result.get("steps", [])),
    )
    return {
        "remediation_result": result,
        "status": "remediating",
        "agent_trace": trace,
    }


async def reporting_node(state: OrchestratorState) -> dict:
    """Run the Reporting Agent to generate incident report + runbook."""
    logger.info("Orchestrator: Running Reporting Agent")
    started = utc_now()
    await _emit_progress(state, "reporting", "started", "Reporting agent started")

    result = await generate_report(
        monitoring_data=state.get("monitoring_result", {}),
        prediction_data=state.get("prediction_result", {}),
        diagnostic_data=state.get("diagnostic_result", {}),
        remediation_data=state.get("remediation_result", {}),
        metrics=state["metrics"],
        outcome="resolved",
        log_history=state.get("log_history", "No logs available"),
        agent_trace=state.get("agent_trace", []),
    )

    trace_entry = {
        "agent": "reporting",
        "started_at": started.isoformat(),
        "completed_at": utc_now().isoformat(),
    }

    trace = state.get("agent_trace", [])
    trace.append(trace_entry)
    await _emit_progress(state, "reporting", "completed", "Reporting agent completed")

    return {
        "reporting_result": result,
        "status": "resolved",
        "completed_at": utc_now().isoformat(),
        "agent_trace": trace,
    }


# ── Conditional edges ───────────────────────────────────────────────

def should_continue_after_monitoring(state: OrchestratorState) -> str:
    """After monitoring, proceed to prediction only if anomaly detected."""
    if state.get("is_anomaly"):
        return "predict"
    return "end"


# ── Graph construction ──────────────────────────────────────────────

def build_orchestrator_graph() -> StateGraph:
    """
    Build the LangGraph orchestrator workflow.

    Flow:
      monitor → [anomaly?] → predict → diagnose → remediate → report → END
    """
    graph = StateGraph(OrchestratorState)

    # Add nodes
    graph.add_node("monitor", monitoring_node)
    graph.add_node("predict", predictive_node)
    graph.add_node("diagnose", diagnostic_node)
    graph.add_node("remediate", remediation_node)
    graph.add_node("report", reporting_node)

    # Set entry point
    graph.set_entry_point("monitor")

    # Conditional: anomaly detected → predict, else → END
    graph.add_conditional_edges(
        "monitor",
        should_continue_after_monitoring,
        {"predict": "predict", "end": END},
    )

    # Predict → Diagnose → Remediate → Report
    graph.add_edge("predict", "diagnose")
    graph.add_edge("diagnose", "remediate")

    # Remediate → Report
    graph.add_edge("remediate", "report")

    # Report → END
    graph.add_edge("report", END)

    return graph


# Compiled graph (singleton)
_compiled_graph = None


def get_orchestrator():
    """Return the compiled LangGraph orchestrator (rebuilt on first call)."""
    global _compiled_graph
    if _compiled_graph is None:
        graph = build_orchestrator_graph()
        _compiled_graph = graph.compile()
    return _compiled_graph


def reset_orchestrator():
    """Force rebuild of the graph (e.g. after config change)."""
    global _compiled_graph
    _compiled_graph = None


async def run_pipeline(
    metrics: dict,
    metric_history: str = "",
    log_history: str = "",
    progress_callback: Callable[[dict], Any] | None = None,
) -> OrchestratorState:
    """
    Execute the full agent pipeline for a set of metrics.

    Returns the final state with all agent outputs.
    """
    orchestrator = get_orchestrator()

    initial_state: OrchestratorState = {
        "metrics": metrics,
        "metric_history": metric_history,
        "log_history": log_history or "No logs available",
        "is_anomaly": False,
        "severity": None,
        "incident_id": None,
        "status": "starting",
        "error": None,
        "started_at": utc_now().isoformat(),
        "completed_at": None,
        "agent_trace": [],
        "monitoring_result": {},
        "prediction_result": {},
        "diagnostic_result": {},
        "remediation_result": {},
        "reporting_result": {},
        "progress_callback": progress_callback,
    }

    try:
        await _emit_progress(
            initial_state,
            "pipeline",
            "started",
            f"Pipeline started for node: {metrics.get('node_name', 'custom')}",
        )
        try:
            final_state = await orchestrator.ainvoke(initial_state)
        except Exception as first_exc:
            logger.warning("Pipeline first attempt failed (%s), retrying in 2s...", first_exc)
            await asyncio.sleep(2)
            final_state = await orchestrator.ainvoke(initial_state)

        await _emit_progress(
            final_state,
            "pipeline",
            "completed",
            f"Pipeline completed with status: {final_state.get('status', 'unknown')}",
            is_anomaly=final_state.get("is_anomaly", False),
        )
        return final_state
    except Exception as e:
        logger.error(f"Pipeline error: {e}", exc_info=True)
        initial_state["error"] = str(e)
        initial_state["status"] = "error"
        await _emit_progress(
            initial_state,
            "pipeline",
            "error",
            f"Pipeline failed: {e}",
            error=str(e),
        )
        return initial_state
