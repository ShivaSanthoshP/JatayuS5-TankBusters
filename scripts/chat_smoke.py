"""End-to-end smoke test for the SRE Copilot chat endpoint.

Usage:
    python scripts/chat_smoke.py [base_url]

Default base_url: http://localhost:8000

Exercises one prompt per capability bundle. Pass = every prompt produced a
non-empty assistant text and no stream error.
"""

import json
import sys
import uuid
import urllib.request

PROMPTS = [
    ("read",       "Give me a one-line overview of the system right now."),
    ("operations", "List my critical nodes."),
    ("diagnostic", "Pick any node and explain in one sentence what its status means. Don't act, just explain."),
    ("admin",      "Are all my data sources connected?"),
]


def stream_chat(base_url: str, session_id: str, prompt: str) -> dict:
    body = json.dumps({
        "session_id": session_id,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    req = urllib.request.Request(
        f"{base_url}/api/chat", data=body,
        headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
        method="POST",
    )
    text = ""
    tools: list[dict] = []
    with urllib.request.urlopen(req, timeout=120) as resp:
        for raw in resp:
            line = raw.decode("utf-8").strip()
            if not line.startswith("data:"):
                continue
            payload = json.loads(line[len("data:"):].strip())
            event = payload.get("event")
            if event == "token":
                text += payload["data"].get("text", "")
            elif event == "tool_result":
                tools.append(payload["data"])
            elif event == "done":
                break
            elif event == "error":
                return {"text": text, "tools": tools, "error": payload["data"].get("message")}
    return {"text": text, "tools": tools, "error": None}


def main() -> None:
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
    session_id = str(uuid.uuid4())
    failures: list[str] = []
    for label, prompt in PROMPTS:
        try:
            r = stream_chat(base_url, session_id, prompt)
        except Exception as exc:  # noqa: BLE001
            print(f"[{label:10}] FAIL — {prompt}  ({exc})")
            failures.append(label)
            continue
        ok = bool(r["text"]) and not r["error"]
        print(f"[{label:10}] {'PASS' if ok else 'FAIL'} — {prompt}")
        if not ok and r["error"]:
            print(f"             error: {r['error']}")
        if not ok:
            failures.append(label)
    if failures:
        print(f"\nFailures: {failures}", file=sys.stderr)
        sys.exit(1)
    print("\nAll smoke prompts passed.")


if __name__ == "__main__":
    main()
