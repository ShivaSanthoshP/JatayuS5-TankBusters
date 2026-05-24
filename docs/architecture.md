# Architecture Document for Dynamic IT Operations Orchestrator
"Autonomous Multi-Agent AIOps Platform for Self-Healing Enterprise Infrastructure"

---

## Team & Project Details
* **Team Name**: Tank Busters
* **Team Members**: P. Shiva Santhosh, N. S. J. S. Dhanush, P. Shikhar
* **Faculty Mentor**: E. Pragnavi
* **Institution**: University College of Engineering, Osmania University
* **Hackathon Stage**: Stage 3 — Production-Grade Deployment

---

## Table of Contents
1. [Introduction](#1-introduction)
   * 1.1 Purpose
   * 1.2 Scope
   * 1.3 Definitions, Acronyms and Abbreviations
   * 1.4 References
2. [Architectural Goals and Constraints](#2-architectural-goals-and-constraints)
   * 2.1 Goals
   * 2.2 Constraints
3. [System Overview](#3-system-overview)
4. [Architecture Views](#4-architecture-views)
   * 4.1 Logical / Functional View
   * 4.2 Use Case View
   * 4.3 Implementation / System View
   * 4.4 Process / Thread View
   * 4.5 Deployment View
5. [Core Technical Services](#5-core-technical-services)
   * 5.1 Persistence
   * 5.2 Inter-Process Communication
   * 5.3 Authentication and Authorization
   * 5.4 Error Handling
   * 5.5 Logging
   * 5.6 Transaction Management
6. [Risks and Limitations](#6-risks-and-limitations)
7. [Alternative Solutions Considered](#7-alternative-solutions-considered)
8. [Appendix](#8-appendix)
   * 8.1 User Guide
   * 8.2 Expected Software Response
   * 8.3 Performance Bounds
   * 8.4 Identification of Critical Components
   * 8.5 Review Comments on Architectural POC

---

## 1. Introduction

### 1.1 Purpose
This document describes the software architecture of the **Dynamic IT Operations Orchestrator**, a multi-agent AIOps platform developed for Stage 3 production deployment. It provides a comprehensive description of architectural decisions, component interactions, deployment configuration, and design rationale, following the Rational Unified Process (RUP) Architecture Document standard.

This document is intended for technical reviewers, evaluators, and cloud platform engineers wishing to understand, extend, or verify the production architecture.

### 1.2 Scope
The scope encompasses the complete production-grade system:
* **React 19 Frontend**: Streams real-time dashboards, metrics (via WebSockets), incident lifecycles, manual pipeline triggers, and runtime settings.
* **FastAPI Backend**: Exposes REST and WebSocket APIs, coordinates background monitoring loops, and drives the multi-agent pipeline.
* **LangGraph Multi-Agent Pipeline**: Executes the 5-agent state machine (Monitoring → Predictive → Diagnostic → Remediation → Reporting).
* **Institutional Memory (RAG)**: Integrates persistent semantic vector search in ChromaDB using Gemini `text-embedding-004` (production) or Ollama `nomic-embed-text` (dev) models.
* **Relational Database**: Runs PostgreSQL 16 (production, colocated on EC2) or SQLite (dev fallback) to manage infrastructure inventory, incident history, remediations, settings, and simulators.
* **Storage Mount (AWS S3 Files)**: Utilizes NFS-like Amazon S3 Files to mount the persistent ChromaDB directories directly on the instance, decoupling compute from vector storage.

### 1.3 Definitions, Acronyms and Abbreviations
* **AIOps**: Artificial Intelligence for IT Operations.
* **LLM**: Large Language Model.
* **RAG**: Retrieval-Augmented Generation.
* **DAG**: Directed Acyclic Graph (state machine representation in LangGraph).
* **MTTD / MTTR**: Mean Time to Detect / Mean Time to Resolve.
* **HITL**: Human-in-the-Loop (approval gate for high/critical severities).
* **SRE**: Site Reliability Engineer.
* **WAL**: Write-Ahead Logging (for SQLite development concurrency).
* **S3 Files**: Amazon S3 Files, mounted via standard NFS (released April 2026).

### 1.4 References
* LangGraph Documentation — https://langchain-ai.github.io/langgraph/
* FastAPI ASGI Server — https://fastapi.tiangolo.com/
* Google GenAI SDK — https://github.com/googleapis/google-genai-python
* RUP System Architecture Standards — Virtusa Corporation, TMP-AD-AD-5-002

---

## 2. Architectural Goals and Constraints

### 2.1 Goals
* **Zero-Touch Incident Resolution**: Detect, diagnose, and remediate routine issues (memory leaks, CPU spikes, disk full) within seconds.
* **Privacy & Cloud Flexibility**: Switchable cloud and local LLM backends (Gemini, OpenAI, or Ollama) configurable at runtime.
* **Safeguarded Automation**: Mandatory Human-in-the-Loop (HITL) approval barriers for HIGH and CRITICAL severity actions.
* **Growing Memory**: RAG-powered auto-enrichment of runbooks to avoid resolving the same root cause twice.
* **Failsafe Pipeline**: Graceful degradation to rules-based fallback profiles if LLM servers return rate limits (429/503).

### 2.2 Constraints
* **Python runtime**: Requires Python 3.11+ async features and ASGI WebSockets.
* **Database Locking**: S3 Files does not support POSIX advisory locks (`flock`/`fcntl`), making SQLite unsafe on mounted S3 paths. This requires PostgreSQL 16 in production to manage internal transactions safely.
* **Compute Bounds**: The production environment runs on a single AWS `t4g.small` Graviton instance (2 vCPUs, 2 GB RAM). Hardware bottlenecks are mitigated via cloud API offloading (Gemini 2.5 Flash for reasoning, Gemini embeddings) and strict async concurrency bounds.

---

## 3. System Overview
The Dynamic IT Operations Orchestrator is a production-grade, self-healing AIOps platform.

```
                  +-----------------------------------------+
                  |         React 19 + Vite Frontend        |
                  +--------------------+--------------------+
                                       | HTTPS / WebSockets
                                       v
                  +--------------------+--------------------+
                  |               Nginx Reverse Proxy       |
                  |     (TLS Terminated via acme.sh ZeroSSL)|
                  +--------------------+--------------------+
                                       | Unix Socket / 127.0.0.1
                                       v
                  +--------------------+--------------------+
                  |            FastAPI ASGI App Server      |
                  |  +-----------------------------------+  |
                  |  |  LangGraph Agent Pipeline         |  |
                  |  |  Monitor -> Predict -> Diagnose   |  |
                  |  |  -> [HITL approval] -> Remediate  |  |
                  |  |  -> Report                        |  |
                  |  +-----------------------------------+  |
                  |                                         |
                  |  +------------+  +---------+  +------+  |
                  |  | PostgreSQL |  | Chroma  |  | Cloud|  |
                  |  |  (Local)   |  | (S3 NFS)|  | LLMs |  |
                  |  +------------+  +---------+  +------+  |
                  +-----------------------------------------+
```

Metrics are polled every 5 seconds. If a breach is detected, the LangGraph pipeline is triggered. The Monitoring Agent checks telemetry; the Predictive Agent forecasts the time-to-failure; the Diagnostic Agent performs RAG-grounded root cause analysis; the Remediation Agent designs bash fix actions; and the Reporting Agent commits the resolution as an active runbook to ChromaDB and PostgreSQL.

---

## 4. Architecture Views

### 4.1 Logical / Functional View
* **Layer 1 — Presentation (React 19)**: Stat cards, live Recharts metric boards, Framer Motion animations, WebSocket progress updates.
* **Layer 2 — API Gateway (FastAPI)**: REST endpoints for inventory and configurations, and WebSocket server (`/ws/metrics`) for telemetry push.
* **Layer 3 — Core Orchestration (LangGraph)**: Bounded state graph carrying `OrchestratorState` with early exit conditional edges.
* **Layer 4 — Durable Storage**: SQLAlchemy ORM backing local PostgreSQL 16 and a semantic ChromaDB vector engine mounted via S3 Files.

### 4.2 Use Case View
* **UC-01 (Monitor Fleet)**: Simulator/AWS CloudWatch/Azure Monitor/GCP Cloud Monitoring → Ingestion Endpoint → WebSocket → Dashboard UI.
* **UC-02 (Triage Anomaly)**: Monitor Agent detects breach → Predict Agent calculates escalation → Diagnostic Agent performs RAG.
* **UC-03 (HITL Gate)**: Critical Anomaly diagnosed → Pipeline pauses → Operator clicks Approve/Reject on Incidents page → Resumes.
* **UC-04 (Auto-Remediate)**: Low/Medium severity → Remediation Agent generates fix script → Executed via background shell.
* **UC-05 (System Setting)**: Admin updates LLM provider (e.g. Gemini) → Settings API calls settings singleton → Pipeline routes to new provider instantly.

### 4.3 Implementation / System View
#### Backend Modules
* `backend/app/main.py`: FastAPI gateway, handles background async tasks and WebSocket event routers.
* `backend/app/config.py`: Central configurations, loads env profiles, database schemas, and backups.
* `backend/app/agents/orchestrator.py`: LangGraph workflow engine with lazy threads compiling the DAG state machine.
* `backend/app/agents/monitoring.py`: Stat thresholds, EWMA checks, and log regex filters.
* `backend/app/agents/diagnostic.py`: Seeds runbooks and triggers ChromaDB searches.
* `backend/app/agents/remediation.py`: Cloud-specific action templates (AWS CLI, Az CLI, systemctl) with rollback hooks.
* `backend/app/agents/reporting.py`: Generates incident summaries and writes to ChromaDB vector store.
* `backend/app/agents/llm_fallback.py`: Safe JSON wrapper parsing small-model responses with balanced-brace regex extraction.
* `backend/app/memory/vector_store.py`: Vector search engine routing to Gemini text-embedding-004 or local Ollama.
* `backend/app/database/models.py`: Database classes for nodes, incidents, remediations, and agent logs.
* `backend/app/database/session.py`: Dynamic database session builder backing PostgreSQL or SQLite.

#### Frontend Modules
* `src/pages/Dashboard.tsx`: Fleet charts, active timers, WebSocket streams.
* `src/pages/Incidents.tsx`: Detail panel, RAG diagnostics, HITL buttons.
* `src/pages/Pipeline.tsx`: Real-time active agent node progress tiles.
* `src/pages/Settings.tsx`: LLM models, API keys, temperature adjustments.
* `src/pages/Simulators.tsx`: Inject anomalies (CPU, memory, disk, network) for demonstration.

### 4.4 Process / Thread View
Concurrency is governed via the single-process asyncio event loop:
* **`_monitoring_loop` (5s)**: Ingests metric points, writes snapshots, broadcasts via WebSocket.
* **`_auto_pipeline_loop` (30s)**: Identifies unhandled anomalies, spawns pipeline task if not in cooldown.
* **`run_pipeline` task**: LangGraph thread executing agent chains sequentially.
* **Deduplication Gate**: 5-minute per-node suppression blocks redundant pipelines during ongoing active resolutions.
* **Capped Workers**: Async semaphores limit in-flight pipelines (`PIPELINE_MAX_CONCURRENT=4`) to protect local resources.

### 4.5 Deployment View
Deployed entirely in a single Graviton AWS EC2 instance (`t4g.small` in Mumbai `ap-south-1` region) to minimize latency and server overhead:

```
AWS ap-south-1 (Mumbai) Region
 └── Elastic IP
      └── EC2 (t4g.small, Graviton ARM)
           ├── Nginx Reverse Proxy (Port 80/443, acme.sh TLS)
           ├── Uvicorn ASGI Server (Port 8000)
           │    ├── Reads/Writes → Local PostgreSQL 16 Port 5432
           │    └── Reads/Writes → S3 Files Mount (/mnt/s3/itops/chroma_db)
           └── external APIs (Gemini Cloud API, OpenAI API)
```

---

## 5. Core Technical Services

### 5.1 Persistence
* **Operational Database**: PostgreSQL 16 (production co-located) or SQLite (local development). The schema includes indexing on `metric_snapshots` timestamps to optimize fast-polling queries.
* **Vector Store**: ChromaDB persisted directly on AWS S3 buckets mounted via Amazon S3 Files to `/mnt/s3/itops/chroma_db`. This guarantees data durability even if the EC2 instance is terminated or restarted.
* **Configuration Persistence**: Persists runtime model switches, temperature settings, and intervals directly into a JSON file (`runtime_settings.json`).

### 5.2 Inter-Process Communication
* **Frontend ↔ Backend**: JSON payloads over REST endpoints, and WebSocket connections (`/ws/metrics`) for push notifications.
* **Backend ↔ Gemini / OpenAI**: Cloud SDK requests wrapped in `asyncio.to_thread` to prevent thread-blocking on the event loop.
* **Nginx Routing**: Serves built static React `dist/` directly, reverse-proxies `/api` to port 8000, and upgrades `/ws` to a persistent WebSocket.

### 5.3 Authentication and Authorization
* **POC State**: Open endpoints (no auth) to simplify review.
* **Production Gate**: JWT validation middleware over routes. The manual approval endpoint is restricted to authenticated SRE roles.

### 5.4 Error Handling
* **API Resiliency**: Standardized error payloads (validation failures, 404s, 500s).
* **Agent Fallbacks**: If Gemini/Ollama fails, the agent queries `llm_fallback.py`. On double failure, it loads a static rules-based profile from SQLite to prevent pipeline freezes.
* **Pipeline Safe Termination**: Bounded timeouts (`NODE_TIMEOUT_SECONDS=30`) prevent hanging coroutines if API requests stall.

### 5.5 Logging
* **Structured System Logs**: Named logger instances (e.g. `itops.orchestrator`, `itops.diagnostic`) outputting structured timestamps.
* **Audit Trail**: Every agent invocation, input JSON, output JSON, and response timing is captured permanently in the `agent_logs` relational table.

### 5.6 Transaction Management
* **Database Transactions**: Sessions scoped via FastAPI context managers. Autocommit triggers only on success; automatic rollback fires if failures occur.
* **State Operations**: SQLite uses Write-Ahead Logging (WAL) and `check_same_thread=False` for thread safety, while PostgreSQL utilizes a connection pool with pre-ping validation.

---

## 6. Risks and Limitations

| Risk ID | Description | Severity | Mitigation |
|:---|:---|:---:|:---|
| **R-01** | **LLM Latency** (local CPU inference is too slow). | High | Production defaults to Google Cloud Gemini 2.5 Flash API (<1s latency). |
| **R-02** | **SQLite Advisory Locking** (crashes when run on mounted cloud directories). | High | Solved in production by migrating to PostgreSQL 16 which manages internal transaction locks safely. |
| **R-03** | **API Authentication Gap** (open CRUD endpoints). | Medium | Solved in production by binding database and FastAPI local ports behind Nginx with reverse proxy blocks. |
| **R-04** | **RAG Cold Start** (empty vector search on first run). | Low | Solved via automatic seed script `seed_rag.py` which populates 5 canonical incidents and 4 runbooks on boot. |

---

## 7. Alternative Solutions Considered

| Component | Alternative | Chosen Solution | Rationale |
|:---|:---|:---|:---|
| **Agent Orchestration** | LangChain LCEL | **LangGraph StateGraph** | Explicit DAG control, memory loops, and thread-safe pause/resume support. |
| **Vector Store** | In-Memory Dictionary | **ChromaDB on S3 Files** | Allows durable semantic searches while keeping zero managed service fees (~$0/mo). |
| **LLM Provider** | Cloud Only | **Switchable Bridge** | Gemini 2.5 Flash defaults for latency, with local Ollama fallback for cloud disconnected environments. |
| **Database** | Managed RDS | **Colocated PostgreSQL 16** | Saves over ~$15/mo in AWS costs, fits inside `t4g.small` free tier allocations, and avoids network latency. |

---

## 8. Appendix

### 8.1 User Guide
* **Prerequisites**: Ensure Python 3.11+, Node.js 18+, and active API keys.
* **Local Run**:
  ```bash
  cd backend && source venv/bin/activate && uvicorn app.main:app --reload
  cd ../frontend && npm install && npm run dev
  ```
* **Dashboard Operations**: Inspect live gauges, view recent failures, click to see detailed graphs.
* **Simulating Issues**: Navigate to `/simulators`, trigger a "CPU Spike" or "Memory Leak" on Virtual Node `sim-db-01`, watch the alert push to the dashboard, and view the step-by-step diagnostic reasoning on the Pipeline tab.

### 8.2 Expected Software Response
* **Anomaly Event**: Metric threshold breach → alert raised under 5s → pipeline dispatches in under 30s.
* **Approval Sequence**: Severity Critical → Incident pauses at `AWAITING_APPROVAL` → Operator clicks Approve → Script executes in background → Resolved.

### 8.3 Performance Bounds
* **Detection Latency**: < 50ms.
* **RAG Retrieval Speed**: < 100ms.
* **Google Gemini API Pipeline**: < 8 seconds (from detection to final report).

### 8.4 Identification of Critical Components
* **LangGraph Orchestrator**: Halt disrupts entire triage lifecycle.
* **PostgreSQL Session Factory**: Engine errors disconnect all persistence.
* **WebSocket Ingestion Server**: Stalls real-time dashboard updates.

### 8.5 Review Comments on Architectural POC
* **Modular DataSources**: High praise for abstract classes. Enabled plug-and-play Docker metrics with zero agent rewrites.
* **Graceful Key Rotation**: Adding Gemini backup keys solves 429 quota exhaustion blocks immediately.
* **Storage Mount Safety**: Decoupling vector data via AWS S3 Files is highly elegant, providing stateless compute with zero data loss.
