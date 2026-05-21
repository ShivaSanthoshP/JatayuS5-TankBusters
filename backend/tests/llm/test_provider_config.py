"""Offline checks for how chat_with_tools builds the Gemini request.

These mock the genai client so they run without a live key — they assert the
request *config*, not model behaviour. The key invariant: thinking is disabled
on 2.5 Flash so the multi-turn tool loop never trips the thought_signature
replay requirement (which 400s in production).
"""

import google.genai as genai

from app.llm.provider import chat_with_tools


class _FakeResp:
    candidates = []


def _patch_client(monkeypatch, sink):
    class FakeModels:
        def generate_content(self, *, model, contents, config):
            sink["config"] = config
            sink["contents"] = contents
            return _FakeResp()

    class FakeClient:
        def __init__(self, *args, **kwargs):
            self.models = FakeModels()

    # chat_with_tools does `from google import genai; genai.Client(...)`,
    # so patching the attribute on the module object intercepts it.
    monkeypatch.setattr(genai, "Client", FakeClient)


def test_thinking_disabled_for_flash(monkeypatch):
    sink = {}
    _patch_client(monkeypatch, sink)
    chat_with_tools(
        messages=[{"role": "user", "content": "hi"}],
        tools=[], model="gemini-2.5-flash", api_key="x",
    )
    tc = sink["config"].thinking_config
    assert tc is not None and tc.thinking_budget == 0


def test_thinking_left_default_for_pro(monkeypatch):
    sink = {}
    _patch_client(monkeypatch, sink)
    chat_with_tools(
        messages=[{"role": "user", "content": "hi"}],
        tools=[], model="gemini-2.5-pro", api_key="x",
    )
    # Pro can't fully disable thinking, so we must not force budget 0.
    assert sink["config"].thinking_config is None
