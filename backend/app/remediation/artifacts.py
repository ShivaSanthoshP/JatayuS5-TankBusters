from __future__ import annotations

"""
Helpers for structured remediation script artifacts.

The remediation agent can return shell and/or Terraform artifacts directly.
When it only returns step-level scripts, this module derives aggregated
downloadable artifacts so the UI can still present a coherent remediation bundle.
"""

import ast
import copy
import json
import re


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "artifact"


def _strip_shebang(script: str) -> str:
    if not script:
        return ""
    lines = script.strip().splitlines()
    if lines and lines[0].startswith("#!"):
        lines = lines[1:]
    return "\n".join(lines).strip()


def _aggregate_shell_script(steps: list[dict]) -> str:
    chunks = []
    for step in steps:
        script = _strip_shebang(step.get("script", ""))
        if not script:
            continue
        header = f"# Step {step.get('order', '?')}: {step.get('action', 'Unnamed action')}"
        chunks.append(f"{header}\n{script}")

    if not chunks:
        return ""

    return "#!/usr/bin/env bash\nset -euo pipefail\n\n" + "\n\n".join(chunks) + "\n"


def _aggregate_rollback_script(steps: list[dict]) -> str:
    chunks = []
    for step in reversed(steps):
        rollback = _strip_shebang(step.get("rollback_script", ""))
        if not rollback:
            continue
        header = f"# Rollback step {step.get('order', '?')}: {step.get('action', 'Unnamed action')}"
        chunks.append(f"{header}\n{rollback}")

    if not chunks:
        return ""

    return "#!/usr/bin/env bash\nset -euo pipefail\n\n" + "\n\n".join(chunks) + "\n"


def _artifact(
    artifact_id: str,
    name: str,
    kind: str,
    language: str,
    purpose: str,
    description: str,
    content: str,
) -> dict:
    return {
        "id": artifact_id,
        "name": name,
        "kind": kind,
        "language": language,
        "purpose": purpose,
        "description": description,
        "content": content,
    }


def infer_strategy(artifacts: list[dict]) -> str:
    has_shell = any(a.get("kind") == "shell" for a in artifacts)
    has_tf = any(a.get("kind") == "terraform" for a in artifacts)
    if has_shell and has_tf:
        return "hybrid"
    if has_tf:
        return "terraform"
    return "shell"


def _normalize_artifact(artifact: dict, index: int) -> dict:
    kind = artifact.get("kind") or artifact.get("type") or "shell"
    language = artifact.get("language") or ("hcl" if kind == "terraform" else "bash")
    purpose = artifact.get("purpose") or "apply"
    name = artifact.get("name")
    if not name:
        ext = ".tf" if kind == "terraform" else ".sh"
        name = f"{_slugify(kind)}-{purpose}{ext}"

    content = artifact.get("content") or artifact.get("script") or ""

    return {
        "id": artifact.get("id") or f"{_slugify(kind)}-{purpose}-{index}",
        "name": name,
        "kind": kind,
        "language": language,
        "purpose": purpose,
        "description": artifact.get("description", ""),
        "content": content,
    }


def _derived_artifacts_from_steps(payload: dict) -> list[dict]:
    steps = payload.get("steps", []) or []
    artifacts = []

    shell_script = _aggregate_shell_script(steps)
    if shell_script:
        artifacts.append(
            _artifact(
                "shell-apply",
                "remediate.sh",
                "shell",
                "bash",
                "apply",
                "In-place Linux remediation script derived from the agent plan.",
                shell_script,
            )
        )

    rollback_script = _aggregate_rollback_script(steps)
    if rollback_script:
        artifacts.append(
            _artifact(
                "shell-rollback",
                "rollback.sh",
                "shell",
                "bash",
                "rollback",
                "Rollback script derived from the remediation plan.",
                rollback_script,
            )
        )

    return artifacts


def normalize_remediation_payload(payload: dict | None) -> dict:
    base = copy.deepcopy(payload or {})
    if not isinstance(base, dict):
        base = {}

    steps = base.get("steps")
    if not isinstance(steps, list):
        steps = []
    base["steps"] = steps

    raw_artifacts = base.get("artifacts")
    artifacts = []
    if isinstance(raw_artifacts, list):
        artifacts = [
            _normalize_artifact(artifact, index)
            for index, artifact in enumerate(raw_artifacts, start=1)
            if isinstance(artifact, dict)
        ]

    if not artifacts:
        artifacts = _derived_artifacts_from_steps(base)

    if artifacts:
        # Ensure a rollback artifact exists when steps contain rollback logic.
        has_rollback = any(a.get("purpose") == "rollback" for a in artifacts)
        if not has_rollback:
            derived = _derived_artifacts_from_steps(base)
            rollback = next((a for a in derived if a.get("purpose") == "rollback"), None)
            if rollback:
                artifacts.append(rollback)

    base["artifacts"] = artifacts
    base["strategy"] = base.get("strategy") or infer_strategy(artifacts)
    return base


def serialize_remediation_payload(payload: dict | None) -> str:
    return json.dumps(normalize_remediation_payload(payload), ensure_ascii=True)


def deserialize_remediation_payload(raw: str | dict | list | None) -> dict:
    parsed: dict | list | None = None

    if isinstance(raw, dict):
        parsed = raw
    elif isinstance(raw, list):
        parsed = {"steps": raw}
    elif isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            try:
                parsed = ast.literal_eval(raw)
            except (ValueError, SyntaxError):
                parsed = {}

    if isinstance(parsed, list):
        parsed = {"steps": parsed}
    if not isinstance(parsed, dict):
        parsed = {}

    return normalize_remediation_payload(parsed)


def get_artifact(payload: dict | None, artifact_id: str) -> dict | None:
    normalized = normalize_remediation_payload(payload)
    return next((artifact for artifact in normalized.get("artifacts", []) if artifact.get("id") == artifact_id), None)


def primary_rollback_script(payload: dict | None) -> str | None:
    artifact = next(
        (
            artifact
            for artifact in normalize_remediation_payload(payload).get("artifacts", [])
            if artifact.get("purpose") == "rollback"
        ),
        None,
    )
    return artifact.get("content") if artifact else None


def artifact_media_type(artifact: dict) -> str:
    kind = artifact.get("kind")
    language = artifact.get("language")
    if kind == "terraform" or language == "hcl":
        return "text/plain; charset=utf-8"
    if language in {"bash", "sh", "shell"} or kind == "shell":
        return "text/x-sh; charset=utf-8"
    return "text/plain; charset=utf-8"
