<div align="center">

# ITOps Orchestrator

### Autonomous Multi-Agent AIOps Platform for Self-Healing Infrastructure

*A team of five autonomous AI agents that monitor, predict, diagnose, and remediate infrastructure failures across multi-cloud environments — in real time, with institutional memory.*

<br />

[![Status](https://img.shields.io/badge/status-live%20on%20AWS-00C853?style=for-the-badge&logo=amazonaws&logoColor=white)](https://dynamic-it-ops.tankbusters.duckdns.org/)
[![CI/CD](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white)]()
[![License](https://img.shields.io/badge/built%20for-Hackathon-FF6D00?style=for-the-badge)]()

<br />

### Live Demo

<a href="https://dynamic-it-ops.tankbusters.duckdns.org/" target="_blank" rel="noopener noreferrer">
  <img src="https://img.shields.io/badge/%F0%9F%9A%80%20Launch%20ITOps%20Orchestrator-Click%20to%20Open%20Live%20App-00C853?style=for-the-badge&labelColor=0d1117&logoColor=white" alt="Launch ITOps Orchestrator" height="48" />
</a>

<sub>Deployed on AWS EC2 · Updated automatically via GitHub Actions on every push to `main`</sub>

**🔗 [`https://dynamic-it-ops.tankbusters.duckdns.org/`](https://dynamic-it-ops.tankbusters.duckdns.org/)** &nbsp;·&nbsp; **📘 [`/docs`](https://dynamic-it-ops.tankbusters.duckdns.org/docs) — Interactive API** &nbsp;·&nbsp; **💚 [`/health`](https://dynamic-it-ops.tankbusters.duckdns.org/health) — Component status**

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
                │  │ Postgres │  │ Vector Store │  │  LLM Bridge  │   │
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
- **Anomaly storm?** A configurable concurrency cap (`PIPELINE_MAX_CONCURRENT`) and a per-node cooldown protect PostgreSQL and the event loop from runaway dispatch.

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
| **Database** | **PostgreSQL 16** (production, co-located on EC2) · SQLite (dev fallback) · SQLAlchemy 2 ORM |
| **Deploy** | AWS EC2 (Amazon Linux 2023, Graviton ARM) · Nginx · systemd · GitHub Actions CI/CD |
| **TLS / DNS** | ZeroSSL cert via `acme.sh` (HTTP-01 webroot, auto-renew via `crond`) · DuckDNS dynamic DNS |

---

## Cloud Infrastructure — What Runs Where

Production runs out of a single, cost-optimised AWS region (**Mumbai · `ap-south-1`**), chosen for the lowest p99 latency from India. The entire stack fits on **one Graviton instance** with a **co-located PostgreSQL** — no managed services, ≈ **$15 / month** all-in.

**Live at** **[`https://dynamic-it-ops.tankbusters.duckdns.org/`](https://dynamic-it-ops.tankbusters.duckdns.org/)**

### AWS resources

| Resource | Type | Purpose |
|:---|:---|:---|
| **EC2 instance** | `t4g.small` · Graviton ARM · 2 vCPU · 2 GB RAM | Hosts everything: nginx, FastAPI, PostgreSQL, ChromaDB, ACME renewal cron |
| **EBS root volume** | 30 GB encrypted `gp3` | App code · Postgres data dir · ChromaDB persist dir — all encrypted at rest |
| **Elastic IP** | Static IPv4 | Stable public address; DuckDNS A record points here. Survives instance restarts. |
| **Security Group** | Stateful firewall | Inbound `22 / 80 / 443` only — everything else is loopback-only inside the box |
| **AWS Budgets** | Monthly $20 alert | Email at 80 % actual / 100 % forecast spend — prevents credit blowout |
| **IMDSv2** | Instance metadata mode | Token-auth required; defends against SSRF metadata exfiltration |

### What's running on that single instance

| Service | Role | Why local, not a managed service |
|:---|:---|:---|
| **Nginx** | Reverse proxy · TLS termination · serves React `dist/` | Single front door; no ALB needed (saves ~$16/mo) |
| **FastAPI / Uvicorn** | App server, `--workers 2`, behind nginx on `127.0.0.1:8000` | systemd-supervised; logs to journald |
| **PostgreSQL 16** | Durable store: incidents, runbooks, agent runs, simulated nodes | Co-located on EC2 instead of RDS → saves ~$15/mo, sufficient for a single-instance app |
| **ChromaDB** | Vector store powering institutional memory (RAG) | Persistent path at `/opt/itops/chroma_db`, env-configurable |
| **systemd** | Process supervision · auto-restart · ordered start after Postgres | Unit loads two env files: app `.env` + root-only `/etc/itops-db.env` for DB creds |
| **cronie + acme.sh** | TLS cert auto-renewal | Daily check, renews within ACME ARI window, reloads nginx on success |

### DNS & TLS

| Layer | Provider | Detail |
|:---|:---|:---|
| **Hostname** | **DuckDNS** (free dynamic DNS) | `dynamic-it-ops.tankbusters.duckdns.org` → A record → Elastic IP |
| **Certificate Authority** | **ZeroSSL** | Switched from Let's Encrypt — DuckDNS's authoritative DNS is chronically too slow for LE's CAA queries from its secondary validators |
| **ACME client** | **`acme.sh`** | HTTP-01 challenge via webroot at `/opt/itops/frontend/dist/.well-known/acme-challenge` |
| **Auto-renewal** | `crond` (system cron) | `acme.sh` registers a per-user cron entry on install; daily check, renews within ARI suggested window, reloads nginx via `--reloadcmd` |
| **Cipher policy** | TLS 1.2 + 1.3 only | `ssl_ciphers HIGH:!aNULL:!MD5` |
| **HTTP → HTTPS** | Nginx 301 redirect | `:80` redirects everything except `/.well-known/acme-challenge/` (kept open for cert renewals) |

### What we deliberately don't use (and why)

- **RDS** — overkill at this scale; co-located Postgres handles our few concurrent connections fine
- **ALB / NLB** — single instance, no rolling-deploy story to justify ~$16/mo
- **NAT Gateway** — single public subnet, ~$30/mo saved
- **S3 + CloudFront** — React `dist/` is ~1 MB after gzip, nginx serves it directly
- **Route 53** — DuckDNS is free and the auto-renewing dynamic DNS is enough
- **Secrets Manager / Parameter Store** — credentials live in app `.env` and root-only `/etc/itops-db.env` (mode 600), loaded as systemd `EnvironmentFile`s
- **CloudWatch agent / X-Ray** — `journalctl -u itops-backend` plus FastAPI's structured logging are sufficient

The whole production footprint is **one EC2 instance, one EIP, one EBS volume** — verified via a cross-region account scan. Free-tier credits cover months of runway.

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
│   ├── scripts/               ← Ops scripts
│   │   ├── migrate_sqlite_to_postgres.py   ← One-shot data migration (FK-ordered, sequence-safe)
│   │   └── seed_runbooks.py                ← Re-seed canonical runbooks
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── pages/             ← 9 feature-rich pages
│       ├── components/        ← Glassmorphism UI system
│       └── services/          ← Typed API client
├── deployment/
│   ├── cloud-shell-bootstrap.sh  ← One-shot AWS infra provisioner (run in CloudShell)
│   ├── setup-ec2.sh              ← Per-instance bootstrap (Python + nginx + Postgres + systemd)
│   ├── nginx.conf                ← Reverse proxy config
│   ├── itops-backend.service     ← systemd unit
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

Two scripts get you from zero to a running deployment in under 15 minutes:

```bash
# ① From AWS CloudShell (in your target region) — provisions all the infra
bash deployment/cloud-shell-bootstrap.sh
#  Creates: SSH key pair · security group · t4g.small w/ encrypted gp3 ·
#  Elastic IP · $20/mo Budget alert.  Prints the public IP at the end.

# ② SSH into the new box, then run the per-instance bootstrap
bash deployment/setup-ec2.sh
#  Installs: Python 3.11 · Nginx · PostgreSQL 16 · systemd service ·
#  passwordless sudo for service restarts.  Creates the `itops` Postgres
#  role + database and writes DATABASE_URL into root-only
#  /etc/itops-db.env (loaded by systemd as a second EnvironmentFile).
```

Add these three GitHub Secrets and push to `main`:

```
EC2_HOST              your Elastic IP
EC2_USER              ec2-user
EC2_SSH_PRIVATE_KEY   contents of your .pem
```

### Adding HTTPS (free, via DuckDNS + ZeroSSL)

Point a free DuckDNS subdomain at your Elastic IP, then on the box:

```bash
sudo dnf install -y cronie && sudo systemctl enable --now crond
curl https://get.acme.sh | sh -s email=you@example.com
~/.acme.sh/acme.sh --set-default-ca --server zerossl
~/.acme.sh/acme.sh --issue --webroot /opt/itops/frontend/dist \
    -d your.subdomain.duckdns.org --keylength 2048
```

Then add a `:443` server block to `/etc/nginx/conf.d/itops.conf` pointing at the issued cert (see the `Cloud Infrastructure` section above for the cipher policy and renewal hook). Set `CORS_ALLOW_ORIGINS=https://your.subdomain.duckdns.org` in `.env` and restart the backend.

> **Note:** Let's Encrypt may fail on DuckDNS subdomains with `DNS problem: query timed out looking up CAA` because DuckDNS's authoritative DNS is too slow for LE's secondary validators. **ZeroSSL** has more lenient timeouts and works reliably.

### Migrating data from SQLite (optional)

If you're cutting over from a SQLite-backed deployment, run the one-shot migration script:

```bash
# Copy your old SQLite file to the new box, then on the box:
sudo -E env DATABASE_URL=$(sudo grep DATABASE_URL /etc/itops-db.env | cut -d= -f2-) \
    /opt/itops/venv/bin/python -m scripts.migrate_sqlite_to_postgres \
    --source sqlite:////tmp/old-itops.db
```

The script copies tables in FK-dependency order and realigns Postgres sequences so future inserts don't collide.

---

## Engineering Highlights — What's Under the Hood

These are the parts the judges should look at when they want to understand depth.

- **Bounded async pipeline dispatch** — `_spawn_pipeline()` uses a semaphore + live-task set so an anomaly storm can never spawn unbounded coroutines or GC tasks mid-flight. (`backend/app/main.py:70`)
- **Cooldown-based deduplication** — repeated anomalies on the same node/type are suppressed for 5 minutes to keep the incident table clean and the DB write-light. (`backend/app/main.py:184`)
- **Tolerant JSON parsing for small-model output** — raw → fenced → first-balanced-brace recovery so a slightly malformed Ollama response doesn't fail the pipeline. (`backend/app/llm/provider.py:27`)
- **Component-level health probe** — `/health` reports DB, vector store, and each background task individually with a 503 the moment any subsystem dies. (`backend/app/main.py:663`)
- **State-preserving deploys** — `rsync --delete` with `--exclude` rules keeps the local SQLite DB (dev), vector store, `.env`, and runtime settings across every release. In production, DB credentials live in root-only `/etc/itops-db.env` (mode 600) and are loaded as a second systemd `EnvironmentFile`, so deploys never touch secrets. (`.github/workflows/`)
- **Cross-DB engine config** — `database/session.py` branches on the URL scheme: SQLite gets `check_same_thread=False`; Postgres gets a pre-tuned connection pool (`pool_pre_ping`, `pool_recycle=1800`) so stale connections never reach the app. (`backend/app/database/session.py`)
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
