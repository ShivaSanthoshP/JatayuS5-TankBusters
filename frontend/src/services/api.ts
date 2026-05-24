import type {
  InfraNode, MetricSnapshot, Incident, DashboardStats, RemediationDetail,
  PipelineResult, PipelineRunStatus, RunbookEntry, RunbookWrite,
  DataSourceProvider, ConfiguredSource, Simulator,
} from '../types';

const BASE = '/api';

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

async function requestWithTimeout<T>(path: string, timeoutMs: number, opts?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await request<T>(path, {
      ...opts,
      signal: controller.signal,
    });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/* ── Infrastructure ─────────────────────────────────────── */
export const getNodes = () => request<InfraNode[]>('/infrastructure/nodes');
export const getNode = (id: number) => request<InfraNode>(`/infrastructure/nodes/${id}`);
export const getNodeMetrics = (id: number, limit = 50) =>
  request<MetricSnapshot[]>(`/infrastructure/nodes/${id}/metrics?limit=${limit}`);
export const getNodeLogs = (id: number, limit = 200) =>
  request<Array<{
    id: number;
    timestamp: string | null;
    level: string;
    source: string;
    message: string;
  }>>(`/infrastructure/nodes/${id}/logs?limit=${limit}`);
export const getMetricsHistory = (points = 32) =>
  request<{ time: string; cpu: number; mem: number; err: number; lat: number }[]>(
    `/infrastructure/metrics/history?points=${points}`,
  );
export const getDashboard = () => request<DashboardStats>('/infrastructure/dashboard');

/* ── Incidents ──────────────────────────────────────────── */
export const getIncidents = (status?: string) =>
  request<Incident[]>(`/incidents/${status ? `?status=${status}` : ''}`);
export const getIncident = (id: number) => request<Incident>(`/incidents/${id}`);
export const getIncidentRemediation = (id: number) =>
  request<RemediationDetail>(`/incidents/${id}/remediation`);
export const getIncidentRemediationArtifactDownloadUrl = (id: number, artifactId: string) =>
  `${BASE}/incidents/${id}/remediation/artifacts/${encodeURIComponent(artifactId)}`;

/* ── Agents ─────────────────────────────────────────────── */
export interface PipelineRunRequest {
  node_name: string;
  metrics?: Record<string, number>;
}
export const startPipelineRun = (body: PipelineRunRequest) =>
  request<{ run_id: string }>('/agents/pipeline/start', { method: 'POST', body: JSON.stringify(body) });
export const getPipelineRun = (runId: string) =>
  request<PipelineRunStatus>(`/agents/pipeline/runs/${encodeURIComponent(runId)}`);
export const runPipeline = (body: PipelineRunRequest) =>
  requestWithTimeout<PipelineResult>('/agents/pipeline/run', 120000, { method: 'POST', body: JSON.stringify(body) });
export interface RunPipelineAllSummary {
  total_nodes: number;
  anomalies_detected: number;
  incidents_created: number;
  results: Array<{
    node_name: string;
    is_anomaly: boolean;
    severity: string | null;
    incident_id: number | null;
    status: string;
  }>;
}
export const runPipelineAll = () =>
  requestWithTimeout<RunPipelineAllSummary>(
    '/agents/pipeline/run-all',
    120000,
    { method: 'POST' },
  );
export const getRunbooks = () => request<RunbookEntry[]>('/agents/runbooks');
export const createRunbook = (body: RunbookWrite) =>
  request<RunbookEntry>('/agents/runbooks', {
    method: 'POST', body: JSON.stringify(body),
  });
export const updateRunbook = (id: number, body: RunbookWrite) =>
  request<RunbookEntry>(`/agents/runbooks/${id}`, {
    method: 'PUT', body: JSON.stringify(body),
  });
export const deleteRunbook = (id: number) =>
  request<{ message: string; id: number }>(`/agents/runbooks/${id}`, { method: 'DELETE' });
export const purgeSelfEmittedLogs = () =>
  request<{ deleted: number }>('/agents/logs/purge-self-emitted', { method: 'POST' });

export interface MemorySearchResult {
  results: Array<{
    document: string;
    metadata: Record<string, unknown>;
    distance: number;
  }>;
}
export const searchMemory = (query: string, collection = 'incidents', n = 10) =>
  request<MemorySearchResult>(`/agents/memory/search?query=${encodeURIComponent(query)}&collection=${collection}&n=${n}`);

/* ── Data Sources ───────────────────────────────────────── */
export interface DataSourcesListResponse {
  sources: ConfiguredSource[];
  available_providers: DataSourceProvider[];
}
export interface DataSourceConfigureBody {
  provider: string;
  enabled: boolean;
  config: Record<string, unknown>;
}
export interface DataSourceTestBody {
  provider: string;
  config: Record<string, unknown>;
}
export interface DataSourceTestResult {
  success: boolean;
  message: string;
}
export interface IngestMetricsBody {
  node_name: string;
  node_type: string;
  provider: string;
  region: string;
  ip_address: string;
  cpu_percent: number;
  memory_percent: number;
  disk_percent: number;
  network_in_mbps: number;
  network_out_mbps: number;
  request_rate: number;
  error_rate: number;
  latency_ms: number;
}
export interface IngestMetricsResult {
  node_id: number;
  node_name: string;
}
export const getDataSources = () => request<DataSourcesListResponse>('/datasources/');
export const configureDataSource = (body: DataSourceConfigureBody) =>
  request<{ status: string }>('/datasources/configure', { method: 'POST', body: JSON.stringify(body) });
export const testDataSource = (body: DataSourceTestBody) =>
  request<DataSourceTestResult>('/datasources/test', { method: 'POST', body: JSON.stringify(body) });
export const removeDataSource = (provider: string) =>
  request<{ status: string }>(`/datasources/${provider}`, { method: 'DELETE' });
export const ingestMetrics = (body: IngestMetricsBody) =>
  request<IngestMetricsResult>('/datasources/ingest', { method: 'POST', body: JSON.stringify(body) });

/* ── Simulators ─────────────────────────────────────────── */
export const getSimulators = () => request<Simulator[]>('/simulators/');
export const getSimulator = (id: number) => request<Simulator>(`/simulators/${id}`);
export const deleteSimulator = (id: number) =>
  request<{ status: string }>(`/simulators/${id}`, { method: 'DELETE' });
export const simulatorAction = (id: number, action: string) =>
  request<Simulator>(`/simulators/${id}/action`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });

export const updateSimulatorMetrics = (id: number, metrics_enabled: boolean, metrics_config: Record<string, number>) =>
  request<Simulator>(`/simulators/${id}/metrics`, {
    method: 'PUT',
    body: JSON.stringify({ metrics_enabled, metrics_config }),
  });

/* ── Settings ───────────────────────────────────────────── */
// Settings carry the runtime config the user edits in the UI. The backend
// payload evolves (new provider credentials, runtime toggles), so this
// type only pins the few common keys callers rely on directly and stays
// open for the rest. Pages with detailed needs cast to their own
// stricter local type at the call site.
export interface SettingsPayload {
  auto_run_pipeline?: boolean;
  auto_run_interval_seconds?: number;
  [key: string]: unknown;
}
export const getSettings = () => request<SettingsPayload>('/settings/');
export const updateSettings = (body: Partial<SettingsPayload>) =>
  request<SettingsPayload>('/settings/', { method: 'PUT', body: JSON.stringify(body) });
export interface OllamaModelInfo {
  name: string;
  size: number;
  modified_at: string;
}
export const getOllamaModels = () =>
  request<{ models: OllamaModelInfo[]; error?: string }>('/settings/ollama-models');
export const getGeminiModels = (apiKey?: string) => {
  const qs = apiKey ? `?api_key=${encodeURIComponent(apiKey)}` : '';
  return requestWithTimeout<{
    models: Array<{
      name: string;
      display_name: string;
      description: string;
      input_token_limit: number;
      output_token_limit: number;
      version: string;
      deprecated: boolean;
    }>;
    error?: string;
  }>(`/settings/gemini-models${qs}`, 15000);
};
export const getLlmModels = (provider: string, apiKey?: string) => {
  const params = new URLSearchParams({ provider });
  if (apiKey) params.set('api_key', apiKey);
  return requestWithTimeout<{
    models: Array<{
      name: string;
      display_name: string;
      description: string;
      input_token_limit: number;
      output_token_limit: number;
      version: string;
      deprecated: boolean;
    }>;
    error?: string;
    static?: boolean;
  }>(`/settings/llm-models?${params.toString()}`, 15000);
};
export const testLlmProvider = (body: {
  provider: 'ollama' | 'openai' | 'gemini';
  model?: string;
  api_key?: string;
  base_url?: string;
}) =>
  requestWithTimeout<{ ok: boolean; message: string; model?: string }>(
    '/settings/test-provider',
    30000,
    { method: 'POST', body: JSON.stringify(body) },
  );

export const createSimulator = async (formData: FormData): Promise<Simulator> => {
  const res = await fetch(`${BASE}/simulators/`, {
    method: 'POST',
    body: formData, // No Content-Type header — browser sets it with boundary for multipart
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
};
