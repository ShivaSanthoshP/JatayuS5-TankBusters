import datetime as _dt
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()


def utc_now() -> _dt.datetime:
    """Naive UTC datetime, without the 3.12+ deprecation warning on utcnow()."""
    return _dt.datetime.now(_dt.timezone.utc).replace(tzinfo=None)

BASE_DIR = Path(__file__).resolve().parent.parent

# Database
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'itops.db'}")

# LLM provider selection (ollama | openai | gemini). Used as the default
# on first boot; the runtime value lives in runtime_settings.json and is
# edited from the Settings UI.
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "ollama")

# Ollama configuration (local provider)
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
OLLAMA_EMBEDDING_MODEL = os.getenv("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text")

# OpenAI provider (optional — only used when llm_provider=="openai")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

# Gemini provider (optional — only used when llm_provider=="gemini")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# Embedding provider — "google" uses Gemini embedding API, "ollama" uses local Ollama
EMBEDDING_PROVIDER = os.getenv("EMBEDDING_PROVIDER", "google")
GEMINI_EMBEDDING_MODEL = os.getenv("GEMINI_EMBEDDING_MODEL", "models/text-embedding-004")
# Hard ceiling for a single embedding network call. An unreachable provider
# (missing API key, no local Ollama, blocked egress) must never block a
# request or background task beyond this — it degrades to a zero vector.
EMBED_TIMEOUT_SECONDS = float(os.getenv("EMBED_TIMEOUT_SECONDS", "8"))

# ChromaDB
CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", str(BASE_DIR / "chroma_db"))

# AWS CloudWatch
CLOUDWATCH_ACCESS_KEY_ID = os.getenv("CLOUDWATCH_ACCESS_KEY_ID", "")
CLOUDWATCH_SECRET_ACCESS_KEY = os.getenv("CLOUDWATCH_SECRET_ACCESS_KEY", "")
CLOUDWATCH_REGION = os.getenv("CLOUDWATCH_REGION", "us-east-1")
CLOUDWATCH_INSTANCE_IDS = [
    i.strip() for i in os.getenv("CLOUDWATCH_INSTANCE_IDS", "").split(",") if i.strip()
]
CLOUDWATCH_POLL_INTERVAL_SECONDS = int(os.getenv("CLOUDWATCH_POLL_INTERVAL_SECONDS", "30"))
CLOUDWATCH_LOG_GROUPS = [
    g.strip() for g in os.getenv("CLOUDWATCH_LOG_GROUPS", "/itops/ec2/syslog,/itops/ec2/auth").split(",") if g.strip()
]

# Azure Monitor
AZURE_TENANT_ID = os.getenv("AZURE_TENANT_ID", "")
AZURE_CLIENT_ID = os.getenv("AZURE_CLIENT_ID", "")
AZURE_CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET", "")
AZURE_SUBSCRIPTION_ID = os.getenv("AZURE_SUBSCRIPTION_ID", "")
AZURE_RESOURCE_GROUP = os.getenv("AZURE_RESOURCE_GROUP", "")
AZURE_POLL_INTERVAL_SECONDS = int(os.getenv("AZURE_POLL_INTERVAL_SECONDS", "30"))

# GCP Cloud Monitoring
GCP_PROJECT_ID = os.getenv("GCP_PROJECT_ID", "")
GCP_SERVICE_ACCOUNT_JSON = os.getenv("GCP_SERVICE_ACCOUNT_JSON", "")
GCP_ZONE = os.getenv("GCP_ZONE", "")
GCP_POLL_INTERVAL_SECONDS = int(os.getenv("GCP_POLL_INTERVAL_SECONDS", "30"))

# Simulator
SIMULATOR_INTERVAL_SECONDS = int(os.getenv("SIMULATOR_INTERVAL_SECONDS", "5"))
NUM_SIMULATED_SERVERS = int(os.getenv("NUM_SIMULATED_SERVERS", "6"))
ANOMALY_PROBABILITY = float(os.getenv("ANOMALY_PROBABILITY", "0.15"))

# Agent config — global fallback
AGENT_TEMPERATURE = float(os.getenv("AGENT_TEMPERATURE", "0.1"))

# Per-agent temperatures (research-backed: lower = safer for critical ops)
MONITORING_TEMPERATURE  = float(os.getenv("MONITORING_TEMPERATURE",  "0.1"))
PREDICTIVE_TEMPERATURE  = float(os.getenv("PREDICTIVE_TEMPERATURE",  "0.1"))
DIAGNOSTIC_TEMPERATURE  = float(os.getenv("DIAGNOSTIC_TEMPERATURE",  "0.2"))
REMEDIATION_TEMPERATURE = float(os.getenv("REMEDIATION_TEMPERATURE", "0.0"))
REPORTING_TEMPERATURE   = float(os.getenv("REPORTING_TEMPERATURE",   "0.4"))
