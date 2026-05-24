# ITOps Session Report — 2026-05-19
## Complete Technical Reference for Next Developer / Next AI Session

---

## SECTION 1 — PROJECT STATUS TODAY

### Current Deployment
- **Live URL:** `http://3.25.230.225` (old Sydney EC2 — being replaced)
- **New EC2:** Mumbai region (`ap-south-1`), `t4g.small`, ARM64, 30GB encrypted EBS
- **Elastic IP:** Attached to new Mumbai instance — IP does NOT change on restart
- **Database:** Migrating from SQLite → PostgreSQL (in progress)
- **CI/CD:** GitHub Actions auto-deploys on every push to `main`

### GitHub Repo
`https://github.com/22f3000626/itops`

### EC2 SSH Access
```powershell
# Mumbai (new)
ssh -i "C:\Users\<username>\Downloads\itops-mumbai.pem" ec2-user@<MUMBAI_PUBLIC_IP>

# Sydney (old — being replaced)
ssh -i "C:\Users\<username>\Downloads\itops-pemkey.pem" ec2-user@3.25.230.225
```

### Windows PEM Key Permission Fix
```powershell
$Key = "C:\Users\<username>\Downloads\itops-mumbai.pem"
$User = "$env:USERDOMAIN\$env:USERNAME"
icacls $Key /reset
icacls $Key /inheritance:r
icacls $Key /remove "Users" "Authenticated Users" "Everyone"
icacls $Key /grant "${User}:(R)"
```

---

## SECTION 2 — WHAT WAS DONE TODAY

### 2.1 Git Sync Fix
Local repo was on deleted branch `ui-enhancements`, diverged from remote main with 16 merge conflicts.

**Fix:**
```bash
git reset --hard origin/main
```
Safe because all local commits were already in remote under different hashes. Always verify first:
```bash
git log --oneline origin/main | grep "<your commit message>"
```

---

### 2.2 Per-Agent Temperature Tuning — Committed `c25bfc3`

**Problem found during testing:**
High temperature produced `sudo shutdown -r now` in a remediation script for a simple CPU spike — would reboot a production database server.

**Research backed:** RSA Conference 2025 paper on AIOps confirms high temperature = dangerous remediation scripts that bypass human review.

**Implementation — 4 files changed:**

`backend/app/config.py`:
```python
MONITORING_TEMPERATURE  = float(os.getenv("MONITORING_TEMPERATURE",  "0.1"))
PREDICTIVE_TEMPERATURE  = float(os.getenv("PREDICTIVE_TEMPERATURE",  "0.1"))
DIAGNOSTIC_TEMPERATURE  = float(os.getenv("DIAGNOSTIC_TEMPERATURE",  "0.2"))
REMEDIATION_TEMPERATURE = float(os.getenv("REMEDIATION_TEMPERATURE", "0.0"))
REPORTING_TEMPERATURE   = float(os.getenv("REPORTING_TEMPERATURE",   "0.4"))
```

`backend/app/agents/llm_fallback.py` — each function now uses agent-specific temperature:
```python
result = await _call_llm(prompt, temperature=_settings.diagnostic_temperature)
result = await _call_llm(prompt, temperature=_settings.remediation_temperature)
result = await _call_llm(prompt, temperature=_settings.predictive_temperature)
```

`backend/app/services/settings_service.py` — persisted as runtime settings, changeable from UI without restart.

`backend/app/api/routes/settings.py` — API accepts per-agent temps.

**Temperature rationale:**
| Agent | Temperature | Why |
|---|---|---|
| Monitoring | 0.1 | Accuracy critical |
| Predictive | 0.1 | Accuracy critical |
| Diagnostic | 0.2 | Slight creativity for root cause |
| Remediation | 0.0 | Safety critical — generates scripts |
| Reporting | 0.4 | Can be expressive |

---

### 2.3 ChromaDB Path Env Var — Committed `f48c0cd`

**Change in `backend/app/config.py`:**
```python
# Before
CHROMA_PERSIST_DIR = str(BASE_DIR / "chroma_db")

# After
CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", str(BASE_DIR / "chroma_db"))
```

**Why:** Prepares for S3 Files or EFS mount without any future code changes. Set env var, data goes to new location automatically. `DATABASE_URL` was already env var — this makes ChromaDB consistent.

---

### 2.4 PostgreSQL Migration — Committed `9fb549c`

**Migration script:** `backend/scripts/migrate_sqlite_to_postgres.py`

Copies all SQLite data to PostgreSQL preserving PKs, resets sequences so new inserts don't collide.

```bash
cd backend
export DATABASE_URL='postgresql://itops:secret@localhost/itops'
python -m scripts.migrate_sqlite_to_postgres \
    --source sqlite:///./itops.db \
    --target postgresql://itops:secret@localhost/itops \
    --dry-run   # test first
    # remove --dry-run to actually migrate
```

**`backend/app/database/session.py`** now supports both:
- SQLite: WAL mode, busy_timeout, check_same_thread
- PostgreSQL: pool_size=5, max_overflow=5, pool_pre_ping, pool_recycle=1800

Auto-detects from `DATABASE_URL` prefix.

---

### 2.5 Mumbai EC2 Bootstrap — `deployment/cloud-shell-bootstrap.sh`

Run from AWS CloudShell in Mumbai region. Creates:
- SSH key pair → `~/itops-mumbai.pem`
- Security group (SSH from your IP, HTTP world-open)
- `t4g.small` ARM64 instance, 30GB encrypted gp3 EBS, IMDSv2 required
- Elastic IP (fixed — survives restarts)
- $20/month budget alert

```bash
# In AWS CloudShell (Mumbai region):
bash cloud-shell-bootstrap.sh
```

After running, update GitHub secrets:
- `EC2_HOST` = new Mumbai IP
- `EC2_USER` = `ec2-user`
- `EC2_SSH_PRIVATE_KEY` = contents of `itops-mumbai.pem`

### 2.6 AWS Integration UX/API Commit — `a60290b`
**Message:** `updated datasources to incorporate aws cloud watch`

This is the AWS integration UX/API commit.

**What changed:**
- Expanded `backend/app/api/routes/datasources.py`
- Added full AWS data-source lifecycle handling

**Capabilities added:**
- AWS source appears as a real source in the platform
- Source record synthesized from persisted settings
- Credential masking/redaction in API responses
- Region support
- Instance ID support
- Log group support
- Connection testing
- Source activation / deactivation
- AWS disconnect cleanup path

**What the datasource API now supports for AWS:**
- `aws_access_key_id`
- `aws_secret_access_key`
- `region`
- `instance_ids`
- `log_groups`
- source status/error reporting

**Judgment:**
- This is what turned CloudWatch from backend-only code into a judge-visible product feature.
- Without this, the AWS work would not have surfaced cleanly in the UI/API.

### 2.7 Azure And GCP Integration UX/API Commit — `32190f4`
**Message:** `feat(datasources): wire Azure and GCP live settings`

This is the Azure/GCP equivalent of the AWS datasource productization work.

**What changed:**
- Expanded `backend/app/api/routes/datasources.py`
- Added live Azure and GCP source synthesis from persisted settings
- Added Azure/GCP lifecycle handling in the datasource API
- Added focused API regression coverage in `backend/tests/api/test_datasources_route.py`

**Capabilities added for Azure and GCP:**
- Provider source appears as a real source in the platform
- Source record synthesized from persisted settings
- Secret masking/redaction in API responses
- Connection testing
- Source activation / deactivation
- Provider disconnect cleanup path
- Source status/error reporting

**What the datasource API now supports for Azure:**
- `tenant_id`
- `client_id`
- `client_secret`
- `subscription_id`
- `resource_group`
- source status/error reporting

**What the datasource API now supports for GCP:**
- `project_id`
- `credentials_json`
- `zone`
- source status/error reporting

**Judgment:**
- This is what turned Azure Monitor and GCP Cloud Monitoring from adapter code into judge-visible product features.
- Azure and GCP now follow the same UX/API lifecycle as AWS: persisted settings, redacted responses, connection tests, live activation, and cleanup.
- The current follow-up hardening closes a lifecycle gap across all three providers: disabling a cloud source now disconnects the live adapter without wiping saved configuration.

### 2.8 Cloud Metric Refinement / Infra Rendering Hardening — `7226e45` plus follow-up multi-cloud normalization
**Original AWS message:** `fixed metrics in cloud watch`

This is the refinement / hardening pass that proves the CloudWatch integration was exercised against real infrastructure behavior rather than left at adapter-only level.

**Files changed in the AWS refinement pass:**
- `backend/app/data_sources/cloudwatch.py`
- `backend/app/services/infra_service.py`
- `frontend/src/pages/Infrastructure.tsx`

**What Shiva fixed in AWS:**
- Corrected metric mapping and display behavior for CloudWatch-fed nodes
- Adjusted infrastructure aggregation / service logic
- Fixed frontend handling so AWS nodes display properly

**Likely impact of the AWS refinement:**
- Better normalization of AWS metric values
- Better presentation of CloudWatch-backed infrastructure in the UI
- Reduced mismatch between raw CloudWatch values and the app’s charts / status model

**Judgment on the AWS refinement:**
- This is a strong sign of real integration work.
- Teams that fake cloud support usually stop at adapter creation; this commit shows the team hit real-data issues and fixed them.

**Equivalent final hardening now applied across Azure and GCP as well:**
- `infra_service.ensure_node_exists()` now refreshes canonical node type, provider, region, and IP data when cloud adapters report updated values
- Azure VM events only advertise memory as measured when Azure Monitor actually returned the memory signal, preventing misleading zero-value charts
- GCP compute events now do the same for memory
- GCP Cloud SQL events now normalize `disk_bytes_used` into the canonical `disk_percent` field used by the infrastructure UI
- AWS RDS and ELB events now expose `measured_metrics` consistently, so detail charts only render metrics that are truly backed by provider data
- Infrastructure page rendering now handles cloud resources with no IP address more cleanly, especially Azure/GCP resources that are better identified by provider metadata than by host IP

**Engineering judgment:**
- This closes the last obvious product gap between “adapter exists” and “multi-cloud telemetry displays credibly in the infrastructure UI”.
- The platform now treats AWS, Azure, and GCP more consistently from raw provider metrics through backend normalization to frontend rendering.

---

## SECTION 3 — S3 FILES IMPLEMENTATION PLAN

### 3.1 What Is S3 Files

Amazon S3 Files became generally available on **April 7, 2026**. It lets you mount an S3 bucket as an NFS file system on EC2, ECS, Lambda, Fargate. Your app reads/writes files normally — no boto3 calls needed.

### 3.2 Why S3 Files + PostgreSQL Is Better Than EFS + ECS

| | ECS + EFS | S3 Files + RDS PostgreSQL |
|---|---|---|
| Cost | $0.30/GB + ALB ~$20/month | $0.023/GB + RDS free tier |
| Load balancer required | ✅ Yes (ECS needs ALB) | ❌ No (keep existing nginx) |
| Setup complexity | Very high — Docker, ECS, IAM, VPC | Medium |
| SQLite safe | ✅ Yes | ❌ No — POSIX locks broken |
| PostgreSQL safe | ✅ Yes | ✅ Yes — handles its own locking |
| ChromaDB safe | ✅ Yes | ✅ Yes |
| Data survives restart | ✅ Yes | ✅ Yes |
| Maturity | Years old | 6 weeks old (April 2026) |
| Monthly cost estimate | $50-100 minimum | $0-15 |

**Critical:** SQLite does NOT work on S3 Files. S3 Files does not support POSIX advisory locks (`flock`, `fcntl`). SQLite relies on these for concurrent write safety. This causes database corruption. PostgreSQL manages its own locking — safe on S3 Files.

### 3.3 Target Architecture

```
Internet
  → nginx:80 on EC2 (keep as-is)
      → FastAPI backend
          → PostgreSQL on RDS (free tier)    ← replaces SQLite
          → ChromaDB on S3 Files mount       ← replaces local chroma_db/
```

No ECS. No EFS. No ALB. No Docker. Keep the existing EC2 setup.

### 3.4 Step-by-Step S3 Files Implementation

#### Step 1 — Create RDS PostgreSQL (AWS Console)

1. Go to AWS Console → RDS → Create database
2. Engine: PostgreSQL 16
3. Template: Free tier
4. DB identifier: `itops-db`
5. Username: `itops`
6. Password: generate and save securely
7. Instance: `db.t3.micro` (free tier)
8. Storage: 20GB gp2
9. VPC: same VPC as EC2
10. Public access: No (EC2 connects privately)
11. Create database

Get the endpoint — looks like: `itops-db.xxxx.ap-south-1.rds.amazonaws.com`

#### Step 2 — Allow EC2 to Connect to RDS

In RDS security group, add inbound rule:
- Type: PostgreSQL
- Port: 5432
- Source: EC2 security group ID

#### Step 3 — Create S3 Bucket for ChromaDB

```bash
# In AWS CloudShell or CLI
aws s3 mb s3://itops-chromadb-storage --region ap-south-1
```

#### Step 4 — Attach S3 Files to EC2

S3 Files uses AWS's managed NFS connector. On EC2:

```bash
# Install mount helper
sudo dnf install -y amazon-s3-files

# Create mount point
sudo mkdir -p /mnt/s3/itops

# Mount S3 bucket
sudo mount -t amazon-s3 itops-chromadb-storage /mnt/s3/itops \
    -o region=ap-south-1

# Make persistent across reboots — add to /etc/fstab
echo "itops-chromadb-storage /mnt/s3/itops amazon-s3 _netdev,region=ap-south-1 0 0" | sudo tee -a /etc/fstab
```

**EC2 IAM role must have S3 permissions:**
```json
{
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
    "Resource": [
        "arn:aws:s3:::itops-chromadb-storage",
        "arn:aws:s3:::itops-chromadb-storage/*"
    ]
}
```

#### Step 5 — Update Environment Variables on EC2

```bash
sudo nano /opt/itops/backend/.env
```

Add/update these lines:
```bash
# PostgreSQL (replace SQLite)
DATABASE_URL=postgresql://itops:YOUR_PASSWORD@itops-db.xxxx.ap-south-1.rds.amazonaws.com:5432/itops

# ChromaDB on S3 Files
CHROMA_PERSIST_DIR=/mnt/s3/itops/chroma_db
```

#### Step 6 — Migrate Data from SQLite to PostgreSQL

```bash
cd /opt/itops/backend
source venv/bin/activate

# Test first
python -m scripts.migrate_sqlite_to_postgres \
    --source sqlite:///./itops.db \
    --dry-run

# If dry run looks good, run for real
python -m scripts.migrate_sqlite_to_postgres \
    --source sqlite:///./itops.db
```

#### Step 7 — Restart and Verify

```bash
sudo systemctl restart itops-backend
sudo journalctl -u itops-backend -n 50 --no-pager
curl http://localhost:8000/health
```

Health check should show database type as PostgreSQL.

### 3.5 Env Vars Already Ready in Code

Both paths are already env-var driven in `backend/app/config.py`:
```python
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'itops.db'}")
CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", str(BASE_DIR / "chroma_db"))
```

Zero code changes needed. Just set the env vars and restart.

---

## SECTION 4 — KNOWN ISSUES AND FIXES

### 4.1 EC2 IP Changes on Restart
**Problem:** EC2 gets new public IP on every stop/start unless Elastic IP is attached.
**Status:** Fixed — Mumbai EC2 has Elastic IP via `cloud-shell-bootstrap.sh`.
**If it happens anyway:** Update `EC2_HOST` GitHub secret.

### 4.2 Nginx Duplicate Server Block Warning
```
conflicting server name "_" on 0.0.0.0:80, ignored
```
**Fix:**
```bash
sudo rm /etc/nginx/conf.d/default.conf
sudo systemctl reload nginx
```

### 4.3 Auto Pipeline Disabled After Deploy
**Symptom:** Logs show `Anomaly detected but automatic pipeline execution is disabled`
**Fix:** Settings UI → enable Auto Run Pipeline, or:
```bash
curl -X PUT http://localhost/api/settings/ \
  -H "Content-Type: application/json" \
  -d '{"auto_run_pipeline": true}'
```

### 4.4 Embedding 504 Gateway Timeout
**Cause:** Google embedding selected but no `GEMINI_API_KEY` set. Synchronous network calls hang indefinitely, exhaust worker pool, 504 all API endpoints.
**Status:** Fixed in commit `f49515d`. Now fails instantly to zero vectors.
**Prevention:** Always set `GEMINI_API_KEY` in `.env` when using Google embeddings.

### 4.5 Windows SSH PEM Permissions Error
```
WARNING: UNPROTECTED PRIVATE KEY FILE!
```
**Fix:** See Section 1 above.

### 4.6 ChromaDB Write Latency on S3 Files
**Warning:** S3 Files has ~60 second write-back latency. ChromaDB writes are async and don't block the pipeline, so this is acceptable. But if you need instant RAG retrieval of the most recent incident, there may be a brief delay.
**Mitigation:** ChromaDB in-memory cache serves reads instantly. Only persistence is delayed.

### 4.7 PostgreSQL Connection on t4g.small
Session is configured for `pool_size=5, max_overflow=5` per uvicorn worker. With 2 workers: max 20 real connections. RDS free tier supports up to 87 connections — well within limits.

### 4.8 frontend/.zip Committed to Git
A 448KB binary file was accidentally committed. Should be removed.
**Fix:**
```bash
git rm frontend/.zip
git commit -m "fix: remove binary zip from git"
git push origin main
```
Add to `.gitignore`:
```
frontend/*.zip
```

---

## SECTION 5 — ARCHITECTURE OVERVIEW

### Backend Stack
```
FastAPI + Uvicorn
  → SQLAlchemy ORM (SQLite now, PostgreSQL target)
  → LangGraph orchestrator → 5 agents
  → ChromaDB vector store (RAG institutional memory)
  → WebSocket real-time streaming
```

### Agent Pipeline
```
Anomaly detected
  → Monitoring Agent   (temp=0.1) — threshold + EWMA detection
  → Predictive Agent   (temp=0.1) — failure probability, time-to-failure
  → Diagnostic Agent   (temp=0.2) — root cause, causal chain, blast radius
  → [HITL approval if severity = high/critical]
  → Remediation Agent  (temp=0.0) — bash scripts + rollback
  → Reporting Agent    (temp=0.4) — incident summary, runbook to ChromaDB
```

### LLM Providers (switchable at runtime from Settings UI)
- `gemini` — Gemini 2.5 Flash (recommended on EC2)
- `openai` — GPT-4o-mini
- `ollama` — local inference (not recommended on t4g.small, too slow)

### Embedding Providers (for ChromaDB RAG)
- `google` — Gemini text-embedding-004 (recommended)
- `ollama` — nomic-embed-text (local fallback)

### Data Sources (pluggable)
- `SimulatorDataSource` — generates realistic fake metrics (default)
- `CloudWatchDataSource` — real AWS metrics with datasource UI/API lifecycle support
- `AzureMonitorDataSource` — real Azure metrics with datasource UI/API lifecycle support
- `GCPMonitoringDataSource` — real GCP metrics with datasource UI/API lifecycle support

---

## SECTION 6 — THE KILLER DEMO MOVE

Connect CloudWatch adapter to the actual EC2 instance running the app. The app monitors itself.

**What happens during demo:**
1. Run a heavy pipeline → CPU spikes on real EC2
2. App detects the spike from its own CloudWatch metrics
3. App diagnoses it, generates remediation
4. Show EC2 console side by side — metrics match

**Setup needed:**
1. Install CloudWatch agent on EC2
2. Set `CLOUDWATCH_ACCESS_KEY_ID`, `CLOUDWATCH_SECRET_ACCESS_KEY`, `CLOUDWATCH_INSTANCE_IDS` in `.env`
3. Switch data source from Simulator to CloudWatch in Settings UI

This kills all "fake simulator data" criticism permanently.

---

## SECTION 7 — USEFUL COMMANDS

### Local Development
```bash
# Backend
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

### On EC2
```bash
# Service management
sudo systemctl status itops-backend
sudo systemctl restart itops-backend
sudo journalctl -u itops-backend -n 100 --no-pager

# Check what's running
sudo ss -tulpn
ps aux | grep -E "uvicorn|nginx" | grep -v grep

# Test health
curl http://localhost:8000/health
curl http://localhost/api/infrastructure/dashboard

# Nginx
sudo nginx -T
sudo systemctl reload nginx
```

### Git
```bash
# Check remote
git remote -v

# Check what's ahead/behind
git log --oneline origin/main..HEAD    # your commits not in remote
git log --oneline HEAD..origin/main    # remote commits you don't have

# Safe pull
git pull origin main

# Nuclear reset to remote
git reset --hard origin/main
```

### API Testing
```bash
# Health
curl http://<IP>/health

# Get incidents
curl http://<IP>/api/incidents/

# Enable auto pipeline
curl -X PUT http://<IP>/api/settings/ \
  -H "Content-Type: application/json" \
  -d '{"auto_run_pipeline": true}'

# Trigger pipeline manually
curl -X POST http://<IP>/api/agents/pipeline/run-all
```

---

## SECTION 8 — SAMPLE .ENV FOR PRODUCTION

```bash
# LLM
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash

# Embeddings
EMBEDDING_PROVIDER=google
GEMINI_EMBEDDING_MODEL=models/text-embedding-004

# Database — SQLite (current) or PostgreSQL (target)
# DATABASE_URL=sqlite:///./itops.db
DATABASE_URL=postgresql://itops:PASSWORD@RDS_ENDPOINT:5432/itops

# ChromaDB — local (current) or S3 Files (target)
# CHROMA_PERSIST_DIR=/opt/itops/backend/chroma_db
CHROMA_PERSIST_DIR=/mnt/s3/itops/chroma_db

# Per-agent temperatures
MONITORING_TEMPERATURE=0.1
PREDICTIVE_TEMPERATURE=0.1
DIAGNOSTIC_TEMPERATURE=0.2
REMEDIATION_TEMPERATURE=0.0
REPORTING_TEMPERATURE=0.4

# Simulator
SIMULATOR_INTERVAL_SECONDS=10
NUM_SIMULATED_SERVERS=6
ANOMALY_PROBABILITY=0.15

# Pipeline
PIPELINE_MAX_CONCURRENT=4
AUTO_RUN_PIPELINE=true

# CORS
CORS_ALLOW_ORIGINS=http://YOUR_EC2_PUBLIC_IP
```

---

## SECTION 9 — THINGS TO LEARN

### To understand this project:
1. **LangGraph** — agent pipeline as state machine
2. **FastAPI** — async Python, lifespan events, background tasks
3. **SQLAlchemy** — ORM, sessions, migrations
4. **ChromaDB** — vector store, cosine similarity, HNSW
5. **WebSockets** — real-time streaming
6. **systemd** — Linux service management
7. **nginx** — reverse proxy, location blocks

### For infrastructure:
1. **AWS RDS** — managed PostgreSQL, free tier
2. **AWS S3 Files** — NFS mount for S3 (April 2026)
3. **AWS CloudWatch** — metrics, agent installation
4. **Elastic IP** — fixed public IP for EC2

### Research papers:
- "When AIOps Become AI Oops" — RSA Conference 2025 — LLM remediation security risks
- "AIOps for Reliability: Evaluating LLMs" — ICCS 2025
- "Temperature and Persona Shape LLM Agent Consensus" — arxiv 2025

---

## SECTION 10 — IMMEDIATE NEXT STEPS

**Priority 1 — Infrastructure (with mentor):**
1. Set up RDS PostgreSQL on Mumbai region
2. Run SQLite → PostgreSQL migration script
3. Mount S3 bucket using S3 Files for ChromaDB
4. Update `.env` on EC2 with new `DATABASE_URL` and `CHROMA_PERSIST_DIR`
5. Update GitHub secret `EC2_HOST` with Mumbai Elastic IP

**Priority 2 — Clean up:**
1. Remove `frontend/.zip` from git
2. Fix nginx duplicate server block
3. Verify `auto_run_pipeline` is enabled after Mumbai cutover

**Priority 3 — Demo quality:**
1. Connect CloudWatch adapter to own EC2 (self-monitoring demo)
2. Verify all 5 pages load on Mumbai instance
3. Run end-to-end pipeline test before hackathon
