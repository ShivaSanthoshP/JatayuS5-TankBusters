from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.database.session import init_db

# Lifespan skipped on purpose (see test_chat_route.py) — keeps tests hermetic.
client = TestClient(app)

_VALID = {
    "title": "Thread Pool Starvation Recovery",
    "issue_type": "thread_pool_starvation",
    "problem_pattern": "worker threads are all blocked so requests queue and time out",
    "root_cause": "all worker threads are blocked on a slow downstream call",
    "causal_chain": ["downstream slows", "threads block waiting", "queue fills and times out"],
    "blast_radius": ["the affected service"],
    "blast_radius_severity": "high",
    "recommended_actions": [
        {"action": "Restart the service", "type": "restart_service", "priority": 1, "description": "clear blocked threads"},
    ],
    "remediation_summary": "Restart to clear blocked threads, then tune the pool.",
    "remediation_steps": [
        {"order": 1, "action": "Restart service", "action_type": "restart_service",
         "description": "clear the pool", "script": "sudo systemctl restart svc",
         "validation_command": "systemctl is-active svc", "estimated_duration_seconds": 30},
    ],
    "artifacts": [
        {"id": "apply", "name": "remediate.sh", "purpose": "apply", "content": "#!/usr/bin/env bash\necho hi\n"},
    ],
}


def test_create_seeded_runbook_persists_and_lists():
    init_db()
    with patch("app.memory.vector_store.get_memory"):
        r = client.post("/api/agents/runbooks", json=_VALID)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["is_seeded"] is True
        assert body["issue_type"] == "thread_pool_starvation"
        assert body["recommended_actions"][0]["action"] == "Restart the service"
        assert body["solution_steps"]  # composed from structured fields

        listing = client.get("/api/agents/runbooks").json()
        assert any(rb["id"] == body["id"] for rb in listing)


def test_create_duplicate_issue_type_conflicts():
    init_db()
    with patch("app.memory.vector_store.get_memory"):
        assert client.post("/api/agents/runbooks", json=_VALID).status_code == 201
        dup = client.post("/api/agents/runbooks", json=_VALID)
        assert dup.status_code == 409
        assert "already exists" in dup.json()["detail"]


def test_update_runbook_changes_fields():
    init_db()
    with patch("app.memory.vector_store.get_memory"):
        rid = client.post("/api/agents/runbooks", json=_VALID).json()["id"]
        edited = {**_VALID, "title": "Renamed Runbook", "blast_radius_severity": "medium"}
        r = client.put(f"/api/agents/runbooks/{rid}", json=edited)
        assert r.status_code == 200, r.text
        assert r.json()["title"] == "Renamed Runbook"
        assert r.json()["blast_radius_severity"] == "medium"


def test_delete_admin_authored_seeded_succeeds():
    init_db()
    with patch("app.memory.vector_store.get_memory"):
        rid = client.post("/api/agents/runbooks", json=_VALID).json()["id"]
        r = client.delete(f"/api/agents/runbooks/{rid}")
        assert r.status_code == 200, r.text
        assert client.get("/api/agents/runbooks").json() == [] or all(
            rb["id"] != rid for rb in client.get("/api/agents/runbooks").json()
        )


def test_delete_canonical_is_blocked():
    init_db()
    with patch("app.memory.vector_store.get_memory"):
        canon = {**_VALID, "issue_type": "memory_leak", "title": "Memory Leak (custom)"}
        rid = client.post("/api/agents/runbooks", json=canon).json()["id"]
        r = client.delete(f"/api/agents/runbooks/{rid}")
        assert r.status_code == 400
        assert "canonical" in r.json()["detail"].lower()
