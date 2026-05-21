"""Contract test: the guardrail prompt must carry the scope, refusal,
clarification, and answer-quality rules the copilot depends on."""

from app.chat.prompt import SRE_COPILOT_SYSTEM_PROMPT


def test_prompt_is_nonempty_string():
    assert isinstance(SRE_COPILOT_SYSTEM_PROMPT, str)
    assert len(SRE_COPILOT_SYSTEM_PROMPT) > 200


def test_prompt_defines_persona_and_scope():
    p = SRE_COPILOT_SYSTEM_PROMPT.lower()
    assert "sre copilot" in p
    # In scope: this platform's operational surfaces + general SRE/DevOps.
    assert "incident" in p
    assert "runbook" in p
    assert "devops" in p
    assert "infrastructure" in p


def test_prompt_refuses_out_of_scope():
    p = SRE_COPILOT_SYSTEM_PROMPT.lower()
    assert "out of scope" in p
    assert "decline" in p          # one-sentence refusal
    assert "do not call any tool" in p


def test_prompt_asks_one_clarifying_question_when_vague():
    p = SRE_COPILOT_SYSTEM_PROMPT.lower()
    assert "vague" in p
    assert "clarifying question" in p


def test_prompt_has_answer_quality_rules():
    p = SRE_COPILOT_SYSTEM_PROMPT.lower()
    assert "never invent" in p     # don't fabricate platform facts
    assert "markdown" in p         # format structured data as markdown
