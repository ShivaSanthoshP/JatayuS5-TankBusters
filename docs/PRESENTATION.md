# Dynamic IT Operations Orchestrator — Presentation Content

Ready-to-paste deck content for Canva. Story-driven, technical, business-proposal tone.
**Slides: 14** (within the 10–15 limit; Slides 12 + 13 can merge if fewer are needed).

> **Placeholders to fill in:** `[COLLEGE NAME]`, `[MENTOR NAME, Title]`, and the three member **roles**
> (suggested: Backend & AI · Frontend & UX · Cloud & DevOps — adjust to reality).

---

## Build guide (set once in Canva)

- **Deck size:** 16:9.
- **Palette (matches the live app):** Cream `#FBF8F1` background · Deep teal `#244745` headings · Sage `#3D7D65` · Sand/gold `#C08A3E` accent · Ink `#15191A` body. Use teal as the single consistent accent.
- **Fonts:** Headings — *Fraunces* or *Playfair Display*; Body — *Inter* or *Work Sans*.
- **Jatayu logo:** full size on the **cover (Slide 1)**, top-left; a **small version bottom-right on every slide**.
- **Reuse the diagrams:** screenshot the four rendered Mermaid diagrams from the GitHub README and drop them onto Slides 7 (agents), 8 (learning loop), 9 (architecture), 11 (CI/CD). They already use this palette.
- **Footer on every slide:** `Team Tank Busters · Dynamic IT Operations Orchestrator · dynamic-it-ops.tankbusters.duckdns.org`

---

## Slide 1 — Cover

**Use Case (title, large):** Dynamic IT Operations Orchestrator
**Subtitle:** Autonomous Multi-Agent AIOps Platform for Self-Healing Enterprise
**Tagline (italic):** *From 3 AM panic to 3 AM peace — infrastructure that watches, fixes, and remembers itself.*

**Team Tank Busters**
- P. Shiva Santhosh — *[Team Lead · Backend & AI Agents]*
- N. S. J. S. Dhanush — *[Frontend & Conversational UX]*
- P. Shikhar — *[Cloud Infrastructure & DevOps]*

`[COLLEGE NAME]`  |  Mentor: `[MENTOR NAME, Title]`

**Badge strip:** 🟢 Live on AWS · Connected to real CloudWatch · CI/CD on every push
**Live demo:** https://dynamic-it-ops.tankbusters.duckdns.org

**Visual:** Jatayu logo top-left; a faint live-dashboard screenshot as a background watermark.
**Talk track:** "We didn't build a prototype on fake data — what you'll see is live on AWS right now, watching a real cloud server."

---

## Slide 2 — The POC, at a Glance *(the mandated "detailed description")*

**Headline:** What we built — and it's already running in production

Dynamic IT Operations Orchestrator is a fully deployed AIOps platform where **five specialized AI agents and a conversational copilot collaborate to keep cloud infrastructure healthy — autonomously.** They continuously monitor a fleet, **predict failures before they land**, diagnose root cause, generate safe and reviewable fixes, and record every resolution as reusable knowledge.

- **Live & real:** connected to **real AWS CloudWatch** in Mumbai (`ap-south-1`), monitoring the very EC2 host it runs on.
- **Multi-agent core:** Monitor → Predict → Diagnose → Remediate → Report, orchestrated by a **LangGraph** state machine.
- **Argus, the copilot:** operate the entire platform by **typing or speaking**, in plain English.
- **Institutional memory:** every resolved incident becomes a runbook the system reuses — it gets smarter over time.
- **Production-grade:** HTTPS, CI/CD on every push, self-healing health checks, ~**$15/month** all-in.

**Visual:** five agent icons in a row + a chat bubble (Argus) + a memory/database icon.
**Talk track:** "Think of it as a tireless night-shift SRE team — five experts who never sleep, plus an assistant anyone can talk to."

---

## Slide 3 — The Problem

**Headline:** When something breaks at 3 AM, monitoring tools *alert* — they don't *act*

Enterprises run thousands of services across AWS, GCP, Azure, and on-prem. The tooling that watches them was built to raise alarms, not resolve them.

- **Alert fatigue** — a dozen siloed monitors fire at once; the real signal drowns.
- **Manual archaeology** — scroll dashboards, grep logs, hunt Slack, open a stale runbook.
- **No memory** — a 5-minute fix from last quarter takes 45 minutes tonight; knowledge leaves with people.
- **Blast radius grows** — every minute of delay becomes SLA breaches, lost revenue, burnt-out teams.

**Pull-quote (large):** *"MTTR is a human problem dressed up as a metric."*

**Visual:** a pager going off at 3:00 AM; red alert cards piling up.
**Talk track:** "Everyone in ops knows this pain. The cost isn't just downtime — it's the weekend that disappears."

---

## Slide 4 — Why Agentic AI *(answers the brief head-on)*

**Headline:** One AI model can't do this. A *team* of agents can.

Detecting an anomaly, forecasting a failure, reasoning about root cause, and producing a *safe* fix are fundamentally different skills. A single prompt does all of them badly.

- **Specialization** — each agent owns one cognitive task and does it well.
- **Agent-to-agent (A2A) coordination** — agents hand off shared context through a LangGraph orchestration graph.
- **Autonomy with guardrails** — they act on their own, but risky actions pause for human review.

**Pull-quote:** *"Not a bigger model — a better-organized team."*

**Visual:** one overloaded robot vs. five focused specialists passing a baton.
**Talk track:** "This is exactly why the brief calls for *agentic* AI — and why our architecture is five collaborating agents, not one mega-prompt."

---

## Slide 5 — The Solution: A Self-Healing Loop

**Headline:** Detection → Resolution → Memory, closed automatically

- **Observe** the fleet continuously across CPU, memory, disk, network, latency, errors, and logs.
- **Predict** failure probability and time-to-failure before impact.
- **Diagnose** root cause and blast radius — using memory of past incidents.
- **Remediate** with production-grade, reversible fix playbooks (validation + rollback).
- **Report & Remember** — auto-write a runbook so the next time is faster.

**Pull-quote:** *"Every incident it resolves makes it smarter. The 3 AM page becomes a 3 AM non-event."*

**Visual:** a circular loop (Observe → Predict → Diagnose → Remediate → Remember → back to Observe).
**Talk track:** "The magic isn't any single step — it's that the loop closes itself and compounds."

---

## Slide 6 — Meet Argus, the Conversational Copilot *(differentiator)*

**Headline:** Stop reading dashboards. Start asking Argus.

Argus is the platform's SRE copilot — named after the hundred-eyed watchman of myth. **Type it or speak it.**

- **Anyone can drive it** — *"Which nodes are critical?"*, *"Why is prod-api-2 unhealthy?"*, *"Run the pipeline on every degraded node."* No CLI, no dashboard hunting.
- **It acts, not just answers** — backed by **24 real tools** across the whole platform.
- **Safe by design** — every state-changing action shows a **confirmation card** first; every action is **audited**.
- **Voice that speaks ops** — push-to-talk, tuned for cloud/SRE jargon and Indian-English.

**Pull-quote:** *"An incident commander or a first-week hire can run the fleet with equal confidence."*

**Visual:** a chat-window screenshot + a microphone / voice-wave icon.
**Talk track:** "This is what makes a deeply technical platform usable by the whole team — you just talk to it."

---

## Slide 7 — The Five Autonomous Agents

**Headline:** Five experts, one fault-tolerant pipeline

| Agent | What it does | How it thinks |
|---|---|---|
| ① Monitoring | Real-time anomaly detection + log correlation | Thresholds · pattern matching |
| ② Predictive | Failure probability · time-to-failure · cascade risk | Trend / EWMA · LLM reasoning |
| ③ Diagnostic | Root cause · causal chain · blast radius | Known-issue profiles · **RAG** |
| ④ Remediation | Runnable fix scripts with validation + rollback | Templates · **RAG** · LLM |
| ⑤ Reporting | Summary, SLA impact, auto-written runbook | Summarization → memory |

**Callout:** **Fast path first** — common failures resolve instantly via pre-approved profiles (no LLM cost); the **LLM (with RAG context) is called only for novel cases.** If the LLM is down, it degrades safely — the loop never breaks.

**Visual:** the **agents Mermaid diagram** screenshot.
**Talk track:** "Cheap and instant for the 80% it has seen before; smart and careful for the 20% it hasn't."

---

## Slide 8 — Institutional Memory: The Platform That Never Forgets

**Headline:** It learns from every incident — and keeps the lesson forever

- Every resolved incident is embedded into a **ChromaDB** vector store (RAG) and reused on the next similar symptom.
- **Canonical runbooks ship seeded** — useful on day one, before it sees its first incident.
- **Bring your own knowledge** — encountered a failure we don't cover? Author a runbook, or ask Argus to draft it for you.

**Pull-quote:** *"Knowledge stops walking out the door when people leave. It accumulates."*

**Visual:** the **learning-loop diagram** screenshot (Detected → … → Runbook → reused).
**Talk track:** "This is the difference between a tool and a teammate — it remembers."

---

## Slide 9 — How It All Fits Together (Architecture)

**Headline:** A clean, pluggable architecture

- **Client:** React 19 glassmorphism UI + Argus (chat + voice)
- **App server:** FastAPI + the LangGraph pipeline + Argus tool loop (audited)
- **Backends:** PostgreSQL 16 · ChromaDB (RAG) · multi-provider LLM bridge
- **Pluggable data sources:** AWS CloudWatch (live) · Azure · GCP · Prometheus · Docker · Simulator · Custom push

**Callout:** **Pluggable by design** — new cloud? Implement one interface. New model? Swap at runtime (Gemini · OpenAI · Ollama). The agents never change.

**Visual:** the **"How It All Fits Together" diagram** screenshot.
**Talk track:** "Everything behind one interface — that's why we can be multi-cloud without touching the agents."

---

## Slide 10 — This Is Real: Live on AWS CloudWatch *(the wow slide)*

**Headline:** It watches the very infrastructure it lives on

- Connected to **real AWS CloudWatch**, region **Mumbai (`ap-south-1`)** — status: **connected**.
- Monitoring a **production EC2 host — the same box it's deployed on** (true self-monitoring).
- Reads live CPU, network, and status-check metrics; tails real log groups (`/itops/ec2/syslog`, `/itops/ec2/auth`).
- **Multi-cloud ready** — Azure, GCP, Prometheus, Docker are one credential away.

**Pull-quote:** *"Not a mock dataset — genuine cloud telemetry, today."*

**Visual:** screenshot of the Data Sources page showing "AWS CloudWatch — connected"; a small AWS logo.
**Talk track:** "If our own server started to drift right now, the platform would diagnose it and draft the fix — on stage."

---

## Slide 11 — Built for Production (Engineering Maturity)

**Headline:** Cost-engineered, secure, and shipping continuously

**Infrastructure & Cost**
- One **Graviton (ARM) EC2** runs the whole stack — ~**$15/month** all-in.
- **S3-backed memory** — institutional knowledge survives instance replacement.
- Deliberately **no RDS / ALB / NAT** — right-sized on purpose, not by limitation.

**Reliability & Security**
- **CI/CD on every push** — build gate + `/health` gate; **zero-downtime, zero-data-loss** deploys.
- **IMDSv2, least-privilege IAM, encrypted EBS, TLS 1.2/1.3.**
- Component-level health probe; graceful degradation everywhere.

**Visual:** the **CI/CD diagram** screenshot + small icons (AWS, GitHub Actions, lock).
**Talk track:** "We treated a hackathon project like a real product — secure, observable, and cheap to run."

---

## Slide 12 — Mapped to the Brief

**Headline:** We answered every requirement — and went further

| Requirement | How we deliver |
|---|---|
| **Why Agentic AI** | 5 specialized agents, **A2A** hand-off via LangGraph |
| **Workflow** | Monitor → Predict → **Diagnose** → Remediate → Report (added root-cause stage) |
| **Data sources** | CloudWatch logs/metrics, telemetry, incident history, **CMDB-style** node inventory |
| **Tech stack** | Multi-agent orchestration · **adaptive RAG decision policy** · multi-cloud · **event-driven** |
| **Enterprise impact** | ↓ MTTR · ↓ downtime · optimized resource usage · **SLA adherence** |

**Visual:** two-column checklist with green ticks.
**Talk track:** "Every line of the problem statement maps to something we actually built and deployed."

---

## Slide 13 — Enterprise Impact & Business Value

**Headline:** What it means for the business

- **MTTR:** minutes instead of hours — fixes drafted the moment an anomaly appears.
- **Downtime:** cut sharply via prediction + instant, reviewable remediation.
- **Operator toil:** auto-triage + conversational control collapse the bulk of L1 on-call work.
- **SLA adherence:** proactive resolution heads off breaches before they happen.
- **Resource usage:** catches leaks and runaway processes early — reclaims wasted capacity.
- **Knowledge retention:** nothing is relearned; nothing leaves with attrition.

**Pull-quote:** *"The real deliverable isn't a dashboard — it's peace of mind."*

**Visual:** six clean metric tiles, teal accents.
**Talk track:** "Downtime is expensive and on-call burnout is real — this attacks both at once."

---

## Slide 14 — Live Demo, Roadmap & Thank You

**Headline:** See it live — then imagine where it goes

**Try it now:** https://dynamic-it-ops.tankbusters.duckdns.org
*Ask Argus: "Which nodes are critical right now?" → watch it diagnose and draft a fix.*

**Roadmap:**
- One-click **execution integrations** (SSH · Ansible · Terraform · cloud APIs) at the existing executor seam.
- Deeper **multi-cloud** rollout (Azure + GCP live accounts) and Slack / Teams / PagerDuty hooks.
- Team learning across deployments — a shared, opt-in runbook marketplace.

**Close:** **Team Tank Busters** — P. Shiva Santhosh · N. S. J. S. Dhanush · P. Shikhar
`[COLLEGE NAME]` · Mentor: `[MENTOR NAME]`
*Thank you.*

**Visual:** QR code to the live URL (Canva has a QR generator) + Jatayu logo.
**Talk track:** "Don't take our word for it — scan and try it during Q&A."
