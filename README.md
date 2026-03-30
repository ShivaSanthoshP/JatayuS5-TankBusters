<p align="center">
  <img src="https://img.shields.io/badge/🚀_ITOps_Orchestrator-Enterprise_Grade_AIOps-0d1117?style=for-the-badge&labelColor=0d1117" alt="ITOps Orchestrator" />
</p>

<p align="center">
  <b>A next-generation Agentic AI platform that autonomously monitors, predicts, diagnoses, and remediates infrastructure failures across multi-cloud environments — in real time.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Agents-5_Autonomous-00C853?style=flat-square" />
  <img src="https://img.shields.io/badge/LLM-Gemma_3_4B-4285F4?style=flat-square" />
  <img src="https://img.shields.io/badge/RAG-Institutional_Memory-FF6D00?style=flat-square" />
  <img src="https://img.shields.io/badge/Stack-FastAPI_+_React_19-7C4DFF?style=flat-square" />
  <img src="https://img.shields.io/badge/Orchestration-LangGraph-00BFA5?style=flat-square" />
</p>

---

## The Problem

Enterprises struggle to manage complex IT infrastructure across multi-cloud environments in real time. Traditional monitoring tools operate in silos — they detect issues but fail to coordinate **auto-remediation** and **predictive maintenance**. When an incident strikes, human operators manually triage alerts, search runbooks, and execute fixes — a process that's slow, error-prone, and doesn't scale.

**A single AI model cannot simultaneously manage multi-domain monitoring, incident triage, and automated remediation.** This demands an agentic architecture where specialized agents communicate and act autonomously.

## Our Solution

**ITOps Orchestrator** deploys a coordinated team of five autonomous AI agents that work together through an intelligent pipeline:

```
  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌─────────────┐    ┌──────────┐
  │ Monitor  │───▶│ Predict  │───▶│ Diagnose │───▶│ Remediate   │───▶│ Report   │
  │  Agent   │    │  Agent   │    │  Agent   │    │   Agent     │    │  Agent   │
  └──────────┘    └──────────┘    └──────────┘    └─────────────┘    └──────────┘
   Anomaly         Failure         Root Cause      Shell Scripts      Executive
   Detection       Forecasting     Analysis        + Rollback         Summaries
```

Each agent is purpose-built for its domain and communicates findings to the next through a **LangGraph state machine**, enabling fully autonomous incident lifecycle management — from the first anomaly signal to a validated remediation script.

---

## Why Agentic AI?

| Traditional Monitoring | ITOps Orchestrator |
|:---|:---|
| Detects anomalies → alerts a human | Detects, diagnoses, **and fixes** autonomously |
| Siloed dashboards, no coordination | 5 agents communicating via Agent-to-Agent (A2A) protocol |
| Reactive — responds after failure | Predictive — forecasts failure **before** impact |
| Static runbooks, manual execution | Auto-generated remediation scripts with rollback safety |
| No memory of past solutions | **RAG-powered institutional memory** — learns from every resolved incident |

---

## Agent Architecture

| Agent | Role | Intelligence |
|:---|:---|:---|
| **🔍 Monitoring Agent** | Real-time anomaly detection via threshold analysis and log pattern recognition | Rule-based engine with configurable thresholds |
| **📊 Predictive Agent** | Failure probability forecasting, time-to-failure estimation, escalation risk scoring | Statistical heuristics + LLM for novel patterns |
| **🧠 Diagnostic Agent** | Root cause analysis, causal chain mapping, blast radius assessment | Known Issue Profiles + LLM + RAG from past incidents |
| **🔧 Remediation Agent** | Generates executable shell scripts, rollback commands, and validation steps | Pre-approved templates + LLM + RAG from past fixes |
| **📋 Reporting Agent** | Executive summaries, auto-generated runbooks, SLA impact analysis | Structured summarization engine |

### Intelligent Hybrid Processing

The system applies a **"fast path first, LLM when needed"** strategy:

- **Frequent incidents** (memory leaks, CPU spikes, disk full, network saturation) are handled **instantly** through pre-approved response profiles — no LLM latency.
- **Novel or complex anomalies** trigger the LLM (Gemma 3 4B) which receives **RAG context** from similar past incidents and runbooks, enabling it to reason with institutional knowledge.
- **LLM unavailable?** The pipeline gracefully degrades to safe defaults — it **never breaks**.

### RAG — Institutional Memory

Every resolved incident is embedded and stored in a local vector memory. When a new incident arrives, the system retrieves the most relevant past cases and feeds them directly into the LLM's reasoning context. Over time, the platform gets **smarter and faster** — learning which fixes work and which don't.

---

## Data Sources

ITOps Orchestrator features a **pluggable data source interface** designed to seamlessly ingest metrics from any infrastructure provider:

| Platform | Connectivity | Supported Metrics |
|:---|:---|:---|
| **AWS CloudWatch** | ✅ Configurable | EC2, RDS, ELB |
| **GCP Cloud Monitoring** | ✅ Configurable | Compute Engine, Cloud SQL |
| **Azure Monitor** | ✅ Configurable | VM, App Service, SLI |
| **Prometheus** | ✅ Configurable | PromQL, Node Exporter |
| **Docker** | ✅ Configurable | Container Stats via Daemon API |
| **Built-in AI Simulator** | ✅ Active | Full infrastructure simulation with anomaly injection |
| **Custom API Push** | ✅ Active | Generic JSON via high-throughput REST endpoint |

---

## Platform Pages

| Page | What It Does |
|:---|:---|
| **Dashboard** | Real-time infrastructure health with live metric visualizations |
| **Agents** | Interactive guide explaining the autonomous agent pipeline |
| **Pipeline** | Execute the full pipeline on any node with live step-by-step progress |
| **Incidents** | Complete incident history with root cause analysis and remediation details |
| **Infrastructure** | Full node inventory with health indicators and status tracking |
| **Data Sources** | One-click cloud provider configuration |
| **Simulators** | Manage simulated infrastructure for testing and demos |
| **Runbooks** | Auto-generated knowledge base — the system's growing institutional memory |
| **Settings** | Dynamic LLM model selection, temperature tuning, auto-run pipeline toggle |

---

## Tech Stack

| Layer | Technologies |
|:---|:---|
| **Backend** | FastAPI · LangGraph · Ollama · SQLAlchemy · SQLite · NumPy |
| **Frontend** | React 19 · TypeScript · Vite · Tailwind CSS 4 · Framer Motion · Recharts |
| **LLM Engine** | Gemma 3 4B (local via Ollama) · nomic-embed-text embeddings |
| **Architecture** | Multi-agent orchestration · Event-driven communication · Adaptive learning |

---

## Project Structure

```
itops-main/
├── backend/
│   └── app/
│       ├── agents/           # Autonomous pipeline agents
│       │   ├── monitoring.py     # Real-time anomaly detection
│       │   ├── predictive.py     # Failure probability forecasting
│       │   ├── diagnostic.py     # Root cause analysis + RAG
│       │   ├── remediation.py    # Script generation + RAG
│       │   ├── reporting.py      # Executive summaries + runbooks
│       │   ├── llm_fallback.py   # LLM integration layer
│       │   └── orchestrator.py   # LangGraph state machine
│       ├── api/routes/       # REST + WebSocket API
│       ├── data_sources/     # Pluggable cloud connectors
│       ├── database/         # Persistence layer
│       ├── memory/           # Vector store for RAG
│       └── services/         # Core business logic
├── frontend/
│   └── src/
│       ├── pages/            # 9 feature-rich application pages
│       ├── components/       # Premium glassmorphism UI components
│       └── services/         # API client layer
├── quickruns/                # 1-click launchers + setup guide
│   ├── howtorun.md              # Step-by-step setup instructions
│   ├── run-macos.sh             # macOS launcher
│   ├── run-linux.sh             # Linux launcher
│   └── run.bat                  # Windows launcher
└── README.md
```

---

## Enterprise Impact

| Metric | Impact |
|:---|:---|
| **Downtime** | Drastically reduced through predictive detection and autonomous remediation |
| **MTTR** | Minutes instead of hours — agents execute validated fixes instantly |
| **Resource Usage** | Optimized through continuous monitoring and intelligent scaling recommendations |
| **SLA Adherence** | Proactive resolution prevents breaches before they happen |
| **Knowledge Retention** | Every incident resolution enriches the platform's institutional memory |

---

## API Reference

| Method | Endpoint | Description |
|:---|:---|:---|
| `POST` | `/api/agents/pipeline/start` | Launch the autonomous pipeline for a node |
| `GET` | `/api/agents/pipeline/runs/{id}` | Track pipeline execution in real time |
| `GET` | `/api/incidents/` | Query the full incident database |
| `GET` | `/api/incidents/{id}/remediation` | Retrieve remediation scripts + rollback plans |
| `POST` | `/api/datasources/ingest` | Push metrics from any custom data source |
| `GET` | `/api/agents/runbooks` | Access the auto-generated knowledge base |

Full interactive API documentation available at `/docs` when running.

---

## Getting Started

👉 **See [`quickruns/howtorun.md`](quickruns/howtorun.md) for setup instructions and 1-click launch scripts.**

---

<p align="center">
  <sub>Built for the future of autonomous IT operations.</sub>
</p>
