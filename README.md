<div align="center">

# ITOps Orchestrator

### Autonomous Multi-Agent AIOps Platform for Self-Healing Infrastructure

*A team of five autonomous AI agents that monitor, predict, diagnose, and remediate infrastructure failures across multi-cloud environments — in real time, with institutional memory.*

<br />

[![Status](https://img.shields.io/badge/status-live%20on%20AWS-00C853?style=for-the-badge&logo=amazonaws&logoColor=white)](http://15.134.88.249/)
[![CI/CD](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white)]()
[![License](https://img.shields.io/badge/built%20for-Hackathon-FF6D00?style=for-the-badge)]()

<br />

### Live Demo

<a href="http://15.134.88.249/" target="_blank" rel="noopener noreferrer">
  <img src="https://img.shields.io/badge/%F0%9F%9A%80%20Launch%20ITOps%20Orchestrator-Click%20to%20Open%20Live%20App-00C853?style=for-the-badge&labelColor=0d1117&logoColor=white" alt="Launch ITOps Orchestrator" height="48" />
</a>

<sub>Deployed on AWS EC2 · Updated automatically via GitHub Actions on every push to `main`</sub>

**🔗 [`http://15.134.88.249/`](http://15.134.88.249/)** &nbsp;·&nbsp; **📘 [`/docs`](http://15.134.88.249/docs) — Interactive API** &nbsp;·&nbsp; **💚 [`/health`](http://15.134.88.249/health) — Component status**

<br />

<img src="https://img.shields.io/badge/Agents-5%20Autonomous-00C853?style=flat-square" />
<img src="https://img.shields.io/badge/Orchestration-LangGraph-00BFA5?style=flat-square" />
<img src="https://img.shields.io/badge/LLM-Gemini%20%7C%20OpenAI%20%7C%20Ollama-4285F4?style=flat-square" />
<img src="https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white" />
<img src="https://img.shields.io/badge/Frontend-React%2019-61DAFB?style=flat-square&logo=react&logoColor=black" />
<img src="https://img.shields.io/badge/Memory-RAG%20%2B%20Vector%20Store-FF6D00?style=flat-square" />
<img src="https://img.shields.io/badge/Deploy-AWS%20EC2-FF9900?style=flat-square&logo=amazon-ec2&logoColor=white" />

<br />

**Team Tank Busters** · P. Shiva Santhosh · N. S. J. S. Dhanush · P. Shikhar

</div>

---

## The Problem

Modern enterprises run thousands of services across AWS, GCP, Azure, and on-prem clusters. When an incident strikes at 3 AM:

- Alerts fire from a dozen siloed tools — none of them coordinate.
- An on-call engineer manually triages, searches Slack for the last person who saw this, and digs through stale runbooks.
- A trivial fix that took 5 minutes last quarter takes 45 minutes today because **no system remembers**.
- By the time a human acts, the blast radius has already grown.

**One AI model alone can't fix this.** Monitoring, prediction, root-cause analysis, and safe remediation are fundamentally different reasoning tasks. They demand specialized agents that talk to each other — an *agentic* architecture.

## The Solution

ITOps Orchestrator deploys **five autonomous agents** coordinated by a LangGraph state machine. They observe the fleet continuously, forecast failures before they happen, diagnose root cause using memory of past incidents, generate executable remediation with rollback, and capture every resolution as a runbook the system will use the next time.

```
   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌─────────────┐    ┌──────────┐
   │ Monitor  │───▶│ Predict  │───▶│ Diagnose │───▶│ Remediate   │───▶│ Report   │
   │  Agent   │    │  Agent   │    │  Agent   │    │   Agent     │    │  Agent   │
   └──────────┘    └──────────┘    └────┬─────┘    └──────┬──────┘    └────┬─────┘
    Anomaly         Failure              │                 │                │
    Detection       Forecasting          │  ┌──────────┐   │                │
                                         ├─▶│          │◀──┘                │
                                         │  │ Vector   │                    │
                                    READ │  │   DB     │ READ               │
                                         │  │  (RAG)   │                    │
                                         └─▶│          │◀───────────────────┘
                                            │ Past     │           WRITE
                                            │ Incidents│     (every resolved
                                            │ Runbooks │      incident is saved)
                                            └──────────┘
```

Every resolved incident **enriches institutional memory**. The platform gets smarter with every failure it sees.

---

## Why This Wins

| Traditional Monitoring | **ITOps Orchestrator** |
|:---|:---|
| Detects anomalies, pages a human | Detects, diagnoses, **and remediates** autonomously |
| Siloed dashboards, no coordination | 5 agents communicating via LangGraph state machine |
| Reactive — fires after failure | **Predictive** — forecasts time-to-failure before impact |
| Static runbooks, manual lookup | Auto-generated remediation scripts with rollback safety |
| No memory of past solutions | **RAG-powered institutional memory** — learns every incident |
| Locked into one cloud or one LLM | Pluggable data sources · Gemini · OpenAI · Ollama — switchable at runtime |

---

## Live Architecture

```
                                   ┌──────────────────────┐
                                   │   React 19 + Vite    │
                                   │  Glassmorphism UI    │
                                   └──────────┬───────────┘
                                              │  HTTPS · WebSocket
                                              ▼
                ┌─────────────────────────────────────────────────────┐
                │                  Nginx Reverse Proxy                │
                │           / → SPA · /api → API · /ws → WS           │
                └─────────────────────────────┬───────────────────────┘
                                              │
                                              ▼
                ┌─────────────────────────────────────────────────────┐
                │           FastAPI · Uvicorn (systemd)               │
                │                                                     │
                │  ┌───────────────────────────────────────────────┐  │
                │  │      LangGraph Multi-Agent Orchestrator       │  │
                │  │   Monitor → Predict → Diagnose → Remediate    │  │
                │  │                       ↓ HITL → Report         │  │
                │  └───────────────────────────────────────────────┘  │
                │                                                     │
                │  ┌──────────┐  ┌──────────────┐  ┌──────────────┐   │
                │  │  SQLite  │  │ Vector Store │  │  LLM Bridge  │   │
                │  │ + ORM    │  │ (NumPy+JSON) │  │  Gemini /    │   │
                │  │          │  │  + Ollama    │  │  OpenAI /    │   │
                │  │          │  │  embeddings  │  │  Ollama      │   │
                │  └──────────┘  └──────────────┘  └──────────────┘   │
                │                                                     │
                │  ┌───────────────────────────────────────────────┐  │
                │  │  Pluggable Data Sources                       │  │
                │  │  AWS CW · GCP · Azure · Prometheus · Docker   │  │
                │  │  · Built-in Simulator · Custom API Push       │  │
                │  └───────────────────────────────────────────────┘  │
                └─────────────────────────────────────────────────────┘
                                              ▲
                                              │  git push main
                ┌─────────────────────────────┴───────────────────────┐
                │     GitHub Actions · Build · Type-check · Deploy    │
                │              → rsync → systemd restart              │
                └─────────────────────────────────────────────────────┘
```

---

## The Five Agents

| Agent | Role | Intelligence Stack |
|:---|:---|:---|
| **Monitoring** | Real-time anomaly detection across CPU, memory, disk, network, latency, errors, and log pattern matching | Threshold engine · LLM fallback for context |
| **Predictive** | Failure-probability forecasting, time-to-failure estimation, cascade-risk scoring | Trend analysis · LLM reasoning over metric history |
| **Diagnostic** | Root cause analysis, causal chain mapping, blast radius assessment | Known-Issue Profiles · LLM · **RAG** over past incidents |
| **Remediation** | Generates executable shell scripts with validation steps and rollback commands | Pre-approved templates · LLM · **RAG** over proven fixes |
| **Reporting** | Executive summaries, SLA impact, auto-generated runbooks for the knowledge base | Structured summarization · writes to vector memory |

### Hybrid "Fast Path First, LLM When Needed"

- **Frequent incidents** — memory leaks, CPU spikes, disk full, network saturation — are resolved **instantly** through pre-approved response profiles. No LLM latency.
- **Novel anomalies** invoke the LLM, which receives **RAG context** retrieved from the most similar past incidents and proven runbooks.
- **LLM unavailable?** The pipeline gracefully degrades to safe defaults — it *never breaks*.
- **Anomaly storm?** A configurable concurrency cap (`PIPELINE_MAX_CONCURRENT`) and a per-node cooldown protect SQLite and the event loop from runaway dispatch.

### Human-in-the-Loop

Low/medium severity remediations auto-apply. **High and critical** severities pause the LangGraph workflow at an approval checkpoint and resume on operator decision — safety first.

---

## Data Sources — Pluggable by Design

ITOps Orchestrator ships with an abstract `DataSource` interface so any provider can be plugged in without touching the agents.

| Platform | Connectivity | Surface |
|:---|:---:|:---|
| **AWS CloudWatch** | Configurable | EC2 · RDS · ELB |
| **GCP Cloud Monitoring** | Configurable | Compute Engine · Cloud SQL |
| **Azure Monitor** | Configurable | VM · App Service · SLI |
| **Prometheus** | Configurable | PromQL · Node Exporter |
| **Docker** | Configurable | Container stats via daemon API |
| **Built-in AI Simulator** | Active | Full multi-node fleet with realistic diurnal patterns and 6 anomaly scenarios |
| **Custom API Push** | Active | Generic JSON over a high-throughput REST endpoint |

The simulator injects six failure modes — memory leak, CPU spike, disk fill, network saturation, connection pool exhaustion, cascading failure — so the entire incident lifecycle is demoable end-to-end without provisioning real cloud infrastructure.

---

## The Platform — Nine Production-Grade Pages

| Page | What It Does |
|:---|:---|
| **Dashboard** | Real-time fleet health · live metric charts streamed over WebSocket · incident ticker |
| **Agents** | Interactive guide explaining the five-agent pipeline |
| **Pipeline** | Run the full pipeline on any node with live step-by-step progress |
| **Incidents** | Full incident history with root cause, blast radius, remediation, and approval controls |
| **Infrastructure** | Node inventory, status indicators, drill-down metric history |
| **Data Sources** | One-click cloud-provider configuration |
| **Simulators** | Create, start, stop, and inspect simulated nodes for testing and demos |
| **Runbooks** | Auto-generated knowledge base — the system's growing institutional memory |
| **Settings** | Switch LLM provider at runtime · tune temperature · toggle auto-run pipeline |

Built with a custom **glassmorphism** design system: GlassNavbar, GlassTab, animated tab transitions powered by Framer Motion, and Recharts visualizations.

---

## Tech Stack

| Layer | Technology |
|:---|:---|
| **Frontend** | React 19 · TypeScript · Vite 8 · Tailwind CSS 4 · Framer Motion · Recharts · React Router 7 |
| **Backend** | FastAPI · Uvicorn · SQLAlchemy 2 · Pydantic 2 · asyncio · WebSockets |
| **Orchestration** | LangChain · **LangGraph** state machine |
| **LLM Providers** | Google Gemini 2.5 Flash · OpenAI GPT-4o · Ollama (local) — **switchable at runtime** |
| **Embeddings** | `nomic-embed-text` via Ollama |
| **Memory** | NumPy cosine-similarity vector store · JSON persistence (no C++ build deps) |
| **Database** | SQLite · ORM-managed migrations · transactional snapshots |
| **Deploy** | AWS EC2 (Amazon Linux 2023) · Nginx · systemd · GitHub Actions CI/CD |

---

## CI/CD — Push to Main, Ship to Production

Every commit on `main` runs through a hardened GitHub Actions pipeline:

```
git push main
   │
   ▼
┌──────────────────────────────┐
│   ① CI — Build & Type-check  │
│   • npm ci + tsc + vite build │
│   • pip install + import test │
│   • Upload dist artifact      │
└──────────────────────────────┘
              │ on success + push
              ▼
┌──────────────────────────────┐
│   ② Deploy to EC2            │
│   • rsync backend (preserves │
│     DB, vector store, .env)  │
│   • rsync built frontend     │
│   • pip install on host      │
│   • systemctl restart        │
│   • nginx reload             │
└──────────────────────────────┘
              │
              ▼
┌──────────────────────────────┐
│   ③ Health Check             │
│   GET /health → component    │
│   matrix · 503 on degraded   │
└──────────────────────────────┘
```

**Zero-downtime, zero-data-loss deploys.** The deploy `rsync` explicitly excludes `itops.db`, `chroma_db/`, `.env`, and `runtime_settings.json` so user state and secrets survive every release. Concurrency control on the workflow prevents stomping in-flight deploys.

---

## API Surface

```
POST   /api/agents/pipeline/run            Launch pipeline for a node
POST   /api/agents/pipeline/run-all        Launch pipeline fleet-wide
GET    /api/agents/                        List agent status + run counts
GET    /api/agents/runbooks                Auto-generated knowledge base
GET    /api/agents/memory/search?query=…   RAG search across institutional memory

GET    /api/incidents/                     Query incident history
GET    /api/incidents/{id}                 Full incident detail
POST   /api/incidents/{id}/approve         Human-in-the-loop approval
GET    /api/incidents/{id}/logs            Per-agent execution trace

GET    /api/infrastructure/nodes           Full node inventory
GET    /api/infrastructure/dashboard       Aggregate fleet stats

POST   /api/datasources/ingest             Push metrics from anywhere
GET    /api/simulators/                    Manage simulated fleet
POST   /api/settings/llm                   Switch LLM provider at runtime

GET    /health                             Component-level liveness probe
WS     /ws/metrics                         Live metric + anomaly stream
```

Full interactive Swagger UI at `/docs`.

---

## Project Structure

```
itops/
├── .github/workflows/         GitHub Actions CI/CD pipeline
├── backend/
│   ├── app/
│   │   ├── agents/            ← 5 autonomous pipeline agents
│   │   │   ├── monitoring.py
│   │   │   ├── predictive.py
│   │   │   ├── diagnostic.py
│   │   │   ├── remediation.py
│   │   │   ├── reporting.py
│   │   │   ├── llm_fallback.py
│   │   │   └── orchestrator.py    ← LangGraph state machine
│   │   ├── api/routes/        ← REST + WebSocket endpoints
│   │   ├── data_sources/      ← Pluggable cloud connectors
│   │   ├── database/          ← SQLAlchemy models + session
│   │   ├── llm/               ← Multi-provider LLM bridge
│   │   ├── memory/            ← Vector store (RAG)
│   │   ├── services/          ← Core business logic
│   │   └── main.py            ← FastAPI app + lifespan + monitoring loops
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── pages/             ← 9 feature-rich pages
│       ├── components/        ← Glassmorphism UI system
│       └── services/          ← Typed API client
├── deployment/
│   ├── setup-ec2.sh           ← One-shot Amazon Linux 2023 bootstrap
│   ├── nginx.conf             ← Reverse proxy config
│   ├── itops-backend.service  ← systemd unit
│   └── sample.env
├── quickruns/                 ← 1-click local launchers (Win / mac / Linux)
└── README.md
```

---

## Running Locally

> Full setup walkthrough lives in [`quickruns/howtorun.md`](quickruns/howtorun.md). The short version:

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                              # add GEMINI_API_KEY (or OPENAI / Ollama)
uvicorn app.main:app --reload

# Frontend (in a second terminal)
cd frontend
npm install
npm run dev
```

Visit **http://localhost:5173** for the app and **http://localhost:8000/docs** for the API.

Prefer one click? Run `quickruns/run.bat` (Windows), `quickruns/run-macos.sh`, or `quickruns/run-linux.sh`.

---

## Deploying to AWS EC2

```bash
# On a fresh Amazon Linux 2023 EC2 instance
bash deployment/setup-ec2.sh
```

The script installs Python 3.11, Nginx, configures the systemd service, sets up passwordless sudo for service restarts, and prints the three GitHub Secrets you need:

```
EC2_HOST              your public IP
EC2_USER              ec2-user
EC2_SSH_PRIVATE_KEY   contents of your .pem
```

Add those to the repo, push to `main`, and CI/CD takes over.

---

## Engineering Highlights — What's Under the Hood

These are the parts the judges should look at when they want to understand depth.

- **Bounded async pipeline dispatch** — `_spawn_pipeline()` uses a semaphore + live-task set so an anomaly storm can never spawn unbounded coroutines or GC tasks mid-flight. (`backend/app/main.py:70`)
- **Cooldown-based deduplication** — repeated anomalies on the same node/type are suppressed for 5 minutes to keep the incident table clean and SQLite write-light. (`backend/app/main.py:184`)
- **Tolerant JSON parsing for small-model output** — raw → fenced → first-balanced-brace recovery so a slightly malformed Ollama response doesn't fail the pipeline. (`backend/app/llm/provider.py:27`)
- **Component-level health probe** — `/health` reports DB, vector store, and each background task individually with a 503 the moment any subsystem dies. (`backend/app/main.py:663`)
- **State-preserving deploys** — `rsync --delete` with `--exclude` rules keeps the DB, vector store, env, and runtime settings across every release. (`.github/workflows/`)
- **Pluggable everything** — Data sources, LLM providers, and remediation profiles are all interface-driven. New cloud? Implement `DataSource`. New model? Implement one method in `llm/provider.py`.

---

## Enterprise Impact

| Metric | Impact |
|:---|:---|
| **MTTR** | Minutes instead of hours — agents execute validated fixes instantly |
| **Downtime** | Drastically reduced through predictive detection + autonomous remediation |
| **SLA Adherence** | Proactive resolution prevents breaches before they happen |
| **Operator Toil** | Auto-triage + auto-remediation collapses 80% of the on-call workload |
| **Knowledge Retention** | Every resolved incident enriches institutional memory — never relearn |

---

<div align="center">

### Built by Team Tank Busters

**P. Shiva Santhosh** · **N. S. J. S. Dhanush** · **P. Shikhar**

*For the future of autonomous IT operations.*

</div>
