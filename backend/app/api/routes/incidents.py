from __future__ import annotations
"""Incident management API routes."""

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.api.schemas import (
    IncidentOut,
    AgentLogOut,
    RemediationDetailOut,
    RemediationArtifactOut,
)
from app.remediation.artifacts import artifact_media_type
from app.services.incident_service import IncidentService

router = APIRouter(prefix="/incidents", tags=["Incidents"])


@router.get("/", response_model=list[IncidentOut])
def list_incidents(
    status: str | None = None,
    limit: int = 2000,
    db: Session = Depends(get_db),
):
    svc = IncidentService(db)
    incidents = svc.get_incidents(status=status, limit=limit)
    return [_to_out(i) for i in incidents]


@router.get("/{incident_id}", response_model=IncidentOut)
def get_incident(incident_id: int, db: Session = Depends(get_db)):
    svc = IncidentService(db)
    incident = svc.get_incident(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return _to_out(incident)


@router.get("/{incident_id}/logs", response_model=list[AgentLogOut])
def get_incident_logs(incident_id: int, db: Session = Depends(get_db)):
    svc = IncidentService(db)
    logs = svc.get_incident_agent_logs(incident_id)
    return [
        AgentLogOut(
            id=log.id,
            incident_id=log.incident_id,
            agent_name=log.agent_name,
            action=log.action,
            input_data=log.input_data or {},
            output_data=log.output_data or {},
            duration_ms=log.duration_ms,
            timestamp=log.timestamp,
        )
        for log in logs
    ]


@router.get("/{incident_id}/remediation", response_model=RemediationDetailOut)
def get_incident_remediation(incident_id: int, db: Session = Depends(get_db)):
    svc = IncidentService(db)
    remediation = svc.get_incident_remediation(incident_id)
    if not remediation:
        raise HTTPException(status_code=404, detail="Remediation not found")

    payload = svc.get_remediation_payload(remediation)
    artifacts = [
        RemediationArtifactOut(
            id=artifact.get("id", ""),
            name=artifact.get("name", "artifact.txt"),
            kind=artifact.get("kind", "shell"),
            language=artifact.get("language", "bash"),
            purpose=artifact.get("purpose", "apply"),
            description=artifact.get("description"),
            content=artifact.get("content", ""),
        )
        for artifact in payload.get("artifacts", [])
    ]

    return RemediationDetailOut(
        id=remediation.id,
        incident_id=remediation.incident_id,
        action_type=remediation.action_type,
        description=remediation.description,
        status=remediation.status.value if remediation.status else "pending",
        requires_approval=remediation.requires_approval,
        approved_by=remediation.approved_by,
        canary_stage=remediation.canary_stage,
        execution_log=remediation.execution_log,
        started_at=remediation.started_at,
        completed_at=remediation.completed_at,
        created_at=remediation.created_at,
        plan_summary=payload.get("plan_summary", remediation.description),
        strategy=payload.get("strategy"),
        steps=payload.get("steps", []),
        artifacts=artifacts,
    )


@router.get("/{incident_id}/remediation/artifacts/{artifact_id}")
def download_remediation_artifact(incident_id: int, artifact_id: str, db: Session = Depends(get_db)):
    svc = IncidentService(db)
    resolved = svc.get_remediation_artifact(incident_id, artifact_id)
    if not resolved:
        raise HTTPException(status_code=404, detail="Remediation artifact not found")

    _, artifact = resolved
    return Response(
        content=artifact.get("content", ""),
        media_type=artifact_media_type(artifact),
        headers={
            "Content-Disposition": f'attachment; filename="{artifact.get("name", "artifact.txt")}"',
        },
    )


def _to_out(incident) -> IncidentOut:
    return IncidentOut(
        id=incident.id,
        node_id=incident.node_id,
        node_name=incident.node.node_name if incident.node else None,
        title=incident.title,
        description=incident.description,
        severity=incident.severity.value if incident.severity else "medium",
        status=incident.status.value if incident.status else "detected",
        detected_at=incident.detected_at,
        resolved_at=incident.resolved_at,
        root_cause=incident.root_cause,
        prediction_details=incident.prediction_details or {},
        diagnostic_details=incident.diagnostic_details or {},
        created_at=incident.created_at,
    )
