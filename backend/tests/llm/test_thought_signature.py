"""Gemini 2.5+ attaches an opaque ``thought_signature`` to each functionCall
part and REQUIRES it echoed back when that call is replayed in conversation
history. The tool loop reconstructs functionCall parts from name/args, so it
must (a) capture the signature from the model response and (b) restore it on
replay. These unit tests cover both halves without a live API call."""

from types import SimpleNamespace

from google.genai import types as gt

from app.llm.provider import _build_contents, _parse_response


def test_build_contents_restores_thought_signature_on_replay():
    tool_results = [{
        "name": "list_nodes", "args": {"status": "critical"},
        "result": {"ok": True}, "thought_signature": b"sig-xyz",
    }]
    contents = _build_contents([{"role": "user", "content": "critical nodes?"}], tool_results)
    fc_parts = [p for c in contents for p in (c.parts or [])
                if getattr(p, "function_call", None)]
    assert fc_parts, "expected a replayed functionCall part"
    assert fc_parts[0].thought_signature == b"sig-xyz"


def test_build_contents_without_signature_does_not_crash():
    # No signature present → the part simply has none; must not raise.
    tool_results = [{"name": "list_nodes", "args": {}, "result": {"ok": True}}]
    contents = _build_contents([{"role": "user", "content": "hi"}], tool_results)
    fc_parts = [p for c in contents for p in (c.parts or [])
                if getattr(p, "function_call", None)]
    assert fc_parts
    assert getattr(fc_parts[0], "thought_signature", None) is None


def test_parse_response_captures_thought_signature():
    part = gt.Part.from_function_call(name="list_nodes", args={"status": "critical"})
    part.thought_signature = b"sig-xyz"
    response = SimpleNamespace(
        candidates=[SimpleNamespace(content=gt.Content(role="model", parts=[part]))])
    parsed = _parse_response(response)
    assert parsed.tool_calls[0].name == "list_nodes"
    assert parsed.tool_calls[0].thought_signature == b"sig-xyz"
