"""
Render every architecture diagram for the Dynamic IT Operations Orchestrator
as a high-DPI PNG into /home/shiva/itops/architecture/.

Run:
    /home/shiva/itops/backend/venv/bin/python /home/shiva/itops/architecture/_render_diagrams.py
"""
from __future__ import annotations
import math
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import (
    FancyBboxPatch, FancyArrowPatch, Rectangle, Polygon, Circle,
)
from matplotlib.lines import Line2D
from matplotlib.path import Path as MplPath
from matplotlib.patches import PathPatch

OUT_DIR = Path(__file__).parent
DPI = 200

# Palette — calm, professional, print-friendly
C_BG          = "#0F172A"   # slate-900
C_PANEL       = "#1E293B"   # slate-800
C_PANEL_LITE  = "#334155"   # slate-700
C_INK         = "#F8FAFC"   # slate-50
C_MUTED       = "#94A3B8"   # slate-400
C_LINE        = "#475569"   # slate-600

C_BLUE    = "#3B82F6"
C_INDIGO  = "#6366F1"
C_VIOLET  = "#8B5CF6"
C_PINK    = "#EC4899"
C_RED     = "#EF4444"
C_AMBER   = "#F59E0B"
C_EMERALD = "#10B981"
C_TEAL    = "#14B8A6"
C_CYAN    = "#06B6D4"
C_LIME    = "#84CC16"
C_ORANGE  = "#FB923C"


def _setup(figsize=(14, 9), title=""):
    fig, ax = plt.subplots(figsize=figsize, dpi=DPI, facecolor=C_BG)
    ax.set_facecolor(C_BG)
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.axis("off")
    if title:
        ax.text(
            50, 97, title, ha="center", va="center",
            fontsize=18, fontweight="bold", color=C_INK,
        )
    return fig, ax


def _box(ax, x, y, w, h, *, fill=C_PANEL, edge=C_LINE, lw=1.5, radius=1.2):
    p = FancyBboxPatch(
        (x, y), w, h,
        boxstyle=f"round,pad=0.05,rounding_size={radius}",
        linewidth=lw, edgecolor=edge, facecolor=fill, zorder=2,
    )
    ax.add_patch(p)
    return p


def _label(ax, x, y, text, *, size=10, color=C_INK, weight="normal", ha="center", va="center"):
    ax.text(x, y, text, fontsize=size, color=color, ha=ha, va=va, weight=weight, zorder=3)


def _arrow(ax, x1, y1, x2, y2, *, color=C_MUTED, lw=1.6, style="-|>", curve=0.0, label=None):
    arr = FancyArrowPatch(
        (x1, y1), (x2, y2),
        arrowstyle=style, mutation_scale=14,
        linewidth=lw, color=color,
        connectionstyle=f"arc3,rad={curve}",
        zorder=1,
    )
    ax.add_patch(arr)
    if label:
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        ax.text(
            mx, my, label, fontsize=8, color=C_INK, ha="center", va="center",
            bbox=dict(boxstyle="round,pad=0.25", facecolor=C_BG, edgecolor=C_LINE, lw=0.5),
            zorder=4,
        )


def _save(fig, name):
    path = OUT_DIR / f"{name}.png"
    fig.savefig(path, dpi=DPI, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    print(f"  wrote {path.name}")


# ────────────────────────────────────────────────────────────────────
# 1.  SYSTEM CONTEXT
# ────────────────────────────────────────────────────────────────────

def diagram_system_context():
    fig, ax = _setup((14, 9), "System Context — Dynamic IT Operations Orchestrator")

    # Central system
    _box(ax, 35, 38, 30, 24, fill=C_INDIGO, edge=C_INK, radius=2.0, lw=2.5)
    _label(ax, 50, 56, "iTOps Orchestrator", size=15, weight="bold")
    _label(ax, 50, 51, "Multi-Agent AIOps Platform", size=10, color="#E0E7FF")
    _label(ax, 50, 46, "(FastAPI · LangGraph · React)", size=9, color="#C7D2FE")
    _label(ax, 50, 42, "https://dynamic-it-ops.tankbusters.duckdns.org", size=8, color="#C7D2FE")

    # Actors (left)
    _box(ax, 4, 70, 18, 8, fill=C_BLUE, edge=C_INK, radius=1.5)
    _label(ax, 13, 74, "SRE / Operator", size=11, weight="bold")
    _arrow(ax, 22, 73, 35, 58, color=C_BLUE, lw=2)
    _label(ax, 25, 67, "browses dashboards,\nasks Argus, exports runbooks",
           size=8, color=C_MUTED, ha="left")

    _box(ax, 4, 45, 18, 8, fill=C_VIOLET, edge=C_INK, radius=1.5)
    _label(ax, 13, 49, "Engineering Lead", size=11, weight="bold")
    _arrow(ax, 22, 48, 35, 48, color=C_VIOLET, lw=2)
    _label(ax, 25, 43, "reviews incidents,\napproves runbooks",
           size=8, color=C_MUTED, ha="left")

    _box(ax, 4, 20, 18, 8, fill=C_TEAL, edge=C_INK, radius=1.5)
    _label(ax, 13, 24, "Platform Admin", size=11, weight="bold")
    _arrow(ax, 22, 24, 35, 41, color=C_TEAL, lw=2)
    _label(ax, 25, 18, "configures LLM provider,\ncloud credentials, thresholds",
           size=8, color=C_MUTED, ha="left")

    # Upstream systems (right)
    _box(ax, 78, 78, 18, 8, fill=C_ORANGE, edge=C_INK, radius=1.5)
    _label(ax, 87, 82, "AWS CloudWatch", size=10, weight="bold")
    _arrow(ax, 78, 80, 65, 58, color=C_ORANGE, lw=2, curve=-0.1)

    _box(ax, 78, 66, 18, 8, fill=C_BLUE, edge=C_INK, radius=1.5)
    _label(ax, 87, 70, "Azure Monitor", size=10, weight="bold")
    _arrow(ax, 78, 68, 65, 54, color=C_BLUE, lw=2, curve=-0.05)

    _box(ax, 78, 54, 18, 8, fill=C_RED, edge=C_INK, radius=1.5)
    _label(ax, 87, 58, "GCP Cloud Monitoring", size=10, weight="bold")
    _arrow(ax, 78, 56, 65, 51, color=C_RED, lw=2)

    _box(ax, 78, 42, 18, 8, fill=C_EMERALD, edge=C_INK, radius=1.5)
    _label(ax, 87, 46, "Built-in Simulator", size=10, weight="bold")
    _label(ax, 87, 43.5, "20-node fleet", size=8, color="#D1FAE5")
    _arrow(ax, 78, 45, 65, 48, color=C_EMERALD, lw=2)

    # LLM providers (bottom)
    _box(ax, 30, 8, 18, 8, fill=C_PINK, edge=C_INK, radius=1.5)
    _label(ax, 39, 12, "Gemini API", size=10, weight="bold")
    _label(ax, 39, 9.5, "(default · cloud)", size=8, color="#FCE7F3")
    _arrow(ax, 39, 16, 45, 38, color=C_PINK, lw=2)

    _box(ax, 52, 8, 18, 8, fill=C_AMBER, edge=C_INK, radius=1.5)
    _label(ax, 61, 12, "Ollama / OpenAI", size=10, weight="bold")
    _label(ax, 61, 9.5, "(local · alt)", size=8, color="#FEF3C7")
    _arrow(ax, 61, 16, 55, 38, color=C_AMBER, lw=2)

    # Legend
    _label(ax, 5, 5, "→  Solid arrows = primary data / control flow",
           size=8, color=C_MUTED, ha="left")

    _save(fig, "01_system_context")


# ────────────────────────────────────────────────────────────────────
# 2.  LOGICAL LAYERED ARCHITECTURE
# ────────────────────────────────────────────────────────────────────

def diagram_logical_layers():
    fig, ax = _setup((17, 12), "Logical Architecture — Five-Layer View")
    # Carve out a left gutter so the band labels never overlap content.
    GUTTER_X = 18

    # Layer bands
    bands = [
        ("Presentation",     80, 92, C_BLUE),
        ("API",              66, 78, C_INDIGO),
        ("AI Orchestration", 46, 64, C_VIOLET),
        ("Domain Services",  30, 44, C_TEAL),
        ("Data & Runtime",   8,  28, C_EMERALD),
    ]
    for name, y0, y1, color in bands:
        ax.add_patch(Rectangle(
            (GUTTER_X, y0), 100 - GUTTER_X - 2, y1 - y0,
            facecolor=color, edgecolor=color, alpha=0.10, lw=0,
        ))
        _label(ax, 4, (y0 + y1) / 2, name, size=11, color=color, weight="bold", ha="left")

    # ── Presentation
    pres = [
        ("Dashboard", 22), ("Pipeline", 33), ("Incidents", 44),
        ("Fleet", 55), ("Runbooks", 66), ("Copilot", 77), ("Settings", 88),
    ]
    for name, x in pres:
        _box(ax, x - 4.5, 83, 9, 5, fill=C_PANEL, edge=C_BLUE, lw=1.2)
        _label(ax, x, 85.5, name, size=8.5)

    # ── API bar
    _box(ax, GUTTER_X + 1, 71, 100 - GUTTER_X - 4, 4,
         fill=C_INDIGO, edge=C_INDIGO, radius=0.6)
    _label(ax, (100 + GUTTER_X) / 2, 73,
           "FastAPI + Uvicorn  ·  REST + WebSocket (/ws/metrics)  ·  CORS",
           size=9, weight="bold")
    apis = [
        ("/infrastructure", 23), ("/incidents", 33), ("/agents", 43),
        ("/datasources", 53), ("/simulators", 63), ("/settings", 73),
        ("/chat", 83), ("/ws/metrics", 93),
    ]
    for name, x in apis:
        _box(ax, x - 4.4, 67, 8.8, 3.4, fill=C_PANEL, edge=C_INDIGO, lw=1.2, radius=0.6)
        _label(ax, x, 68.7, name, size=7.2, color="#E0E7FF")

    # ── AI Orchestration (LangGraph DAG)
    nodes = [
        ("Monitor",    24, C_EMERALD),
        ("Predict",    37, C_CYAN),
        ("Diagnose",   50, C_INDIGO),
        ("Remediate",  63, C_AMBER),
        ("Report",     76, C_PINK),
    ]
    for name, x, color in nodes:
        _box(ax, x - 5, 54, 10, 6, fill=color, edge=C_INK, lw=1.5)
        _label(ax, x, 57, name, size=10, weight="bold")
    for i in range(len(nodes) - 1):
        x1 = nodes[i][1] + 5
        x2 = nodes[i + 1][1] - 5
        _arrow(ax, x1, 57, x2, 57, color=C_INK, lw=1.5)
    # Early-exit edge from Monitor
    _arrow(ax, 24, 54, 24, 49, color=C_RED, lw=1.5)
    _label(ax, 27, 50.5, "no anomaly → END", size=7.5, color=C_RED, ha="left")
    _box(ax, 86, 54, 11, 6, fill=C_PANEL, edge=C_VIOLET, lw=1.2)
    _label(ax, 91.5, 58, "LangGraph", size=9, weight="bold")
    _label(ax, 91.5, 55.5, "StateGraph", size=7.5, color=C_MUTED)

    # ── Domain Services
    services = [
        ("InfraService", 22), ("IncidentService", 33), ("SimulatorService", 44),
        ("SettingsService", 55), ("ChatOrchestrator", 66), ("ToolRegistry", 77),
        ("Vector Memory", 88),
    ]
    for name, x in services:
        _box(ax, x - 5, 35, 10, 5, fill=C_PANEL, edge=C_TEAL, lw=1.2)
        _label(ax, x, 37.5, name, size=7.8)

    # ── Data & Runtime
    _box(ax, 21, 12, 18, 13, fill=C_PANEL, edge=C_EMERALD, lw=1.5)
    _label(ax, 30, 20, "PostgreSQL", size=11, weight="bold")
    _label(ax, 30, 17, "(SQLite in dev)", size=8, color=C_MUTED)
    _label(ax, 30, 14.5, "9 tables · WAL mode", size=7.5, color=C_MUTED)

    _box(ax, 41, 12, 18, 13, fill=C_PANEL, edge=C_VIOLET, lw=1.5)
    _label(ax, 50, 20, "ChromaDB", size=11, weight="bold")
    _label(ax, 50, 17, "HNSW · cosine", size=8, color=C_MUTED)
    _label(ax, 50, 14.5, "incidents + runbooks", size=7.5, color=C_MUTED)

    _box(ax, 61, 12, 18, 13, fill=C_PANEL, edge=C_PINK, lw=1.5)
    _label(ax, 70, 20, "LLM Provider", size=11, weight="bold")
    _label(ax, 70, 17, "Gemini / Ollama / OpenAI", size=8, color=C_MUTED)
    _label(ax, 70, 14.5, "swap at runtime", size=7.5, color=C_MUTED)

    _box(ax, 81, 12, 16, 13, fill=C_PANEL, edge=C_ORANGE, lw=1.5)
    _label(ax, 89, 20, "Cloud Adapters", size=10.5, weight="bold")
    _label(ax, 89, 17, "boto3 · azure-sdk", size=8, color=C_MUTED)
    _label(ax, 89, 14.5, "google-cloud-monitoring", size=7.5, color=C_MUTED)

    # Subtle dashed connectors between layers
    for ya, yb in [(83, 75), (67, 60), (54, 40), (35, 25)]:
        _arrow(ax, 60, ya, 60, yb, color=C_LINE, lw=0.7, style="-")

    _save(fig, "02_logical_layers")


# ────────────────────────────────────────────────────────────────────
# 3.  LANGGRAPH PIPELINE DAG
# ────────────────────────────────────────────────────────────────────

def diagram_pipeline_dag():
    fig, ax = _setup((16, 9), "LangGraph Agent Pipeline — Stateful DAG")

    # Entry
    _box(ax, 4, 50, 10, 8, fill=C_PANEL, edge=C_BLUE, lw=1.5, radius=1.5)
    _label(ax, 9, 56, "ENTRY", size=10, weight="bold", color=C_BLUE)
    _label(ax, 9, 53.5, "MetricEvent + history", size=7.5, color=C_MUTED)

    # Five agents
    agents = [
        ("Monitoring",  20, C_EMERALD, "Z-score + log-pattern\nthreshold check"),
        ("Predictive",  38, C_CYAN,    "EWMA slope +\nfailure probability"),
        ("Diagnostic",  56, C_INDIGO,  "Runbook lookup\n+ RAG retrieval"),
        ("Remediation", 74, C_AMBER,   "Template render\n+ rollback script"),
        ("Reporting",   89, C_PINK,    "MTTR + runbook"),
    ]
    for name, x, color, sub in agents:
        _box(ax, x - 6, 48, 12, 14, fill=color, edge=C_INK, lw=1.5, radius=1.5)
        _label(ax, x, 58, name, size=11, weight="bold")
        _label(ax, x, 53, sub, size=7.5, color=C_INK)
        # Tiny LLM/template tag
        _label(ax, x, 50.5, "↳ LLM fallback", size=6.5, color="#fef3c7")

    # Sequential edges
    for i in range(len(agents) - 1):
        x1 = agents[i][1] + 6
        x2 = agents[i + 1][1] - 6
        _arrow(ax, x1, 55, x2, 55, color=C_INK, lw=2)

    # Entry → Monitor
    _arrow(ax, 14, 55, 14, 55, color=C_BLUE, lw=2)

    # Conditional edge (early exit if no anomaly)
    _box(ax, 18, 18, 12, 8, fill=C_PANEL, edge=C_RED, lw=1.5, radius=1.0)
    _label(ax, 24, 23, "END (skip)", size=10, weight="bold", color=C_RED)
    _label(ax, 24, 20, "All metrics healthy", size=7.5, color=C_MUTED)
    _arrow(ax, 20, 48, 22, 26, color=C_RED, lw=2, curve=-0.2)
    _label(ax, 11, 38, "is_anomaly == False", size=8, color=C_RED, weight="bold")

    # END node
    _box(ax, 83, 18, 12, 8, fill=C_PANEL, edge=C_EMERALD, lw=1.5, radius=1.0)
    _label(ax, 89, 23, "END (close)", size=10, weight="bold", color=C_EMERALD)
    _label(ax, 89, 20, "Incident + Runbook saved", size=7.5, color=C_MUTED)
    _arrow(ax, 89, 48, 89, 26, color=C_EMERALD, lw=2)

    # Shared state callout (top)
    _box(ax, 8, 78, 84, 8, fill=C_PANEL_LITE, edge=C_VIOLET, lw=1.5, radius=1.0)
    _label(ax, 50, 83.5, "Shared OrchestratorState  (TypedDict — passed through every node)",
           size=10, weight="bold", color=C_VIOLET)
    _label(ax, 50, 80.5,
           "metrics  ·  metric_history  ·  log_history  ·  is_anomaly  ·  severity  ·  agent_trace[]  ·  progress_callback",
           size=8, color=C_INK)

    # Cross-cutting concerns (bottom)
    _box(ax, 8, 4, 84, 8, fill=C_PANEL_LITE, edge=C_TEAL, lw=1.5, radius=1.0)
    _label(ax, 50, 9, "Cross-cutting:  30-second per-node timeout  ·  partial-failure fallback (each agent returns safe defaults)  ·  WebSocket progress emit",
           size=8.5, color=C_INK)
    _label(ax, 50, 6, "concurrency-capped via PIPELINE_MAX_CONCURRENT semaphore  ·  5-minute per-(node, anomaly-type) cooldown",
           size=8.5, color=C_INK)

    _save(fig, "03_pipeline_dag")


# ────────────────────────────────────────────────────────────────────
# 4.  DEPLOYMENT VIEW (production EC2)
# ────────────────────────────────────────────────────────────────────

def diagram_deployment():
    fig, ax = _setup((16, 11), "Deployment View — Production (AWS EC2, ap-south-1)")

    # User device
    _box(ax, 4, 78, 16, 10, fill=C_BLUE, edge=C_INK, lw=2, radius=1.5)
    _label(ax, 12, 84.5, "Operator Browser", size=11, weight="bold")
    _label(ax, 12, 82, "React 19 SPA (Vite build)", size=8, color="#E0E7FF")
    _label(ax, 12, 80, "HTTPS + WSS", size=8, color="#E0E7FF")

    # DNS
    _box(ax, 26, 78, 16, 10, fill=C_VIOLET, edge=C_INK, lw=2, radius=1.5)
    _label(ax, 34, 84.5, "DuckDNS", size=11, weight="bold")
    _label(ax, 34, 82,
           "dynamic-it-ops\n.tankbusters\n.duckdns.org",
           size=7.5, color="#E9D5FF")

    _arrow(ax, 20, 83, 26, 83, color=C_INK, lw=2)
    _arrow(ax, 42, 83, 48, 83, color=C_INK, lw=2)

    # EC2 box
    ec2 = FancyBboxPatch(
        (48, 18), 48, 68,
        boxstyle="round,pad=0.1,rounding_size=2",
        linewidth=2.5, edgecolor=C_ORANGE, facecolor=C_PANEL_LITE, zorder=1,
    )
    ax.add_patch(ec2)
    _label(ax, 72, 83, "EC2 Instance · t3.medium · Mumbai (ap-south-1)",
           size=11, weight="bold", color=C_ORANGE)
    _label(ax, 72, 80.5, "13.207.25.255  ·  Amazon Linux 2023",
           size=8, color="#FED7AA")

    # nginx
    _box(ax, 52, 64, 18, 10, fill=C_EMERALD, edge=C_INK, lw=1.5, radius=1.2)
    _label(ax, 61, 70, "nginx (443)", size=10, weight="bold")
    _label(ax, 61, 67.5, "TLS · gzip · WS upgrade", size=7.5, color="#D1FAE5")
    _label(ax, 61, 65.5, "acme.sh cert (auto-renew)", size=7.5, color="#D1FAE5")

    # static
    _box(ax, 74, 64, 18, 10, fill=C_TEAL, edge=C_INK, lw=1.5, radius=1.2)
    _label(ax, 83, 70, "Static SPA bundle", size=10, weight="bold")
    _label(ax, 83, 67.5, "/opt/itops/frontend/dist", size=7.5, color="#CCFBF1")
    _label(ax, 83, 65.5, "served by nginx root", size=7.5, color="#CCFBF1")
    _arrow(ax, 70, 69, 74, 69, color=C_INK, lw=1.2)

    # uvicorn / FastAPI
    _box(ax, 52, 48, 40, 12, fill=C_INDIGO, edge=C_INK, lw=1.5, radius=1.2)
    _label(ax, 72, 56.5, "uvicorn + FastAPI  (single worker, :8000)", size=10, weight="bold")
    _label(ax, 72, 53.5, "managed by systemd  ·  itops-backend.service", size=8, color="#E0E7FF")
    _label(ax, 72, 50.5, "background tasks: monitoring · simulator · auto-pipeline · cloud poll",
           size=7.5, color="#C7D2FE")
    _arrow(ax, 61, 64, 65, 60, color=C_INK, lw=1.5, label="/api · /ws")

    # Postgres
    _box(ax, 52, 32, 18, 12, fill=C_PANEL, edge=C_EMERALD, lw=1.5, radius=1.2)
    _label(ax, 61, 39, "PostgreSQL", size=10, weight="bold")
    _label(ax, 61, 36.5, "creds /etc/itops-db.env", size=7.5, color=C_MUTED)
    _label(ax, 61, 34.5, "ports :5432 (local)", size=7.5, color=C_MUTED)
    _arrow(ax, 60, 48, 60, 44, color=C_INK, lw=1.2)

    # ChromaDB
    _box(ax, 74, 32, 18, 12, fill=C_PANEL, edge=C_VIOLET, lw=1.5, radius=1.2)
    _label(ax, 83, 39, "ChromaDB", size=10, weight="bold")
    _label(ax, 83, 36.5, "persisted dir (S3 mount", size=7.5, color=C_MUTED)
    _label(ax, 83, 34.5, "with local fallback)", size=7.5, color=C_MUTED)
    _arrow(ax, 84, 48, 84, 44, color=C_INK, lw=1.2)

    # External services bottom
    _box(ax, 4, 32, 18, 12, fill=C_PINK, edge=C_INK, lw=1.5, radius=1.2)
    _label(ax, 13, 39, "Gemini API", size=10, weight="bold")
    _label(ax, 13, 36.5, "generativelanguage", size=7.5, color="#FCE7F3")
    _label(ax, 13, 34.5, ".googleapis.com", size=7.5, color="#FCE7F3")
    _arrow(ax, 22, 38, 52, 53, color=C_PINK, lw=1.4, curve=0.1, label="LLM JSON")

    _box(ax, 26, 32, 18, 12, fill=C_ORANGE, edge=C_INK, lw=1.5, radius=1.2)
    _label(ax, 35, 39, "CloudWatch /", size=10, weight="bold")
    _label(ax, 35, 37, "Azure Monitor /", size=10, weight="bold")
    _label(ax, 35, 35, "GCP Monitoring", size=10, weight="bold")
    _arrow(ax, 44, 38, 52, 50, color=C_ORANGE, lw=1.4, curve=0.05, label="metrics")

    # CI / CD pipeline footer
    _box(ax, 4, 6, 92, 18, fill=C_PANEL, edge=C_AMBER, lw=1.5, radius=1.2)
    _label(ax, 50, 21, "CI / CD  (GitHub Actions  →  EC2)", size=11, weight="bold", color=C_AMBER)
    steps_x = [10, 26, 42, 58, 74, 90]
    steps = ["push to main", "lint + typecheck", "npm run build", "rsync dist + code",
             "systemctl restart\n+ nginx reload", "/health probe"]
    for x, s in zip(steps_x, steps):
        _box(ax, x - 6, 9, 12, 7, fill=C_PANEL_LITE, edge=C_AMBER, lw=1, radius=0.8)
        _label(ax, x, 12.5, s, size=8)
    for i in range(len(steps_x) - 1):
        _arrow(ax, steps_x[i] + 6, 12.5, steps_x[i + 1] - 6, 12.5, color=C_AMBER, lw=1.4)

    _save(fig, "04_deployment_view")


# ────────────────────────────────────────────────────────────────────
# 5.  INCIDENT LIFECYCLE SEQUENCE DIAGRAM
# ────────────────────────────────────────────────────────────────────

def diagram_sequence():
    fig, ax = _setup((16, 11), "Incident Lifecycle — Sequence Diagram (anomaly → resolved)")

    # Lanes
    lanes = [
        ("DataSource",      9,  C_ORANGE),
        ("Monitoring Loop", 24, C_EMERALD),
        ("Pipeline",        40, C_VIOLET),
        ("LLM Provider",    56, C_PINK),
        ("Database",        72, C_TEAL),
        ("WebSocket Clients", 88, C_BLUE),
    ]
    for name, x, color in lanes:
        ax.add_line(Line2D([x, x], [12, 86], color=color, lw=1.5, linestyle="--", alpha=0.4))
        _box(ax, x - 7, 86, 14, 5, fill=color, edge=C_INK, lw=1.5, radius=1)
        _label(ax, x, 88.5, name, size=9.5, weight="bold")

    # Sequence of arrows (y descending)
    seq = [
        # (from_x, to_x, y, label, color)
        (9, 24, 82, "stream_metrics() → MetricEvent[]", C_ORANGE),
        (24, 72, 78, "preliminary_monitoring_check() →\nstore MetricSnapshot",  C_EMERALD),
        (24, 88, 75, "broadcast metric_batch",  C_BLUE),
        (24, 40, 71, "is_anomaly  →  _spawn_pipeline()", C_AMBER),
        (40, 88, 67, "progress: pipeline.started", C_VIOLET),
        (40, 40, 63, "Monitoring agent (deterministic)", C_EMERALD),
        (40, 88, 60, "progress: monitoring.completed", C_VIOLET),
        (40, 40, 56, "Predictive agent (EWMA heuristic)", C_CYAN),
        (40, 72, 53, "lookup runbook by issue_type", C_TEAL),
        (40, 56, 49, "Diagnostic agent → LLM (RAG-grounded)", C_PINK),
        (56, 40, 46, "JSON: root_cause, blast_radius",  C_MUTED),
        (40, 72, 42, "render remediation template", C_TEAL),
        (40, 88, 38, "progress: remediation.completed", C_VIOLET),
        (40, 40, 34, "Reporting agent (deterministic)", C_PINK),
        (40, 72, 30, "incident.create() · agent_logs.add() · runbook.update()", C_TEAL),
        (40, 88, 26, "progress: pipeline.completed", C_VIOLET),
        (24, 72, 22, "cooldown_dispatch[(node, type)] = now", C_EMERALD),
        (24, 24, 18, "next polling cycle (5s)", C_LINE),
    ]
    for fx, tx, y, label, color in seq:
        if fx == tx:
            # self-call: small rect
            _box(ax, fx - 1.8, y - 0.7, 3.6, 1.4, fill=color, edge=C_INK, lw=0.8, radius=0.4)
            _label(ax, fx + 3.5, y, label, size=7.5, ha="left", color=C_INK)
        else:
            _arrow(ax, fx, y, tx, y, color=color, lw=1.4)
            mx = (fx + tx) / 2
            _label(ax, mx, y + 1, label, size=7.5, color=C_INK)

    # Footer narrative
    _box(ax, 6, 4, 88, 7, fill=C_PANEL, edge=C_LINE, lw=1, radius=1)
    _label(ax, 50, 8,
           "All pipeline runs are spawned through a 4-worker semaphore so an anomaly storm cannot exhaust the event loop.",
           size=9, color=C_INK)
    _label(ax, 50, 5.5,
           "Per-(node, anomaly_type) cooldown of 300 s suppresses duplicate runs while the same condition persists.",
           size=9, color=C_INK)

    _save(fig, "05_incident_sequence")


# ────────────────────────────────────────────────────────────────────
# 6.  DATA MODEL (ER DIAGRAM)
# ────────────────────────────────────────────────────────────────────

def _table(ax, x, y, w, h, title, rows, *, color):
    _box(ax, x, y, w, h, fill=C_PANEL, edge=color, lw=1.6, radius=0.8)
    # title bar
    _box(ax, x, y + h - 3.2, w, 3.2, fill=color, edge=color, lw=0, radius=0.4)
    _label(ax, x + w / 2, y + h - 1.6, title, size=10, weight="bold")
    # rows
    for i, row in enumerate(rows):
        _label(ax, x + 0.5, y + h - 4.5 - i * 1.5, row,
               size=7.5, color=C_INK, ha="left")


def diagram_er():
    fig, ax = _setup((17, 12), "Data Model — Relational Schema (10 tables)")

    # Central InfrastructureNode
    _table(ax, 38, 65, 22, 22, "infrastructure_nodes",
           ["id  PK", "node_name UNIQUE", "node_type", "provider",
            "region", "status", "ip_address", "metadata (JSON)",
            "created_at", "updated_at"],
           color=C_BLUE)

    # MetricSnapshot
    _table(ax, 8, 70, 22, 17, "metric_snapshots",
           ["id PK", "node_id FK", "timestamp (idx)",
            "cpu/mem/disk %", "network in/out", "request_rate",
            "error_rate, latency_ms", "is_anomaly",
            "anomaly_scores (JSON)"],
           color=C_EMERALD)
    _arrow(ax, 30, 78, 38, 78, color=C_EMERALD, lw=1.6, style="-|>", label="1..N")

    # LogEntry
    _table(ax, 8, 49, 22, 16, "log_entries",
           ["id PK", "node_id FK", "timestamp (idx)",
            "level (INFO/WARN/", "  ERROR/CRITICAL)",
            "source", "message",
            "metadata (JSON)"],
           color=C_TEAL)
    _arrow(ax, 30, 57, 38, 70, color=C_TEAL, lw=1.6, style="-|>", curve=-0.1, label="1..N")

    # Incident
    _table(ax, 68, 65, 24, 22, "incidents",
           ["id PK", "node_id FK", "title, description",
            "severity (enum)", "status (enum)",
            "detected_at, resolved_at", "root_cause",
            "prediction_details JSON", "diagnostic_details JSON",
            "metric_snapshot_id FK"],
           color=C_PINK)
    _arrow(ax, 60, 78, 68, 78, color=C_PINK, lw=1.6, style="-|>", label="1..N")

    # Remediation
    _table(ax, 68, 38, 24, 22, "remediations",
           ["id PK", "incident_id FK", "action_type",
            "description", "script_content",
            "rollback_script", "status (enum)",
            "requires_approval", "canary_stage",
            "execution_log",
            "started_at, completed_at"],
           color=C_AMBER)
    _arrow(ax, 80, 65, 80, 60, color=C_AMBER, lw=1.6, style="-|>", label="1..N")

    # AgentLog
    _table(ax, 68, 12, 24, 22, "agent_logs",
           ["id PK", "incident_id FK", "agent_name",
            "action",
            "input_data JSON",
            "output_data JSON",
            "duration_ms",
            "timestamp",
            "(append-only audit trail)"],
           color=C_VIOLET)
    _arrow(ax, 80, 38, 80, 34, color=C_VIOLET, lw=1.6, style="-|>", label="1..N")

    # RunbookEntry
    _table(ax, 38, 38, 22, 22, "runbook_entries",
           ["id PK", "title, problem_pattern",
            "solution_steps",
            "issue_type (idx UNIQUE)",
            "root_cause, causal_chain",
            "blast_radius (JSON)",
            "recommended_actions",
            "remediation_steps JSON",
            "artifacts JSON",
            "times_used, score", "is_seeded"],
           color=C_INDIGO)
    _arrow(ax, 49, 60, 49, 65, color=C_INDIGO, lw=1.6, style="-|>",
           curve=0.0, label="referenced by\nDiagnose / Remediate")

    # Simulator
    _table(ax, 8, 12, 22, 22, "simulators",
           ["id PK", "name UNIQUE", "simulator_type (enum)",
            "status (enum)", "log_file_content",
            "interval_seconds",
            "current_line_index",
            "total_lines",
            "metrics_enabled",
            "metrics_config JSON",
            "last_advance_at"],
           color=C_LIME)

    # ChatAction
    _table(ax, 38, 12, 22, 22, "chat_actions",
           ["id PK", "session_id (idx)",
            "conversation_id (idx)",
            "tool_name (idx)",
            "tool_args JSON",
            "tool_result JSON",
            "status (ok/error/...)",
            "was_confirmed",
            "latency_ms",
            "error_message",
            "created_at (idx)"],
           color=C_RED)

    # Legend
    _label(ax, 50, 5, "→ Arrows indicate foreign-key (cascade-delete) relationships",
           size=9, color=C_MUTED)

    _save(fig, "06_data_model")


# ────────────────────────────────────────────────────────────────────
# 7.  SRE COPILOT (ARGUS) — FUNCTION-CALLING LOOP
# ────────────────────────────────────────────────────────────────────

def diagram_copilot_flow():
    fig, ax = _setup((17, 11),
                     "SRE Copilot (Argus) — Function-Calling Loop with Safe Confirmations")

    # Browser
    _box(ax, 4, 78, 18, 12, fill=C_BLUE, edge=C_INK, lw=2, radius=1.5)
    _label(ax, 13, 86, "Browser UI", size=11, weight="bold")
    _label(ax, 13, 83.5, "useChatStream hook", size=8, color="#E0E7FF")
    _label(ax, 13, 81, "SSE consumer + voice", size=8, color="#E0E7FF")

    _arrow(ax, 22, 84, 38, 84, color=C_INK, lw=2, label="POST /api/chat")

    # Orchestrator
    _box(ax, 38, 78, 22, 12, fill=C_VIOLET, edge=C_INK, lw=2, radius=1.5)
    _label(ax, 49, 86, "Chat Orchestrator", size=11, weight="bold")
    _label(ax, 49, 83.5, "run_turn_streaming()", size=8, color="#E9D5FF")
    _label(ax, 49, 81, "8-step tool ceiling", size=8, color="#E9D5FF")

    _arrow(ax, 60, 84, 74, 84, color=C_PINK, lw=2,
           label="generate_content(tools=[…])")
    _box(ax, 74, 78, 22, 12, fill=C_PINK, edge=C_INK, lw=2, radius=1.5)
    _label(ax, 85, 86, "Gemini 2.5 Flash", size=11, weight="bold")
    _label(ax, 85, 83.5, "function-calling", size=8, color="#FCE7F3")
    _label(ax, 85, 81, "thought_signature retained", size=8, color="#FCE7F3")
    _arrow(ax, 85, 78, 60, 72, color=C_PINK, lw=1.5, curve=0.2,
           label="text deltas + tool_calls[]")

    # Registry
    _box(ax, 38, 52, 22, 18, fill=C_INDIGO, edge=C_INK, lw=2, radius=1.5)
    _label(ax, 49, 66, "Tool Registry", size=11, weight="bold")
    _label(ax, 49, 63, "validate args (pydantic)", size=8, color="#C7D2FE")
    _label(ax, 49, 60.5, "idempotency lookup", size=8, color="#C7D2FE")
    _label(ax, 49, 58, "dispatch + audit", size=8, color="#C7D2FE")
    _label(ax, 49, 55, "→ chat_actions row", size=8, color="#C7D2FE")
    _arrow(ax, 49, 78, 49, 70, color=C_INK, lw=2)
    _arrow(ax, 49, 52, 49, 45, color=C_INK, lw=2)

    # Confirmation channel
    _box(ax, 74, 52, 22, 18, fill=C_AMBER, edge=C_INK, lw=2, radius=1.5)
    _label(ax, 85, 66, "Confirm Store", size=11, weight="bold", color="#0F172A")
    _label(ax, 85, 63, "RISKY tool → pause", size=8, color="#0F172A")
    _label(ax, 85, 60.5, "SSE: confirm_required", size=8, color="#0F172A")
    _label(ax, 85, 58, "POST /api/chat/confirm", size=8, color="#0F172A")
    _label(ax, 85, 55, "→ run | cancel", size=8, color="#0F172A")
    _arrow(ax, 60, 61, 74, 61, color=C_AMBER, lw=1.5)
    _arrow(ax, 85, 52, 72, 24, color=C_AMBER, lw=1.5, curve=-0.2)

    # Tool catalogue — six rows × wider cells so no name clips
    _box(ax, 4, 6, 92, 38, fill=C_PANEL, edge=C_LINE, lw=1, radius=1.2)
    _label(ax, 50, 41,
           "Tool Catalogue  (~20 tools across 6 modules — RISKY tools coloured red)",
           size=10, color=C_MUTED)

    rows = [
        # Each row: list of (name, risky)
        [("list_nodes", False), ("get_node", False), ("get_node_logs", False),
         ("get_node_metrics", False), ("list_incidents", False)],
        [("get_incident", False), ("get_dashboard_overview", False),
         ("list_runbooks", False), ("get_runbook", False),
         ("upsert_runbook", True)],
        [("list_data_sources", False),
         ("test_data_source_connection", False),
         ("reconnect_data_source", False), ("list_simulators", False),
         ("start_stop_simulator", True)],
        [("read_settings", False), ("write_settings", True),
         ("run_pipeline", False), ("run_pipeline_batch", True),
         ("delete_runbook", True)],
    ]
    cell_w = 17.0
    cell_h = 6.0
    left = 6
    top_y = 35
    for ri, row in enumerate(rows):
        y = top_y - ri * (cell_h + 1.5)
        for ci, (name, risky) in enumerate(row):
            x = left + ci * (cell_w + 0.6)
            color = C_RED if risky else C_TEAL
            _box(ax, x, y, cell_w, cell_h, fill=color, edge=color,
                 lw=0.5, radius=0.6)
            label_text = name + ("  (RISKY)" if risky else "")
            _label(ax, x + cell_w / 2, y + cell_h / 2, label_text,
                   size=8, weight="bold",
                   color=C_INK if risky else "#0F172A")

    _save(fig, "07_copilot_flow")


# ────────────────────────────────────────────────────────────────────
# 8.  DATA-SOURCE PLUGIN ARCHITECTURE
# ────────────────────────────────────────────────────────────────────

def diagram_data_sources():
    fig, ax = _setup((15, 9), "Data Source Plugin Architecture — Cloud-Agnostic Ingestion")

    # Abstract base
    _box(ax, 38, 70, 24, 14, fill=C_INDIGO, edge=C_INK, lw=2, radius=1.5)
    _label(ax, 50, 80, "DataSource (ABC)", size=11, weight="bold")
    _label(ax, 50, 77, "provider_name", size=8, color="#C7D2FE")
    _label(ax, 50, 75, "connect() / disconnect()", size=8, color="#C7D2FE")
    _label(ax, 50, 73, "stream_metrics()", size=8, color="#C7D2FE")
    _label(ax, 50, 71, "get_current_snapshot()", size=8, color="#C7D2FE")

    # Canonical events box (lifted up to avoid arrow-text overlap)
    _box(ax, 36, 48, 28, 16, fill=C_PANEL, edge=C_VIOLET, lw=1.5, radius=1.2)
    _label(ax, 50, 60, "MetricEvent + LogEvent  (canonical schema)",
           size=10, weight="bold")
    _label(ax, 50, 57.5, "cpu / mem / disk %", size=7.5, color=C_MUTED)
    _label(ax, 50, 55.5, "network in / out  ·  latency_ms", size=7.5, color=C_MUTED)
    _label(ax, 50, 53.5, "error_rate  ·  request_rate", size=7.5, color=C_MUTED)
    _label(ax, 50, 51, "metadata: provider-native payload (e.g. cloudwatch)",
           size=7.5, color=C_MUTED)
    _arrow(ax, 50, 70, 50, 64, color=C_VIOLET, lw=1.5)

    # Four implementations — pushed lower with arrows entering from above the box
    impls = [
        ("SimulatorDataSource",  4, 18, C_EMERALD,
         ["20-node fleet", "15% anomaly probability",
          "5s polling cycle", "default in dev"]),
        ("CloudWatchDataSource", 28, 18, C_ORANGE,
         ["boto3 client", "EC2 + RDS + ELB",
          "CWAgent for mem/disk",
          "incremental log fetch"]),
        ("AzureMonitorDataSource", 52, 18, C_BLUE,
         ["azure-identity OAuth", "VM Insights metrics",
          "Activity Log → LogEvents",
          "30s poll cycle"]),
        ("GCPMonitoringDataSource", 76, 18, C_RED,
         ["service-account JSON",
          "GCE instance metrics",
          "Cloud Logging tail",
          "30s poll cycle"]),
    ]
    for name, x, y, color, lines in impls:
        _box(ax, x, y, 20, 22, fill=color, edge=C_INK, lw=1.5, radius=1.2)
        _label(ax, x + 10, y + 19, name, size=9.5, weight="bold")
        for i, line in enumerate(lines):
            _label(ax, x + 10, y + 15.5 - i * 2.5, line, size=8, color=C_INK)
        # Arrow originates outside the box top and ends at the bottom of the
        # canonical-events box — no overlap with the schema text.
        _arrow(ax, x + 10, y + 22, 50, 48, color=color, lw=1.5, curve=0.05)

    # Registry & loop
    _box(ax, 6, 6, 88, 8, fill=C_PANEL_LITE, edge=C_TEAL, lw=1.5, radius=1.2)
    _label(ax, 50, 11, "DataSourceRegistry + background_monitoring_loop()",
           size=10, weight="bold", color=C_TEAL)
    _label(ax, 50, 8,
           "each adapter is registered at startup and polled on its own interval; all events flow through the same _process_event() funnel",
           size=8, color=C_INK)

    _save(fig, "08_data_sources")


# ────────────────────────────────────────────────────────────────────
# Main
# ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"Rendering diagrams into {OUT_DIR}")
    diagram_system_context()
    diagram_logical_layers()
    diagram_pipeline_dag()
    diagram_deployment()
    diagram_sequence()
    diagram_er()
    diagram_copilot_flow()
    diagram_data_sources()
    print("All diagrams rendered.")
