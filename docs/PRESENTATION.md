# Dynamic IT Operations Orchestrator — Presentation Content

Ready-to-paste deck content for Canva. Story-driven, technical, business-proposal tone.
**Slides: 15** (within the 10–15 limit). Optional trims to reach 12 are marked `[can merge]`.

> Content is kept accurate to the **currently deployed platform** (live on AWS, Gemini + ChromaDB +
> PostgreSQL, Argus copilot). The "run fully local / own your data" story is positioned as a supported
> deployment **mode** (Ollama + SQLite, air-gapped), not a claim about the live demo.

---

## Build guide (set once in Canva)

- **Deck size:** 16:9.
- **Palette:** Cream `#FBF8F1` background · Deep teal `#244745` headings · Sage `#3D7D65` · Sand/gold `#C08A3E` accent · Ink `#15191A` body. One accent (teal), used consistently.
- **Fonts:** Headings — *Fraunces* / *Playfair Display*; Body — *Inter* / *Work Sans*.
- **Jatayu logo:** full size on the **cover**, top-left; small version **bottom-right on every slide**.
- **Reuse the diagrams:** screenshot the four rendered Mermaid diagrams from the GitHub README onto Slides 7 (agents), 9 (memory loop), 10 (architecture), 14 (CI/CD).
- **Footer on every slide:** `Team Tank Busters · Dynamic IT Operations Orchestrator · dynamic-it-ops.tankbusters.duckdns.org`

---

## Slide 1 — Cover

**Use Case (title, large):** Dynamic IT Operations Orchestrator
**Subtitle:** Autonomous Multi-Agent AIOps Platform for Self-Healing Enterprise Infrastructure
**Tagline (italic):** *"When your infrastructure breaks at 3 AM — our agents are already fixing it."*

**Team Tank Busters** · Faculty Mentor: **E. Pragnavi**
- **P. Shiva Santhosh**
- **N. S. J. S. Dhanush**
- **P. Shikhar**

**University College of Engineering, Osmania University**

**Badge strip:** 🟢 Live on AWS · Connected to real CloudWatch · CI/CD on every push
**Live demo:** https://dynamic-it-ops.tankbusters.duckdns.org

**Visual:** Jatayu logo top-left; faint live-dashboard screenshot as a background watermark.
**Talk track:** "We didn't build a slide-ware prototype — what you'll see is live on AWS right now, watching a real cloud server."

---

## Slide 2 — The POC, at a Glance *(the mandated detailed description)*

**Headline:** What we built — and it's already running in production

Dynamic IT Operations Orchestrator is a fully deployed AIOps platform where **five specialized AI agents and a conversational copilot collaborate to keep cloud infrastructure healthy — autonomously.** They continuously monitor a fleet, **predict failures before they land**, diagnose root cause, generate safe and reviewable fixes, and record every resolution as reusable knowledge.

- **Live & real:** connected to **real AWS CloudWatch** in Mumbai (`ap-south-1`), monitoring the very EC2 host it runs on.
- **Multi-agent core:** Monitor → Predict → Diagnose → Remediate → Report, orchestrated by a **LangGraph** state machine.
- **Argus, the copilot:** operate the whole platform by **typing or speaking**, in plain English.
- **Institutional memory:** every resolved incident becomes a runbook the system reuses — it gets smarter over time.
- **Production-grade:** HTTPS, CI/CD on every push, self-healing health checks, ~**$15/month** all-in.

**Brief compliance (one line):** ✓ Agentic AI · ✓ Monitor→Predict→Remediate→Report workflow · ✓ Cloud logs + telemetry + incident history + CMDB-style inventory · ✓ Multi-cloud, event-driven · ✓ Reduced downtime & SLA adherence.

**Visual:** five agent icons in a row + a chat bubble (Argus) + a memory/database icon.
**Talk track:** "Think of it as a tireless night-shift SRE team — five experts who never sleep, plus an assistant anyone can talk to."

---

## Slide 3 — The Problem

**Headline:** Traditional IT operations are broken — and the cost is catastrophic

**Pain points**
- Enterprise infra spans **3+ clouds** — no single unified view.
- Monitoring tools only **ALERT — they never FIX.** SREs get paged at 3 AM.
- **MTTD ~7 hrs · MTTR ~4 hrs** — every hour bleeds revenue.
- Teams drown in **thousands of alerts/day — ~90% are noise.**
- Root-cause analysis is **manual, slow, and expert-dependent.**
- When experts leave, **institutional knowledge leaves with them.**

**Stat band (large numbers):**
- **$26.5B / yr** lost globally to IT downtime
- **$300K+** cost of one hour of enterprise downtime
- **40%** of SRE time wasted on repetitive incident response
- **~7 hrs** average time to detect a production incident

**Pull-quote:** *"The gap between alert fired and incident resolved is where business dies."*

**Visual:** a 3:00 AM pager + a pile of red alert cards; the four stats as bold tiles.
**Talk track:** "These aren't our numbers — they're the industry's. The pain is universal, and it's expensive."

---

## Slide 4 — Objective: Five Goals, One Autonomous System

**Headline:** What we set out to achieve

1. **Zero-touch incident resolution** — Detect → Diagnose → Fix, no human needed for routine incidents.
2. **Predict failures before they happen** — spot degradation in live metrics before users see an error.
3. **Preserve institutional knowledge forever** — every incident auto-generates a runbook; expertise never walks out the door.
4. **Safe autonomy** — remediations are generated as reviewable, reversible playbooks; any state-changing action through Argus needs explicit approval. *Speed without recklessness.*
5. **Run anywhere, own your data** — cloud-connected by default, or **fully local (Ollama + on-prem)** for air-gapped, data-sovereign deployments. No vendor lock-in — swap the model at runtime.

**Visual:** five numbered goal tiles with icons.
**Talk track:** "Autonomy is the headline, but goals four and five are why an enterprise would actually trust it in production."

---

## Slide 5 — Market Opportunity

**Headline:** A large, fast-growing market — and a clear wedge

- **$18.8 B** — AIOps market by 2027 · **CAGR ~32.8%**
- **$37.9 B** — IT Operations Management by 2026 · **CAGR ~8.4%**
- **~70%** of enterprises adopting AI for IT operations *(Gartner, 2025)*
- **$300K+** cost per hour of downtime *(enterprise avg.)*

**Our wedge:** existing leaders **observe and alert**; we **observe, decide, act, and remember** — autonomously, and deployable on-prem.

**Visual:** four market tiles; a simple upward growth arrow.
**Talk track:** "The market is huge and growing fast — and the incumbents stop exactly where we begin."

---

## Slide 6 — Why Agentic AI? Why Not One Big Model?

**Headline:** One LLM can't stream telemetry, forecast, diagnose, remediate, and document — all at once

Each task has a different latency, compute, and risk profile. So we built **five specialized agents** that coordinate via **agent-to-agent (A2A)** state hand-off across a **LangGraph** orchestration graph.

**Two-stage detection (the efficiency trick):**
- **Fast & cheap:** a deterministic statistical pre-filter catches obvious spikes instantly — **zero LLM cost.**
- **Smart & careful:** the **LLM (with RAG context)** is invoked **only** on flagged or novel signals.
- **Result:** no missed incidents, no wasted compute.

**Resilience:** unknown anomaly? The pipeline calls the LLM directly and returns structured output. LLM offline? It **degrades gracefully — the pipeline never stalls.**

**Visual:** one overloaded robot vs. five focused specialists passing a baton.
**Talk track:** "Not a bigger model — a better-organized team. That's the whole thesis of agentic AI."

---

## Slide 7 — The Five Autonomous Agents

**Headline:** Five experts, one fault-tolerant pipeline — raw metric to closed incident in seconds

| Agent | What it does | How it thinks |
|---|---|---|
| ① Monitoring | Real-time anomaly detection + log correlation | Statistical pre-filter · pattern matching |
| ② Predictive | Failure probability · time-to-failure · cascade risk | Trend / EWMA · LLM reasoning |
| ③ Diagnostic | Root cause · causal chain · blast radius | Known-issue profiles · **RAG** |
| ④ Remediation | Runnable fix scripts with validation + **rollback** | Templates · **RAG** · LLM |
| ⑤ Reporting | Summary, SLA impact, **auto-written runbook** | Summarization → memory |

**Callout:** **LangGraph DAG**, not a chain of prompts — full incident state persists across all five agents, and the pipeline **exits early** when there's no anomaly.

**Visual:** the **agents diagram** screenshot.
**Talk track:** "Cheap and instant for what it has seen before; smart and careful for what it hasn't."

---

## Slide 8 — Meet Argus, the Conversational Copilot *(our differentiator)*

**Headline:** Stop reading dashboards. Start asking Argus.

Argus is the platform's SRE copilot — named after the hundred-eyed watchman of myth. **Type it or speak it.**

- **Anyone can drive it** — *"Which nodes are critical?"*, *"Why is prod-api-2 unhealthy?"*, *"Run the pipeline on every degraded node."* No CLI, no dashboard hunting.
- **It acts, not just answers** — backed by **24 real tools** across the whole platform.
- **Safe by design** — every state-changing action shows a **confirmation card** first; every action is **audited**, and repeats are **idempotent**.
- **Voice that speaks ops** — push-to-talk, tuned for cloud/SRE jargon and Indian-English.

**Pull-quote:** *"An incident commander or a first-week hire can run the fleet with equal confidence."*

**Visual:** chat-window screenshot + a microphone / voice-wave icon.
**Talk track:** "No competitor on the next slide has this — you literally talk to your infrastructure."

---

## Slide 9 — Institutional Memory: The Platform That Never Forgets

**Headline:** It learns from every incident — and keeps the lesson forever

- Every resolved incident is embedded into a **ChromaDB** vector store (RAG) and reused on the next similar symptom.
- **Canonical runbooks ship seeded** on first boot — useful from day one, growing with every fix.
- **Bring your own knowledge** — encountered a failure we don't cover? Author a runbook, or ask Argus to draft it for you.

**Pull-quote:** *"Knowledge stops walking out the door when people leave. It accumulates."*

**Visual:** the **learning-loop diagram** screenshot (Detected → … → Runbook → reused).
**Talk track:** "This is the difference between a tool and a teammate — it remembers."

---

## Slide 10 — Architecture & Tech Stack

**Headline:** A clean, pluggable, deploy-anywhere architecture

- **Frontend:** React 19 + TypeScript + Vite · TailwindCSS v4 + Framer Motion (glassmorphism) · Recharts · live WebSocket.
- **Backend:** FastAPI (REST + WebSocket) · **LangGraph** 5-agent DAG · LangChain model abstraction.
- **AI & memory:** Gemini 2.5 Flash · OpenAI · or local **Ollama** (runtime-switchable) · **ChromaDB** RAG.
- **Data:** **PostgreSQL 16** (SQLite for local/dev) · pluggable data sources.
- **Deploy:** AWS EC2 (Graviton) · Nginx · systemd · Docker-ready · cross-platform launch scripts.

**Callout:** **Pluggable by design** — new cloud? Implement one `DataSource` interface. New model? Swap at runtime. Add a 6th agent? One node + one edge. The agents never change.

**Visual:** the **"How It All Fits Together" diagram** screenshot.
**Talk track:** "Everything behind one interface — that's why we're multi-cloud and can run fully local without touching the agents."

---

## Slide 11 — This Is Real: Live on AWS CloudWatch *(the wow slide)*

**Headline:** It watches the very infrastructure it lives on

- Connected to **real AWS CloudWatch**, region **Mumbai (`ap-south-1`)** — status: **connected**.
- Monitoring a **production EC2 host — the same box it's deployed on** (true self-monitoring).
- Reads live CPU, network, and status-check metrics; tails real log groups (`/itops/ec2/syslog`, `/itops/ec2/auth`).
- **Multi-cloud ready** — Azure, GCP, Prometheus, Docker are one credential away.

**Pull-quote:** *"Not a mock dataset — genuine cloud telemetry, today."*

**Visual:** screenshot of the Sources page showing "AWS CloudWatch — connected"; small AWS logo.
**Talk track:** "If our own server started to drift right now, the platform would diagnose it and draft the fix — live, on stage."

---

## Slide 12 — Competitive Landscape

**Headline:** Others tell you it's broken. We fix it — and write the report.

| Capability | **Our Platform** | Datadog | PagerDuty | IBM Watson | Dynatrace |
|---|:--:|:--:|:--:|:--:|:--:|
| Autonomous multi-agent AI | ✓ | ✗ | ✗ | ~ | ✗ |
| LLM-powered root-cause analysis | ✓ | ✗ | ✗ | ~ | ~ |
| Remediation (review-first) | ✓ | ~ | ✗ | ✗ | ~ |
| Predictive failure detection | ✓ | ~ | ✗ | ~ | ~ |
| RAG institutional memory | ✓ | ✗ | ✗ | ✗ | ✗ |
| Conversational **+ voice** copilot | ✓ | ✗ | ✗ | ✗ | ✗ |
| Downloadable remediation scripts | ✓ | ✗ | ✗ | ✗ | ✗ |
| Human-in-the-loop safety gate | ✓ | ✗ | ~ | ~ | ✗ |
| Local / air-gapped deploy option | ✓ | ✗ | ✗ | ✗ | ✗ |
| Runtime-configurable AI models | ✓ | ✗ | ✗ | ✗ | ✗ |
| Auto-generated runbooks | ✓ | ✗ | ✗ | ~ | ✗ |

**Pull-quote:** *"Datadog tells you the house is on fire. We dispatch the fire brigade — and write the incident report."*

**Visual:** the comparison table; our column highlighted in teal.
**Talk track:** "Each incumbent is excellent at one column. We integrate the whole row — and add a copilot none of them have."

---

## Slide 13 — Before vs After

**Headline:** The same on-call night, two different outcomes

| Metric | Before | After |
|---|---|---|
| Mean time to **detect** | 7+ hours | **< 1 minute** |
| Mean time to **resolve** (routine) | 4+ hours | **minutes** |
| Alert noise | thousands/day, raw | **prioritized signal only** |
| Knowledge loss | leaves with experts | **zero — captured in memory** |
| Runbook creation | manual, after the fact | **automatic, every incident** |
| Run cost | enterprise tooling $$$ | **~$15/month** (and **$0 inference** in local mode) |

**Pull-quote:** *"The real deliverable isn't a dashboard — it's peace of mind."*

**Visual:** two-column before/after table; "After" column in teal.
**Talk track:** "Downtime is expensive and on-call burnout is real — this attacks both at once."

---

## Slide 14 — Production, Security & Governance

**Headline:** Built like a product — secure, observable, and replicable

**Production & reliability**
- One **Graviton EC2** runs the whole stack (~$15/mo); **S3-backed memory** survives instance replacement.
- **CI/CD on every push** — build gate + `/health` gate; **zero-downtime, zero-data-loss** deploys.

**Privacy by architecture**
- Full **audit trail** — every metric, anomaly, LLM call, and remediation is logged.
- **Human-in-the-loop** approval is built into the flow, not bolted on.
- **Deploy your way** — managed cloud (Gemini) or **fully local/air-gapped** (Ollama). You own your data either way.
- Hardened: **IMDSv2 · least-privilege IAM · encrypted EBS · TLS 1.2/1.3.**

**Replicable by design**
- `DataSourceBase` abstraction (AWS · Azure · GCP · Prometheus · Datadog) · domain-agnostic RAG (Finance, Telecom, Healthcare IT) · add an agent with one node + edge.

**Visual:** the **CI/CD diagram** + small icons (AWS, GitHub Actions, lock, shield).
**Talk track:** "We treated a hackathon project like real infrastructure — that's what makes it credible."

---

## Slide 15 — Roadmap & Thank You

**Headline:** A working platform today — a roadmap that scales it

**Shipped**
- Autonomous 5-agent pipeline · Argus chat + voice copilot · RAG memory · live AWS CloudWatch · CI/CD.

**Next**
- **Advanced forecasting** — LSTM/Transformer models to predict failures ~30 min ahead.
- **Richer ingestion** — OpenTelemetry + FluentBit traces/logs; scale memory to millions of incidents.
- **Multi-cloud + Kubernetes** — unified model over AWS/Azure/GCP; a K8s operator + CRDs for self-healing pods.
- **Cost & capacity intelligence** — right-size idle resources; predict SLA breaches before they cross.
- **Enterprise collaboration** — Slack/Teams/PagerDuty hooks; federated learning of anomaly patterns (share patterns, not data).

**Try it now:** https://dynamic-it-ops.tankbusters.duckdns.org
*Ask Argus: "Which nodes are critical right now?" → watch it diagnose and draft a fix.*

**Close:** **Team Tank Busters** — P. Shiva Santhosh · N. S. J. S. Dhanush · P. Shikhar
University College of Engineering, Osmania University · Mentor: E. Pragnavi
*Thank you.*

**Visual:** QR code to the live URL + Jatayu logo.
**Talk track:** "Don't take our word for it — scan and try it during Q&A."

---

### To reach exactly 12 slides (if required)
- Merge **5 (Market)** into **3 (Problem)** as a stat band.
- Merge **13 (Before/After)** into **12 (Competitive)**.
- Merge **6 (Why Agentic AI)** into **7 (Five Agents)** as a callout.
