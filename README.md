# ITOps Orchestrator

An autonomous IT operations platform that detects infrastructure anomalies, diagnoses root causes, and generates remediation scripts — powered by a hybrid rule-based + LLM pipeline.

---

## How to Run

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.9+ | `brew install python` (macOS) / `apt install python3` (Linux) |
| Node.js | 18+ | `brew install node` (macOS) / `apt install nodejs npm` (Linux) |
| Ollama | latest | [ollama.com](https://ollama.com) |

### Step 1: Start Ollama and Pull Models

```bash
ollama serve
ollama pull gemma3:4b
ollama pull nomic-embed-text
```

### Step 2: Setup Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # edit OLLAMA_MODEL etc. if needed
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Step 3: Setup Frontend (new terminal)

```bash
cd frontend
npm install
npm run dev
```

### Step 4: Open

- **App** → http://localhost:3000
- **API Docs** → http://localhost:8000/docs

### Step 5: Stop

Press `Ctrl+C` in both terminals.

---

## Key Features

- **Autonomous pipeline** — anomalies are detected, diagnosed, and remediated without human intervention
- **Hybrid intelligence** — trusted profiles for frequent issues, LLM for novel ones
- **RAG memory** — learns from past incidents to improve future diagnostics
- **Shell script generation** — produces ready-to-run remediation + rollback scripts
- **Pipeline persistence** — results survive tab navigation (sessionStorage)

---

### Quick Run Scripts

One-command launchers that handle venv creation, dependency install, and startup automatically:

| OS | Command |
|----|---------|
| macOS | `chmod +x quickruns/run-macos.sh && ./quickruns/run-macos.sh` |
| Linux | `chmod +x quickruns/run-linux.sh && ./quickruns/run-linux.sh` |
| Windows | `quickruns\run.bat` |

---

## Architecture Overview

### The 5-Stage Agent Pipeline

```
Monitor → Predict → Diagnose → Remediate → Report
```

| Agent | What It Does | Method |
|-------|-------------|--------|
| **Monitoring** | Detects anomalies via threshold checks + log regex | Rule-based Engine |
| **Predictive** | Forecasts failure probability and escalation risk | Statistical + LLM fallback |
| **Diagnostic** | Root cause analysis, causal chain, blast radius | Known Issue Profiles + LLM |
| **Remediation** | Generates fix steps, shell scripts, rollback commands | Pre-approved Scripts + LLM |
| **Reporting** | Creates executive summaries and runbook entries | Rule-based Engine |

### Hybrid Known-Issue + LLM Approach

1. **Frequent/Known Anomaly Types** (memory_leak, cpu_spike, disk_full, etc.) → instant response using pre-approved profiles and trusted scripts, no LLM needed.
2. **Novel/Unknown Anomaly Types** → LLM (Gemma 3 4B) generates structured root cause analysis and remediation steps informed by RAG context from past incidents.
3. **LLM Offline** → graceful fallback to generic safety rules — the pipeline never breaks.

### RAG (Retrieval-Augmented Generation)

Every resolved incident is embedded and stored locally. When handling new incidents, the system searches for similar past cases and feeds them into the LLM — so solutions that worked before are preferred.

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Backend** | FastAPI, LangGraph, Ollama, SQLAlchemy + SQLite, NumPy |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS 4, Framer Motion, Recharts |
| **LLM** | Gemma 3 4B (via Ollama) + nomic-embed-text embeddings |

---

## Project Structure

```
itops-main/
├── backend/
│   └── app/
│       ├── agents/              # Pipeline agents + LLM fallback
│       │   ├── monitoring.py        # Threshold + log anomaly detection
│       │   ├── predictive.py        # Failure forecasting
│       │   ├── diagnostic.py        # Root cause analysis
│       │   ├── remediation.py       # Fix generation
│       │   ├── reporting.py         # Summary generation
│       │   ├── llm_fallback.py      # Shared Ollama LLM helper
│       │   └── orchestrator.py      # LangGraph pipeline workflow
│       ├── api/routes/          # REST API endpoints
│       ├── data_sources/        # Pluggable data source interface
│       ├── database/            # Models + session
│       ├── memory/              # Vector store for RAG
│       └── services/            # Business logic
├── frontend/
│   └── src/
│       ├── pages/               # Dashboard, Pipeline, Incidents, etc.
│       ├── components/          # Reusable UI components
│       └── services/api.ts      # Backend API client
├── quickruns/                   # One-command launchers
│   ├── run-macos.sh
│   ├── run-linux.sh
│   └── run.bat
└── README.md
```

---

## Pages

| Page | Description |
|------|-------------|
| **Dashboard** | Real-time infrastructure overview with metric charts |
| **Agents** | Educational guide explaining the 5-stage pipeline |
| **Pipeline** | Run pipeline on a node with live agent progress |
| **Incidents** | All detected incidents with diagnostics (50/page) |
| **Infrastructure** | Node inventory with health indicators |
| **Data Sources** | Configure cloud providers (AWS, GCP, Azure, Prometheus) |
| **Simulators** | Manage simulated nodes for testing |
| **Runbooks** | Auto-generated knowledge base with RAG search (50/page) |
| **Settings** | LLM model, temperature, auto-run toggle |

---

## Data Source Integration

| Provider | Status |
|----------|--------|
| Built-in Simulator | ✅ Working |
| Custom API Push (`POST /api/datasources/ingest`) | ✅ Working |
| AWS CloudWatch | 🔧 UI ready, SDK not implemented |
| GCP Cloud Monitoring | 🔧 UI ready, SDK not implemented |
| Azure Monitor | 🔧 UI ready, SDK not implemented |
| Prometheus | 🔧 UI ready, scraper not implemented |

To push real metrics today:

```bash
curl -X POST http://localhost:8000/api/datasources/ingest \
  -H "Content-Type: application/json" \
  -d '{"node_name":"prod-web-1","node_type":"server","provider":"aws","region":"us-east-1","cpu_percent":85.2,"memory_percent":72.1,"disk_percent":45.0,"error_rate":2.5,"latency_ms":320}'
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `llama3.2:3b` | LLM model for fallback |
| `OLLAMA_EMBEDDING_MODEL` | `nomic-embed-text` | Embedding model for RAG |
| `DATABASE_URL` | `sqlite:///itops.db` | Database connection |
| `AGENT_TEMPERATURE` | `0.1` | LLM temperature |
| `ANOMALY_PROBABILITY` | `0.15` | Simulator anomaly rate |

---

## Key API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/agents/pipeline/start` | Start pipeline for a node |
| `GET` | `/api/agents/pipeline/runs/{id}` | Pipeline run status |
| `GET` | `/api/incidents/` | List all incidents |
| `GET` | `/api/incidents/{id}/remediation` | Remediation plan + scripts |
| `POST` | `/api/datasources/ingest` | Push metrics |
| `GET` | `/api/agents/runbooks` | List runbooks |

Full interactive docs at `http://localhost:8000/docs`.
