import PipelineResultView from '../pipeline/PipelineResultView';
import * as api from '../../services/api';
import type { Incident, RemediationDetail } from '../../types';

interface IncidentDetailBodyProps {
  incident: Incident;
  remediation: RemediationDetail | null | undefined;
  remediationLoading: boolean;
}

/**
 * Adapter that maps the persisted Incident shape onto PipelineResultView.
 * The Incident row only carries prediction_details + diagnostic_details
 * (plus monitoring's description/severity and timestamps); the full
 * monitoring + reporting payloads aren't stored yet, so the Monitoring
 * and Reporting sections render only what we have.
 */
export default function IncidentDetailBody({
  incident,
  remediation,
  remediationLoading,
}: IncidentDetailBodyProps) {
  // Reconstruct a thin monitoring object from the fields we DO persist.
  const monitoring = {
    description: incident.description ?? '',
    severity: incident.severity,
    anomaly_type:
      (incident.diagnostic_details as Record<string, unknown> | undefined)?.['issue_type'] ?? '',
  };

  // Diagnostic carries the root_cause separately on the incident row,
  // so fold it back into the diagnostic payload for the shared view.
  const diagnostic = {
    ...(incident.diagnostic_details as Record<string, unknown> | undefined),
    root_cause: incident.root_cause ?? undefined,
  };

  return (
    <PipelineResultView
      monitoring={monitoring}
      prediction={incident.prediction_details as Record<string, unknown> | null}
      diagnostic={diagnostic}
      remediation={remediation}
      remediationLoading={remediationLoading}
      reporting={null}
      meta={{
        status: incident.status,
        severity: incident.severity,
        detected_at: incident.detected_at,
        resolved_at: incident.resolved_at,
        created_at: incident.created_at,
        incident_id: incident.id,
      }}
      artifactDownloadUrl={(artifact) =>
        api.getIncidentRemediationArtifactDownloadUrl(incident.id, artifact.id)
      }
      reportingNote={
        <>
          The reporting agent's full output (executive summary, runbook title,
          MTTR estimate, SLA impact, timeline) is generated at pipeline runtime
          but isn't persisted to the incident record yet. Add a{' '}
          <code className="font-mono text-[12px] mx-1 px-1 rounded bg-canvas-soft">
            reporting_details
          </code>
          JSON column to enable it here.
        </>
      }
    />
  );
}
