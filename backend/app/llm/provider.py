from __future__ import annotations
"""
LLM provider abstraction.

Unifies Ollama, OpenAI, and Gemini behind a single `chat_json` call so
the agent pipeline can switch providers at runtime without any other
code change. Only one provider is active at a time, selected via
`settings.llm_provider`.

All calls are synchronous here; callers in async code wrap them in
`asyncio.to_thread` so the event loop is not blocked.
"""

import json
import logging
import re
from typing import Any

from app import config as _config

logger = logging.getLogger("itops.llm.provider")

PROVIDERS = ("ollama", "openai", "gemini")

# Matches the JSON object inside a ```json ... ``` or ``` ... ``` fence.
_FENCED_JSON = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL | re.IGNORECASE)


def parse_json_tolerant(text: str) -> dict | None:
    """Parse LLM output that is supposed to be JSON, tolerant of small-model quirks.

    Strategy: raw text → fenced code block → first balanced {...} substring.
    """
    if not text:
        return None

    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    fence_match = _FENCED_JSON.search(text)
    if fence_match:
        try:
            return json.loads(fence_match.group(1))
        except json.JSONDecodeError:
            pass

    first = text.find("{")
    last = text.rfind("}")
    if first != -1 and last != -1 and last > first:
        try:
            return json.loads(text[first : last + 1])
        except json.JSONDecodeError:
            pass

    return None


# ── Per-provider callers ────────────────────────────────────────────


def _call_ollama(prompt: str, model: str, temperature: float, *, base_url: str | None) -> dict | None:
    import ollama
    client = ollama.Client(host=base_url) if base_url else ollama
    response = client.chat(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        format="json",
        options={"temperature": temperature},
    )
    # ollama.Client.chat returns the same dict shape as module-level chat.
    text = response.get("message", {}).get("content", "") if isinstance(response, dict) else getattr(response, "message", {}).get("content", "")
    return parse_json_tolerant(text)


def _call_openai(prompt: str, model: str, temperature: float, *, api_key: str) -> dict | None:
    from openai import OpenAI
    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=temperature,
    )
    text = response.choices[0].message.content if response.choices else ""
    return parse_json_tolerant(text or "")


def _call_gemini(prompt: str, model: str, temperature: float, *, api_key: str) -> dict | None:
    from google import genai
    from google.genai import types as genai_types

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config=genai_types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=temperature,
        ),
    )
    text = getattr(response, "text", "") or ""
    return parse_json_tolerant(text)


# ── Gemini key-rotation fallback ────────────────────────────────────

def _is_rate_limit_error(exc: Exception) -> bool:
    """Return True for 429 / 503 / quota-exceeded errors from Gemini."""
    msg = str(exc).lower()
    for marker in ("429", "503", "quota", "resource exhausted", "rate limit", "service unavailable"):
        if marker in msg:
            return True
    try:
        from google.api_core.exceptions import ResourceExhausted, ServiceUnavailable
        if isinstance(exc, (ResourceExhausted, ServiceUnavailable)):
            return True
    except ImportError:
        pass
    return False


def _call_gemini_with_fallback(prompt: str, model: str, temperature: float, *, primary_key: str) -> dict | None:
    """Try primary Gemini key; on 429/503 rotate to stored fallback key."""
    try:
        from app.services.settings_service import settings as _settings
        stored_fallback = _settings.get_secret("fallback_api_key")
    except Exception:
        stored_fallback = ""
    backup = stored_fallback or _config.GEMINI_API_KEY_BACKUP
    keys = [k for k in [primary_key, backup] if k]
    last_exc: Exception | None = None
    for i, key in enumerate(keys):
        try:
            return _call_gemini(prompt, model, temperature, api_key=key)
        except Exception as exc:
            last_exc = exc
            if i < len(keys) - 1 and _is_rate_limit_error(exc):
                logger.warning("Gemini primary key rate-limited (%s), rotating to backup key", exc)
                continue
            raise
    if last_exc:
        raise last_exc
    return None


# ── Public API ──────────────────────────────────────────────────────


class ProviderConfigError(RuntimeError):
    """Raised when the selected provider is not configured (missing API key, etc.)."""


def _active_provider_config() -> dict[str, Any]:
    """Snapshot the active provider's effective runtime config from settings."""
    from app.services.settings_service import settings as _settings

    mode = (_settings.llm_mode or "online").lower()

    if mode == "local":
        return {
            "provider": "ollama",
            "model": _settings.ollama_model or "llama3.2:3b",
            "base_url": _settings.ollama_base_url,
        }

    # Online — detect provider from the free-text name the user entered.
    name = (_settings.online_provider_name or "gemini").lower()
    if "gemini" in name or "google" in name:
        return {
            "provider": "gemini",
            "model": _settings.gemini_model or "gemini-2.5-flash",
            "api_key": _settings.gemini_api_key or "",
        }
    # Any other name → OpenAI-compatible
    return {
        "provider": "openai",
        "model": _settings.openai_model or "gpt-4o-mini",
        "api_key": _settings.openai_api_key or "",
    }


def chat_json(prompt: str, *, temperature: float = 0.1) -> dict | None:
    """Send a prompt to the active LLM provider and return parsed JSON.

    Returns None on any failure (missing config, network error, non-JSON
    response). The pipeline degrades to its deterministic fallback.
    """
    cfg = _active_provider_config()
    provider = cfg["provider"]
    model = cfg["model"]

    try:
        if provider == "ollama":
            return _call_ollama(
                prompt, model, temperature, base_url=cfg.get("base_url") or None
            )
        if provider == "openai":
            if not cfg.get("api_key"):
                logger.warning("OpenAI selected but no API key configured")
                return None
            return _call_openai(prompt, model, temperature, api_key=cfg["api_key"])
        if provider == "gemini":
            if not cfg.get("api_key"):
                logger.warning("Gemini selected but no API key configured")
                return None
            return _call_gemini_with_fallback(prompt, model, temperature, primary_key=cfg["api_key"])
    except Exception as exc:
        logger.warning("%s call failed: %s", provider, exc)
        return None

    return None


def test_provider(provider: str, *, model: str | None = None, api_key: str | None = None, base_url: str | None = None) -> dict:
    """Ping the given provider with a trivial JSON prompt. Used by the UI's
    Test-connection button. Returns {ok, message, model}.
    """
    provider = (provider or "").lower()
    if provider not in PROVIDERS:
        return {"ok": False, "message": f"Unknown provider '{provider}'"}

    prompt = 'Return a JSON object of the form {"ok": true}. Nothing else.'

    try:
        if provider == "ollama":
            mdl = model or "llama3.2:3b"
            result = _call_ollama(prompt, mdl, 0.0, base_url=base_url)
            return {"ok": bool(result), "message": "Reachable" if result else "No JSON response", "model": mdl}
        if provider == "openai":
            if not api_key:
                return {"ok": False, "message": "API key required"}
            mdl = model or "gpt-4o-mini"
            result = _call_openai(prompt, mdl, 0.0, api_key=api_key)
            return {"ok": bool(result), "message": "Reachable" if result else "No JSON response", "model": mdl}
        if provider == "gemini":
            if not api_key:
                return {"ok": False, "message": "API key required"}
            mdl = model or "gemini-2.5-flash"
            result = _call_gemini(prompt, mdl, 0.0, api_key=api_key)
            return {"ok": bool(result), "message": "Reachable" if result else "No JSON response", "model": mdl}
    except Exception as exc:
        return {"ok": False, "message": str(exc)[:300]}

    return {"ok": False, "message": "unreachable"}


# ── Function-calling helpers (SRE Copilot chat) ─────────────────────

from dataclasses import dataclass, field


@dataclass
class ToolDecl:
    name: str
    description: str
    parameters_schema: dict  # JSON Schema for the args


@dataclass
class ToolCall:
    name: str
    args: dict
    # Opaque signature Gemini 2.5+ attaches to a functionCall part; must be
    # echoed back when the call is replayed in history (see _build_contents).
    thought_signature: bytes | None = None


@dataclass
class ChatWithToolsResponse:
    """Single Gemini turn result. Either text or tool calls; the
    orchestrator iterates until the model stops requesting tools."""
    text: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)


def _build_contents(messages: list[dict], tool_results: list[dict] | None) -> list:
    """Assemble the Gemini ``contents`` list for one function-calling turn.

    Gemini 2.5+ attaches an opaque ``thought_signature`` to every functionCall
    part it returns and rejects the next request (400 INVALID_ARGUMENT) unless
    that signature is echoed back when the call is replayed in history. Because
    we reconstruct the call from plain name/args, we must restore the captured
    signature onto the rebuilt part here.
    """
    from google.genai import types as gt

    contents: list = []
    for m in messages:
        role = "user" if m["role"] == "user" else "model"
        contents.append(gt.Content(role=role, parts=[gt.Part.from_text(text=m["content"])]))
    for tr in (tool_results or []):
        call_part = gt.Part.from_function_call(name=tr["name"], args=tr["args"])
        sig = tr.get("thought_signature")
        if sig:
            call_part.thought_signature = sig
        contents.append(gt.Content(role="model", parts=[call_part]))
        contents.append(gt.Content(role="user", parts=[
            gt.Part.from_function_response(name=tr["name"], response=tr["result"]),
        ]))
    return contents


def _parse_response(response) -> ChatWithToolsResponse:
    """Extract text + tool calls from a Gemini response, capturing each
    functionCall's ``thought_signature`` so it survives into the next turn."""
    out = ChatWithToolsResponse()
    for cand in (response.candidates or []):
        content = getattr(cand, "content", None)
        if content is None:
            continue
        for part in (content.parts or []):
            fn = getattr(part, "function_call", None)
            if fn is not None and getattr(fn, "name", None):
                out.tool_calls.append(ToolCall(
                    name=fn.name, args=dict(fn.args or {}),
                    thought_signature=getattr(part, "thought_signature", None),
                ))
            elif getattr(part, "text", None):
                out.text += part.text
    return out


def chat_with_tools(
    *,
    messages: list[dict],          # [{"role": "user"|"assistant", "content": "..."}]
    tools: list[ToolDecl],
    model: str,
    api_key: str,
    temperature: float = 0.0,
    tool_results: list[dict] | None = None,  # [{"name","args","result"}]
    system_instruction: str | None = None,
) -> ChatWithToolsResponse:
    """One Gemini turn with function-calling. Returns either text or tool calls.

    The caller owns the loop: execute tool calls, append results, call again.
    """
    from google import genai
    from google.genai import types as gt

    client = genai.Client(api_key=api_key)

    function_decls = [
        gt.FunctionDeclaration(
            name=t.name,
            description=t.description,
            parameters_json_schema=t.parameters_schema,
        )
        for t in tools
    ]
    config_kwargs: dict = {"temperature": temperature}
    if function_decls:
        config_kwargs["tools"] = [gt.Tool(function_declarations=function_decls)]
    if system_instruction:
        config_kwargs["system_instruction"] = system_instruction

    # On Gemini 2.5 Flash we disable thinking to cut latency and keep the tool
    # loop deterministic. This does NOT remove the thought_signature requirement
    # on replayed functionCall parts — that is handled by capturing and restoring
    # the signature (see _parse_response / _build_contents), which is what makes
    # the multi-turn tool loop correct regardless of the thinking setting.
    _ml = model.lower()
    if "2.5" in _ml and "flash" in _ml:
        config_kwargs["thinking_config"] = gt.ThinkingConfig(thinking_budget=0)

    contents = _build_contents(messages, tool_results)

    response = client.models.generate_content(
        model=model,
        contents=contents,
        config=gt.GenerateContentConfig(**config_kwargs),
    )

    return _parse_response(response)
