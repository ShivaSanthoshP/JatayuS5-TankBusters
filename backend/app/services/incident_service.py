from __future__ import annotations
"""Service layer for incident management."""

import datetime
import logging

from sqlalchemy.orm import Session, joinedload

from app.database.models import (
    Incident, IncidentStatus, Severity, Remediation, RemediationStatus,
    AgentLog, RunbookEntry,
)
from app.memory.vector_store import get_memory
from app.remediation.artifacts import (
    deserialize_remediation_payload,
    get_artifact,
    primary_rollback_script,
    serialize_remediation_payload,
)
from app.config import utc_now
logger = logging.getLogger("itops.incident_service")

RECENT_DUPLICATE_WINDOW = datetime.timedelta(minutes=15)


def _join_lines(values: list[str]) -> str:
    return "\n".join(value for value in values if value).strip()


def _diagnostic_context(diagnostic: dict) -> str:
    reasons = diagnostic.get("reasons") or []
    causal_chain = diagnostic.get("causal_chain") or []
    blast_radius = diagnostic.get("blast_radius") or []

    sections = [
        diagnostic.get("root_cause", ""),
        f"Issue Type: {diagnostic.get('issue_type', 'unknown')}",
        "Reasons:\n" + "\n".join(f"- {reason}" for reason in reasons) if reasons else "",
        "Causal Chain:\n" + "\n".join(f"- {entry}" for entry in causal_chain) if causal_chain else "",
        "Blast Radius: " + ", ".join(blast_radius) if blast_radius else "",
        f"Reasoning: {diagnostic.get('reasoning', '')}" if diagnostic.get("reasoning") else "",
    ]
    return _join_lines(sections)


def _artifact_context(remediation_data: dict) -> str:
    artifacts = remediation_data.get("artifacts") or []
    if not artifacts:
        return ""

    chunks = []
    for artifact in artifacts[:2]:
        content = (artifact.get("content") or "").strip()
        excerpt = content[:1200]
        chunks.append(
            _join_lines([
                f"Artifact: {artifact.get('name', 'artifact')}",
                f"Purpose: {artifact.get('purpose', 'apply')}",
                f"Description: {artifact.get('description', '')}",
                "Content:",
                excerpt,
            ])
        )
    return "\n\n".join(chunks)


def _remediation_context(remediation_data: dict, reporting: dict) -> str:
    steps = remediation_data.get("steps") or []
    step_lines = []
    for step in steps:
        action = step.get("action", "Unnamed step")
        description = step.get("description", "")
        validation = step.get("validation_command", "")
        step_lines.append(
            _join_lines([
                f"{step.get('order', '?')}. {action}",
                description,
                f"Validation: {validation}" if validation else "",
            ])
        )

    sections = [
        remediation_data.get("plan_summary", ""),
        f"Strategy: {remediation_data.get('strategy', 'shell')}",
        "Steps:\n" + "\n".join(step_lines) if step_lines else "",
        _artifact_context(remediation_data),
        f"Executive Summary: {reporting.get('executive_summary', '')}" if reporting.get("executive_summary") else "",
    ]
    return _join_lines(sections)


class IncidentService:

    def __init__(self, db: Session):
        self.db = db

    def create_incident_from_pipeline(
        self, node_id: int, pipeline_state: dict
    ) -> Incident:
        """Create an incident record from the orchestrator pipeline output."""
        monitoring = pipeline_state.get("monitoring_result", {})
        prediction = pipeline_state.get("prediction_result", {})
        diagnostic = pipeline_state.get("diagnostic_result", {})
        remediation_data = deserialize_remediation_payload(
            pipeline_state.get("remediation_result", {})
        )
        severity_str = pipeline_state.get("severity", "medium")

        try:
            severity = Severity(severity_str)
        except ValueError:
            severity = Severity.MEDIUM

        status_str = pipeline_state.get("status", "detected")
        try:
            status = IncidentStatus(status_str)
        except ValueError:
            status = IncidentStatus.DETECTED
        incident_title = f"{monitoring.get('anomaly_type', 'Anomaly')} on node (severity: {severity_str})"
        incident = self._find_recent_duplicate_incident(
            node_id=node_id,
            title=incident_title,
            root_cause=diagnostic.get("root_cause"),
            issue_type=diagnostic.get("issue_type") or monitoring.get("anomaly_type"),
        )
        is_duplicate = incident is not None

        if incident is None:
            incident = Incident(
                node_id=node_id,
                title=incident_title,
                description=monitoring.get("description", ""),
                severity=severity,
                status=status,
                root_cause=diagnostic.get("root_cause"),
                prediction_details=prediction,
                diagnostic_details=diagnostic,
            )
            self.db.add(incident)
            self.db.flush()
        else:
            incident.title = incident_title
            incident.description = monitoring.get("description", "")
            incident.severity = severity
            incident.status = status
            incident.root_cause = diagnostic.get("root_cause")
            incident.prediction_details = prediction
            incident.diagnostic_details = diagnostic
            self.db.flush()

        # Only persist a fresh agent trace for newly-created incidents.
        # Repeated background detections for the same issue are coalesced.
        if not is_duplicate:
            for trace in pipeline_state.get("agent_trace", []):
                log = AgentLog(
                    incident_id=incident.id,
                    agent_name=trace.get("agent", "unknown"),
                    action=f"pipeline_{trace.get('agent', 'unknown')}",
                    output_data=trace,
                    duration_ms=self._calc_duration(
                        trace.get("started_at"), trace.get("completed_at")
                    ),
                )
                self.db.add(log)

        # Create remediation record if pipeline produced one
        # Fully automated — scripts are generated for review/download only,
        # never executed (no real infrastructure to run against).
        if remediation_data.get("steps") or remediation_data.get("artifacts"):
            existing_remediation = self.get_incident_remediation(incident.id)
            if existing_remediation:
                existing_remediation.action_type = remediation_data.get("plan_summary", "auto-remediation")[:100]
                existing_remediation.description = remediation_data.get("plan_summary", "")
                existing_remediation.script_content = serialize_remediation_payload(remediation_data)
                existing_remediation.status = RemediationStatus.COMPLETED
                existing_remediation.requires_approval = False
                existing_remediation.rollback_script = primary_rollback_script(remediation_data)
                existing_remediation.completed_at = utc_now()
            else:
                rem = Remediation(
                    incident_id=incident.id,
                    action_type=remediation_data.get("plan_summary", "auto-remediation")[:100],
                    description=remediation_data.get("plan_summary", ""),
                    script_content=serialize_remediation_payload(remediation_data),
                    status=RemediationStatus.COMPLETED,
                    requires_approval=False,
                    rollback_script=primary_rollback_script(remediation_data),
                    completed_at=utc_now(),
                )
                self.db.add(rem)

        # Store in vector memory for RAG
        if diagnostic.get("root_cause"):
            try:
                memory = get_memory()
                memory.store_incident(
                    incident_id=incident.id,
                    title=incident.title,
                    description=_join_lines([
                        incident.description or "",
                        _diagnostic_context(diagnostic),
                    ]),
                    root_cause=_diagnostic_context(diagnostic),
                    resolution=_remediation_context(remediation_data, pipeline_state.get("reporting_result", {})),
                    severity=severity_str,
                    node_type=pipeline_state.get("metrics", {}).get("node_type", "server"),
                )
            except Exception as e:
                logger.warning(f"Failed to store in vector memory: {e}")

        # Create runbook entry from reporting
        reporting = pipeline_state.get("reporting_result", {})
        runbook_title = reporting.get("runbook_title")
        if runbook_title:
            solution_steps = _remediation_context(remediation_data, reporting)
            runbook = (
                self.db.query(RunbookEntry)
                .filter(RunbookEntry.source_incident_id == incident.id)
                .order_by(RunbookEntry.created_at.desc())
                .first()
            )
            if runbook:
                runbook.title = runbook_title
                runbook.problem_pattern = diagnostic.get("root_cause", "")
                runbook.solution_steps = solution_steps
            else:
                runbook = RunbookEntry(
                    title=runbook_title,
                    problem_pattern=diagnostic.get("root_cause", ""),
                    solution_steps=solution_steps,
                    source_incident_id=incident.id,
                )
                self.db.add(runbook)
            self.db.flush()
            try:
                memory = get_memory()
                memory.store_runbook(
                    runbook_id=runbook.id,
                    title=runbook.title,
                    problem_pattern=runbook.problem_pattern,
                    solution_steps=solution_steps,
                )
            except Exception as e:
                logger.warning(f"Failed to store runbook in vector memory: {e}")

        self.db.commit()
        self.db.refresh(incident)
        return incident

    def get_incident_remediation(self, incident_id: int) -> Remediation | None:
        return (
            self.db.query(Remediation)
            .filter(Remediation.incident_id == incident_id)
            .order_by(Remediation.created_at.desc())
            .first()
        )

    def get_remediation_payload(self, remediation: Remediation | None) -> dict:
        if not remediation:
            return {}
        return deserialize_remediation_payload(remediation.script_content)

    def get_remediation_artifact(self, incident_id: int, artifact_id: str) -> tuple[Remediation, dict] | None:
        remediation = self.get_incident_remediation(incident_id)
        if not remediation:
            return None

        artifact = get_artifact(
            self.get_remediation_payload(remediation),
            artifact_id,
        )
        if not artifact:
            return None
        return remediation, artifact

    def get_incidents(self, status: str | None = None, limit: int = 50) -> list[Incident]:
        # Eager-load the node so the API serializer's `incident.node.node_name`
        # access doesn't trigger one extra query per row (was N+1 with the
        # default lazy relationship).
        query = (
            self.db.query(Incident)
            .options(joinedload(Incident.node))
            .order_by(Incident.created_at.desc())
        )
        if status:
            try:
                query = query.filter(Incident.status == IncidentStatus(status))
            except ValueError:
                pass
        # Pull a bounded window for the 15-minute dedupe headroom. The
        # previous `limit * 20` could yank 40k rows on a default limit=2000
        # request; capping at limit+200 (and a hard ceiling of 500) keeps
        # dedupe correct in practice while making the round-trip cheap.
        overfetch = min(max(limit + 200, limit), 500)
        incidents = query.limit(overfetch).all()
        return self._collapse_recent_duplicates(incidents, limit)

    def get_incident(self, incident_id: int) -> Incident | None:
        return self.db.get(Incident, incident_id)

    def get_incident_agent_logs(self, incident_id: int) -> list[AgentLog]:
        return (
            self.db.query(AgentLog)
            .filter(AgentLog.incident_id == incident_id)
            .order_by(AgentLog.timestamp)
            .all()
        )

    @staticmethod
    def _calc_duration(start: str | None, end: str | None) -> int | None:
        if not start or not end:
            return None
        try:
            s = datetime.datetime.fromisoformat(start)
            e = datetime.datetime.fromisoformat(end)
            return int((e - s).total_seconds() * 1000)
        except Exception:
            return None

    def _find_recent_duplicate_incident(
        self,
        node_id: int,
        title: str,
        root_cause: str | None,
        issue_type: str | None,
    ) -> Incident | None:
        cutoff = utc_now() - RECENT_DUPLICATE_WINDOW
        candidates = (
            self.db.query(Incident)
            .filter(
                Incident.node_id == node_id,
                Incident.created_at >= cutoff,
            )
            .order_by(Incident.created_at.desc())
            .limit(20)
            .all()
        )

        for candidate in candidates:
            # Only reuse if the issue type or root cause actually matches.
            # Different anomaly types on the same node should create
            # separate incidents instead of overwriting an unrelated one.
            candidate_issue = (candidate.diagnostic_details or {}).get("issue_type", "")
            if issue_type and candidate_issue and candidate_issue == issue_type:
                return candidate
            if root_cause and candidate.root_cause and candidate.root_cause == root_cause:
                return candidate
        return None

    @staticmethod
    def _incident_group_key(incident: Incident) -> tuple:
        issue_type = (incident.diagnostic_details or {}).get("issue_type", "")
        return (incident.node_id, issue_type)

    def _collapse_recent_duplicates(self, incidents: list[Incident], limit: int) -> list[Incident]:
        collapsed: list[Incident] = []
        latest_by_group: dict[tuple[int, str], Incident] = {}

        for incident in incidents:
            group = self._incident_group_key(incident)
            existing = latest_by_group.get(group)
            if existing and existing.created_at and incident.created_at:
                if (existing.created_at - incident.created_at) <= RECENT_DUPLICATE_WINDOW:
                    continue

            latest_by_group[group] = incident
            collapsed.append(incident)
            if len(collapsed) >= limit:
                break

        return collapsed
